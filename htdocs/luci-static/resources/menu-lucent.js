'use strict';
'require baseclass';
'require ui';

/*
 * Lucent builds its own sidebar from the ACL-filtered menu tree.
 *
 * Upstream themes get this for free by requiring `menu-bootstrap`, but that
 * module ships with luci-theme-bootstrap, not luci-base — on images without
 * the bootstrap theme the request rejects and #topmenu stays empty, leaving a
 * blank sidebar with no navigation at all.
 */

/* Nodes this package and luci-base always register, used when the tree itself
   could not be fetched. */
var FALLBACK = [
	{ path: 'admin/home', title: 'Home', icon: 'home' },
	{ path: 'admin/clients', title: 'Devices', icon: 'devices' },
	{ path: 'admin/system/appearance', title: 'Appearance', icon: 'sliders' },
	{ path: 'admin/logout', title: 'Logout', icon: 'x' }
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
		.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

return baseclass.extend({
	__init: function () {
		var self = this;

		if (!ui.menu || typeof ui.menu.load !== 'function') {
			this.renderFallback(_('Menu could not be loaded'));
			return;
		}

		ui.menu.load().then(function (tree) {
			self.render(tree);

			if (!document.querySelector('#topmenu li'))
				self.renderFallback(_('This account has no visible menu entries'));
		}).catch(function () {
			self.renderFallback(_('The menu could not be fetched'));
		});
	},

	render: function (tree) {
		var node = tree, url = '';

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
		var self = this;
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

	/* A dead-blank column is the one state the sidebar must never end up in, so
	   say why and keep the usable links available. */
	renderFallback: function (message) {
		var ul = document.querySelector('#topmenu');

		if (!ul || ul.children.length)
			return;

		ul.appendChild(E('li', { 'class': 'ltc-nav-note' }, message));

		FALLBACK.forEach(function (item) {
			ul.appendChild(E('li', {}, [
				E('a', { 'href': L.url(item.path), 'title': _(item.title) }, _(item.title))
			]));
		});
	}
});
