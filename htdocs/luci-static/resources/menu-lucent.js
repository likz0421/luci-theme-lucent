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
 *
 * LuCI reloads the whole document on every menu click, so each page had to
 * wait for the menu RPC again before the sidebar showed anything — seconds of
 * empty column on a loaded device, which reads as "the menu disappeared".
 * The tree is therefore kept in localStorage under the session id and painted
 * synchronously on the next page load, then reconciled with the network.
 * Nothing clears the sidebar until a replacement tree is already rendered.
 */


/* Bumped whenever this module changes materially: the sidebar note prints it,
   so "am I actually running the new JS?" has a visible answer. It also keys
   the cache, so an upgrade cannot repaint an obsolete structure. */
var BUILD = 11;
var CACHE = 'lucent.menu';


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

/* top-level entries, ignoring the explanatory note so a fallback menu still
   counts as "the sidebar is not empty" */
function entries(el) {
	var n = 0;

	if (el) {
		for (var i = 0; i < el.children.length; i++) {
			if (!el.children[i].classList || !el.children[i].classList.contains('ltc-nav-note'))
				n++;
		}
	}

	return n;
}

/* The menu tree is filtered by the caller's ACL, so it is cached per session
   and dies with that session — a different user never sees it. */
function cacheKey() {
	var sid = '';

	try {
		sid = String((L.env && L.env.sessionid) ||
			(L.session && typeof L.session.getID === 'function' ? L.session.getID() : '') || '');
	} catch (e) {
		sid = '';
	}

	if (!sid || /^0+$/.test(sid))
		sid = 'anon';

	return '%s.%s'.format(CACHE, sid);
}

return baseclass.extend({
	/* Nothing here may throw. A synchronous error at instantiation time makes
	   L.require('menu-lucent') reject, which means not one line of the fallback
	   logic below ever runs — and the sidebar shows neither a menu nor a reason,
	   which is exactly what a stripped ONT build produced. */
	__init: function () {
		var self = this;

		this.reason = '';
		this.busy = false;
		this.live = '';
		this.storeErr = '';

		try {
			/* paint before anything is awaited: on every page after the first
			   this is what keeps the sidebar from going blank */
			this.fromCache = this.restore();

			this.build();
		} catch (e) {
			this.reason = 'init: ' + String(e && e.message || e);
			try {
				if (!entries(document.querySelector('#topmenu')))
					this.renderBuiltin();
			} catch (e2) {}
			return;
		}

		/* Last resort: by now every deadline above has expired, so an empty
		   menu here means something else cleared it. Rebuild once, no more. */
		setTimeout(function () {
			try {
				if (!self.retried && !entries(document.querySelector('#topmenu'))) {
					self.retried = true;
					self.busy = false;
					self.build();
				}
			} catch (e) {}
		}, 12000);
	},

	/* One build at a time: the watchdog and the last-resort timer must not
	   start a second chain that then races the first over the sidebar. */
	build: function () {
		var self = this;

		if (!document.querySelector('#topmenu') || this.busy)
			return;

		this.busy = true;

		this.loadTree().then(function (tree) {
			self.busy = false;

			if (tree) {
				try {
					if (self.commit(tree))
						return;

					/* the router answered, and what it answered with has no sidebar in
					   it: that outranks whatever this browser remembered */
					self.reason = self.reason || _('The menu service returned no entries');
					self.forget();
					self.fromCache = false;
					self.renderBuiltin();
					return;
				} catch (e) {
					self.reason = 'render: ' + String(e && e.message || e);

					if (self.fromCache) {
						self.annotate(self.reason);
						return;
					}
				}
			}

			/* no source answered: the static menu if there is nothing else, otherwise
			   the cached menu stays put and simply admits it is no longer fresh */
			if (!entries(document.querySelector('#topmenu'))) {
				self.reason = self.reason || _('The menu service returned no entries');
				self.renderBuiltin();
			}
			else if (self.fromCache)
				self.annotate(self.reason);
		}, function (err) {
			self.busy = false;
			self.reason = String(err && err.message || err);

			/* a menu already on screen stays — it is simply no longer fresh */
			if (!entries(document.querySelector('#topmenu')))
				self.renderBuiltin();
			else if (self.fromCache)
				self.annotate(self.reason);
		});
	},

	/* Three sources, in order of trust: LuCI's menu class, then the raw
	   endpoint it reads from, so a broken cache or a forked wrapper cannot
	   blank the sidebar. */
	loadTree: function () {
		var self = this;

		if (ui.menu && typeof ui.menu.load === 'function') {
			return withTimeout(ui.menu.load(), 2500, 'ui.menu.load()').catch(function (err) {
				self.reason = 'ui.menu: ' + String(err && err.message || err);
				return withTimeout(self.fetchTree(), 5000, 'admin/menu').catch(function (err2) {
					self.reason += '; ' + String(err2 && err2.message || err2);
					return null;
				});
			});
		}

		this.reason = _('This LuCI build exposes no menu class');
		return withTimeout(this.fetchTree(), 5000, 'admin/menu').catch(function (err) {
			self.reason += '; ' + String(err && err.message || err);
			return null;
		});
	},

	fetchTree: function () {
		var url = L.url('admin/menu');
		var self = this;

		return new Promise(function (resolve, reject) {
			var req = new XMLHttpRequest();

			req.open('GET', url, true);
			req.timeout = 6000;
			req.onload = function () {
				if (req.status === 401 || req.status === 403) {
					self.forget();
					reject(new Error('%s → HTTP %d'.format(url, req.status)));
					return;
				}
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

	/* Rendered into detached containers first, so a tree that turns out to be
	   empty cannot leave the sidebar blanker than it was before. */
	openSlots: function () {
		this.slots = {
			top: E('ul'),
			mode: E('ul'),
			tabs: E('div')
		};
	},

	slot: function (name) {
		return (this.slots && this.slots[name]) || document.querySelector(
			name === 'top' ? '#topmenu' : name === 'mode' ? '#modemenu' : '#tabmenu');
	},

	commitSlots: function () {
		var targets = { top: '#topmenu', mode: '#modemenu', tabs: '#tabmenu' };
		var self = this;

		Object.keys(targets).forEach(function (k) {
			var live = document.querySelector(targets[k]);
			var src = self.slots[k];

			if (!live || !src)
				return;

			live.textContent = '';

			while (src.firstChild)
				live.appendChild(src.firstChild);

			live.style.display = src.style.display;
		});

		this.slots = null;
	},

	/* Render into detached containers first and normalise the tree only after
	   that: childrenOf() fills in the node names as it goes, so comparing the
	   two trees in the same shape is what lets an unchanged menu stay perfectly
	   still instead of replaying its entrance animation. */
	preflight: function (tree) {
		var json = '';

		this.openSlots();

		try {
			this.render(tree);

			if (entries(this.slots.top)) {
				try {
					json = JSON.stringify(tree);
				} catch (e) {
					json = '';
				}
			}
		} finally {
			if (!json)
				this.slots = null;
		}

		return json;
	},

	paint: function (tree) {
		var json = this.preflight(tree);

		if (!json)
			return false;

		this.commitSlots();
		this.live = json;

		return true;
	},

	/* A tree that produces no sidebar is not "nothing changed" — it is the
	   router contradicting the copy we painted, so the caller has to replace it
	   rather than leave a ghost menu standing. */
	commit: function (tree) {
		var json = this.preflight(tree);
		var src = this.fromCache ? 'cache+tree' : 'tree';

		if (!json)
			return false;

		if (json === this.live) {
			this.slots = null;
			this.report(src);
			return true;
		}

		this.commitSlots();
		this.live = json;
		this.save(json);
		this.report(src);

		return true;
	},

	save: function (json) {
		var key = this.key();

		try {
			/* one copy per browser: entries left by earlier sessions would only
			   grow the quota */
			Object.keys(localStorage).forEach(function (k) {
				if (k.indexOf(CACHE + '.') === 0 && k !== key)
					localStorage.removeItem(k);
			});

			localStorage.setItem(key, JSON.stringify({ b: BUILD, d: json }));
		} catch (e) {
			/* private mode and a few stripped-down embedded browsers refuse
			   localStorage outright; then the instant paint can never happen and
			   every page waits for the router — so the marker has to say so */
			this.storeErr = String(e && e.message || e);
		}
	},

	forget: function () {
		this.live = '';

		try {
			localStorage.removeItem(this.key());
		} catch (e) {}
	},

	key: function () {
		if (!this.cached)
			this.cached = cacheKey();

		return this.cached;
	},

	/* Returns true when the sidebar was repainted from this browser's copy. */
	restore: function () {
		var raw, rec;

		try {
			raw = localStorage.getItem(this.key());
		} catch (e) {
			this.storeErr = String(e && e.message || e);
			return false;
		}

		if (!raw)
			return false;

		try {
			rec = JSON.parse(raw);
		} catch (e) {
			this.forget();
			return false;
		}

		if (!rec || rec.b !== BUILD || !rec.d) {
			this.forget();
			return false;
		}

		var tree;

		try {
			tree = JSON.parse(rec.d);
		} catch (e) {
			this.forget();
			return false;
		}

		if (!this.paint(tree)) {
			this.forget();
			return false;
		}

		this.report('cache');

		return true;
	},

	/* The cached menu stays useful even when the router stops answering, but it
	   has to say so — otherwise a removed package keeps a ghost entry that nobody
	   can explain. */
	annotate: function (why) {
		var ul = document.querySelector('#topmenu');
		var self = this;

		if (!ul || ul.querySelector('.ltc-nav-note'))
			return;

		var note = E('li', { 'class': 'ltc-nav-note' }, [
			E('span', {}, _('This menu is restored from this browser; the router did not answer.')),
			E('small', {}, '%s · #menu%d'.format(String(why || ''), BUILD))
		]);

		note.appendChild(E('button', {
			'type': 'button', 'class': 'ltc-btn sm', 'style': 'margin-top:7px',
			'click': function () {
				self.forget();
				self.busy = false;
				self.build();
			}
		}, _('Retry')));

		ul.appendChild(note);
	},

	/* The footer line is the only place on the router that can answer "which
	   code drew this menu, and when" without a developer console — so it says
	   it even when everything worked. `cache` / `tree` / `builtin` plus the
	   time of that paint is what separates "the router is slow" from "this
	   browser never got the new JS" from "the tree never loads here". */
	report: function (src) {
		var now = Math.round(window.performance && performance.now ? performance.now() : 0);
		var state;

		if (this.first == null)
			this.first = now;

		state = util.markMenu(src, '#menu' + BUILD, this.first, this.storeErr ? 'cache:off' : '');
		state.build = BUILD;
		state.reason = this.reason;
	},

	render: function (tree) {
		this.renderModeMenu(tree);

		/* renderModeMenu only builds the sidebar for the root child whose name
		   equals requestpath[0]. Forked builds key that differently (or leave
		   the path empty), and then nothing matched and the menu stayed blank
		   even though the tree was fine — so render the first root child that
		   actually has entries. */
		if (!entries(this.slot('top'))) {
			var roots = childrenOf(tree);

			for (var i = 0; i < roots.length; i++) {
				this.renderMainMenu(roots[i], roots[i].name);
				if (entries(this.slot('top')))
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
		var container = this.slot('tabs');
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
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : this.slot('top');
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
		var ul = this.slot('mode');
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
		this.slots = null;

		util.builtinMenu(document.querySelector('#topmenu'), {
			reason: (this.reason ? this.reason + ' · ' : '') + '#menu' + BUILD,
			onRetry: L.bind(function () {
				if (ui.menu && typeof ui.menu.flushCache === 'function') {
					try { ui.menu.flushCache(); } catch (e) {}
				}
				try { sessionStorage.clear(); } catch (e) {}
				this.forget();
				this.live = '';
				this.busy = false;
				this.build();
			}, this)
		});

		this.report('builtin');
	}
});
