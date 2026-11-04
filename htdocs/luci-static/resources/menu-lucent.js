'use strict';
'require baseclass';
'require lucent.util as util';
'require ui';

/*
 * Lucent builds its own sidebar from the ACL-filtered menu tree.
 *
 * Upstream themes get this for free by requiring `menu-bootstrap`, but that
 * module ships with luci-theme-bootstrap, not luci-base — on images without
 * the bootstrap theme the request rejects and #topmenu stays empty. Worse,
 * `ui.menu.load()` can fail on its own (session storage blocked, a forked
 * luci-base, a cached empty tree), and a blank sidebar is the one state this
 * theme must never show. So the builder tries three sources in order and
 * falls back to a static menu of the nodes every stock LuCI registers, while
 * saying out loud which step failed.
 */


function childrenOf(tree) {
	if (ui.menu && typeof ui.menu.getChildren === 'function') {
		try {
			return ui.menu.getChildren(tree) || [];
		} catch (e) {
			return [];
		}
	}

	return Object.keys((tree && tree.children) || {})
		.map(function (k) { return tree.children[k]; })
		.filter(function (c) { return c && c.satisfied !== false && c.title != null; })
		.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

/* A request that never answers is worse than one that fails: the promise
   never settles, so neither the menu nor the fallback is ever drawn and the
   sidebar stays blank forever. Every source therefore gets a deadline. */
function withTimeout(promise, ms, label) {
	return new Promise(function (resolve, reject) {
		var settled = false;

		var timer = setTimeout(function () {
			if (settled)
				return;
			settled = true;
			reject(new Error('%s → %s %dms'.format(label, _('timed out'), ms)));
		}, ms);

		/* a forked ui.menu can return a plain object instead of a promise */
		Promise.resolve(promise).then(function (v) {
			if (settled)
				return;
			settled = true;
			clearTimeout(timer);
			resolve(v);
		}, function (e) {
			if (settled)
				return;
			settled = true;
			clearTimeout(timer);
			reject(e);
		});
	});
}

function pathOf(list) {
	return Array.isArray(list) ? list : [];
}

return baseclass.extend({
	/* Nothing here may throw. A synchronous error at instantiation time makes
	   L.require('menu-lucent') reject, which means not one line of the fallback
	   logic below ever runs — and the sidebar shows neither a menu nor a reason,
	   which is exactly what a stripped ONT build produced. */
	__init: function () {
		var self = this;

		this.reason = '';

		try {
			this.build();
		} catch (e) {
			this.reason = 'init: ' + String(e && e.message || e);
			try {
				this.renderBuiltin();
			} catch (e2) {}
			return;
		}

		/* Last resort: by now every deadline above has expired, so an empty
		   menu here means something else cleared it. Rebuild once, no more. */
		setTimeout(function () {
			try {
				if (!self._retried && !document.querySelector('#topmenu li')) {
					self._retried = true;
					self.build();
				}
			} catch (e) {}
		}, 12000);
	},

	build: function () {
		var self = this;
		var ul = document.querySelector('#topmenu');

		if (!ul)
			return;

		/* retries must not stack menus on top of a failed attempt */
		ul.textContent = '';
		var modes = document.querySelector('#modemenu');
		if (modes)
			modes.textContent = '';
		var tabs = document.querySelector('#tabmenu');
		if (tabs)
			tabs.textContent = '';

		this.reason = '';

		this.loadTree().then(function (tree) {
			try {
				if (tree)
					self.render(tree);
			} catch (e) {
				self.reason = 'render: ' + String(e && e.message || e);
			}

			if (!document.querySelector('#topmenu li')) {
				self.reason = self.reason || _('The menu service returned no entries');
				self.renderBuiltin();
			}
		}).catch(function (err) {
			self.reason = String(err && err.message || err);
			self.renderBuiltin();
		});
	},

	/* Three sources, in order of trust: LuCI's menu class, then the raw
	   endpoint it reads from, so a broken cache or a forked wrapper cannot
	   blank the sidebar. */
	loadTree: function () {
		var self = this;

		if (ui.menu && typeof ui.menu.load === 'function') {
			return withTimeout(ui.menu.load(), 4000, 'ui.menu.load()').catch(function (err) {
				self.reason = 'ui.menu: ' + String(err && err.message || err);
				return withTimeout(self.fetchTree(), 6000, 'admin/menu').catch(function (err2) {
					self.reason += '; ' + String(err2 && err2.message || err2);
					return null;
				});
			});
		}

		this.reason = _('This LuCI build exposes no menu class');
		return withTimeout(this.fetchTree(), 6000, 'admin/menu').catch(function (err) {
			self.reason += '; ' + String(err && err.message || err);
			return null;
		});
	},

	fetchTree: function () {
		var url = L.url('admin/menu');

		return new Promise(function (resolve, reject) {
			var req = new XMLHttpRequest();

			req.open('GET', url, true);
			req.timeout = 8000;
			req.onload = function () {
				if (req.status < 200 || req.status >= 400) {
					reject(new Error('%s → HTTP %d'.format(url, req.status)));
					return;
				}
				try {
					resolve(JSON.parse(req.responseText));
				} catch (e) {
					reject(new Error(_('The menu endpoint did not return JSON')));
				}
			};
			req.onerror = req.ontimeout = function () {
				reject(new Error('%s %s'.format(_('Cannot reach'), url)));
			};
			req.send();
		});
	},

	render: function (tree) {
		this.renderModeMenu(tree);

		/* renderModeMenu only builds the sidebar for the root child whose name
		   equals requestpath[0]. Forked builds key that differently (or leave
		   the path empty), and then nothing matched and the menu stayed blank
		   even though the tree was fine — so render the first root child that
		   actually has entries. */
		if (!document.querySelector('#topmenu li')) {
			var roots = childrenOf(tree);

			for (var i = 0; i < roots.length; i++) {
				this.renderMainMenu(roots[i], roots[i].name);
				if (document.querySelector('#topmenu li'))
					break;
			}

			if (roots.length)
				this.reason = 'matched no root branch (requestpath=%s, roots=%s)'.format(
					(L.env.requestpath || []).join('/') || '∅',
					roots.map(function (r) { return r.name; }).join(','));
		}

		this.renderTabs(tree);
	},

	renderTabs: function (tree) {
		var node = tree;
		var url = '';

		if (pathOf(L.env.dispatchpath).length < 3)
			return;

		var dp = pathOf(L.env.dispatchpath);
		for (var i = 0; i < 3 && node; i++) {
			node = (node.children || {})[dp[i]];
			url += (url ? '/' : '') + dp[i];
		}

		if (node)
			this.renderTabMenu(node, url);
	},

	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu');
		var activeNode = null;
		var items = [];

		if (!container)
			return;

		childrenOf(tree).forEach(function (child) {
			var isActive = (pathOf(L.env.dispatchpath)[3 + (level || 0)] === child.name);

			items.push(E('li', {
				'class': 'tabmenu-item-%s%s'.format(child.name, isActive ? ' active' : '')
			}, E('a', { 'href': L.url(url, child.name) }, _(child.title))));

			if (isActive)
				activeNode = child;
		});

		if (!items.length)
			return;

		container.appendChild(E('ul', { 'class': 'tabs' }, items));
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);
	},

	renderMainMenu: function (tree, url, level) {
		var self = this;
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu');
		var kids = childrenOf(tree);

		if (!ul || !kids.length || level > 1)
			return E([]);

		kids.forEach(function (child) {
			var submenu = self.renderMainMenu(child, url + '/' + child.name, (level || 0) + 1);
			var group = !level && submenu.firstElementChild;

			ul.appendChild(E('li', { 'class': group ? 'dropdown' : '' }, [
				E('a', {
					'class': group ? 'menu' : '',
					'href': group ? '#' : L.url(url, child.name)
				}, _(child.title)),
				submenu
			]));
		});

		ul.style.display = '';

		return ul;
	},

	renderModeMenu: function (tree) {
		var ul = document.querySelector('#modemenu');
		var self = this;

		if (!ul)
			return;

		childrenOf(tree).forEach(function (child, index) {
			var isActive = pathOf(L.env.requestpath).length
				? child.name === pathOf(L.env.requestpath)[0]
				: index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, _(child.title))
			]));

			if (isActive)
				self.renderMainMenu(child, child.name);
		});

		if (ul.children.length > 1)
			ul.style.display = '';
	},

	/* The static menu: same DOM as the real one, so icons, the accordion and
	   the command palette all keep working. */
	renderBuiltin: function () {
		util.builtinMenu(document.querySelector('#topmenu'), {
			reason: this.reason,
			onRetry: L.bind(function () {
				if (ui.menu && typeof ui.menu.flushCache === 'function') {
					try { ui.menu.flushCache(); } catch (e) {}
				}
				try { sessionStorage.clear(); } catch (e) {}
				this.build();
			}, this)
		});
	}
});
