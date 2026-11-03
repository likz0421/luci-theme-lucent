'use strict';
'require baseclass';
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

/* A usable sidebar even when the menu service is gone: the standard LuCI
   modules plus this theme's own pages, at their stock paths. */
var BUILTIN = [
	{ title: 'Home', path: 'admin/home', icon: 'home' },
	{ title: 'Devices', path: 'admin/clients', icon: 'devices' },
	{ title: 'Status', path: 'admin/status', icon: 'info', kids: [
		{ title: 'Overview', path: 'admin/status/overview' },
		{ title: 'Realtime', path: 'admin/status/realtime/load' },
		{ title: 'System log', path: 'admin/status/syslog' }
	] },
	{ title: 'Network', path: 'admin/network', icon: 'network', kids: [
		{ title: 'Interfaces', path: 'admin/network/network' },
		{ title: 'Wireless', path: 'admin/network/wireless' },
		{ title: 'DHCP leases', path: 'admin/network/dhcp' },
		{ title: 'Routes', path: 'admin/network/routes' }
	] },
	{ title: 'System', path: 'admin/system', icon: 'sliders', kids: [
		{ title: 'System', path: 'admin/system/system' },
		{ title: 'Administration', path: 'admin/system/admin' },
		{ title: 'Software', path: 'admin/system/packages' },
		{ title: 'Reboot', path: 'admin/system/reboot' }
	] },
	{ title: 'Appearance', path: 'admin/system/appearance', icon: 'image' },
	{ title: 'Logout', path: 'admin/logout', icon: 'x' }
];

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

return baseclass.extend({
	__init: function () {
		var self = this;

		this.reason = '';
		this.build();

		/* If something else cleared or raced the menu, one retry is cheap. */
		setTimeout(function () {
			if (!document.querySelector('#topmenu li'))
				self.build();
		}, 4000);
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
			if (tree)
				self.render(tree);

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
			return ui.menu.load().catch(function (err) {
				self.reason = 'ui.menu: ' + String(err && err.message || err);
				return self.fetchTree();
			});
		}

		this.reason = _('This LuCI build exposes no menu class');
		return this.fetchTree();
	},

	fetchTree: function () {
		var self = this;
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
		}).catch(function (err) {
			self.reason = self.reason ? self.reason + '; ' + String(err.message || err) : String(err.message || err);
			return null;
		});
	},

	render: function (tree) {
		var node = tree;
		var url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = (node.children || {})[L.env.dispatchpath[i]];
				url += (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu');
		var activeNode = null;
		var items = [];

		if (!container)
			return;

		childrenOf(tree).forEach(function (child) {
			var isActive = (L.env.dispatchpath[3 + (level || 0)] === child.name);

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
			var isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0]
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
		var ul = document.querySelector('#topmenu');
		var self = this;

		if (!ul)
			return;

		ul.textContent = '';

		ul.appendChild(E('li', { 'class': 'ltc-nav-note' }, [
			E('span', {}, _('The live menu could not be loaded, showing the built-in navigation instead.')),
			this.reason ? E('small', {}, this.reason) : '',
			E('button', {
				'type': 'button', 'class': 'ltc-btn sm', 'style': 'margin-top:7px',
				'click': function () {
					if (ui.menu && typeof ui.menu.flushCache === 'function') {
						try { ui.menu.flushCache(); } catch (e) {}
					}
					try { sessionStorage.clear(); } catch (e) {}
					self.build();
				}
			}, _('Retry'))
		]));

		BUILTIN.forEach(function (item) {
			var kids = (item.kids || []).map(function (k) {
				return E('li', {}, E('a', { 'href': L.url(k.path) }, _(k.title)));
			});

			ul.appendChild(E('li', { 'class': kids.length ? 'dropdown' : '' }, [
				E('a', {
					'class': kids.length ? 'menu' : '',
					'href': kids.length ? '#' : L.url(item.path),
					'title': _(item.title)
				}, _(item.title)),
				kids.length ? E('ul', { 'class': 'dropdown-menu' }, kids) : ''
			]));
		});
	}
});
