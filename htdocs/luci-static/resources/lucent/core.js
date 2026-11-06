'use strict';
'require baseclass';
'require uci';
'require rpc';
'require lucent.util as util';

var callCommit = rpc.declare({ object: 'uci', method: 'commit', params: ['config'] });

/* Sidebar menu icons keyed by the first path segment after /admin/. */
var MENU_ICONS = {
	home: 'home',
	clients: 'devices',
	status: 'info',
	system: 'sliders',
	network: 'network',
	services: 'globe',
	vpn: 'shield',
	logout: 'x'
};

/* The rail rule, in one place:
   - below 981px the sidebar is a drawer, so rail must never apply at all;
   - an explicit choice the user made with the toggle always wins;
   - otherwise a laptop-width window (981–1280px) starts collapsed, because
     264px of menu plus content is cramped there, and wider screens start open.
   header.ut repeats this in an inline script so the first paint does not
   flash from full to collapsed; tests/harness.html asserts the two thresholds
   agree, because that is exactly the kind of pair that drifts. */
var RAIL_MIN = 981;
var RAIL_AUTO_MAX = 1281;

function railAuto() {
	var root = document.documentElement;
	var pref = null;

	if (window.innerWidth < RAIL_MIN)
		return;
	try {
		pref = localStorage.getItem('lucent.rail');
	} catch (e) {}

	if (pref === '0' || pref === '1')
		root.dataset.rail = pref;
	else
		root.dataset.rail = window.innerWidth < RAIL_AUTO_MAX ? '1' : '0';
}

/* Small, dependency-light front-end helpers shared by the theme pages. */
return baseclass.extend({
	init: function () {
		var body = document.body;

		document.querySelectorAll('[data-ltc-menu]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				body.classList.toggle('ltc-menu-open');
			});
		});

		body.addEventListener('click', function (ev) {
			/* a tap on an icon reaches this handler as the svg or its path, not
			   as the button the pointer appears to have hit, so the dismissal has
			   to work from whatever element was targeted — the phone test taps an
			   icon on purpose */
			var host = ev.target;

			if (body.classList.contains('ltc-menu-open') &&
			    !host.closest('.ltc-side') &&
			    !host.closest('[data-ltc-menu]'))
				body.classList.remove('ltc-menu-open');

			if (host.closest('.ltc-side a, .ltc-dock a'))
				body.classList.remove('ltc-menu-open');
		});

		document.querySelectorAll('[data-ltc-theme]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var root = document.documentElement;
				var cur = root.dataset.mode || 'auto';
				var next = cur === 'auto' ? 'light' : (cur === 'light' ? 'dark' : 'auto');
				var dark = next === 'dark' ||
					(next === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
				root.dataset.mode = next;
				root.dataset.theme = dark ? 'dark' : 'light';
				btn.title = '%s · %s'.format(_('Toggle appearance'), next === 'auto' ? _('Auto') : (next === 'light' ? _('Light') : _('Dark')));
				uci.load('lucent').then(function () {
					uci.set('lucent', 'main', 'mode', next);
					return uci.save().then(function () { return callCommit('lucent'); });
				}).catch(function () {});
			});
		});

		if (document.documentElement.dataset.mode === 'auto' && window.matchMedia) {
			var mq = window.matchMedia('(prefers-color-scheme: dark)');
			var follow = function (ev) {
				if (document.documentElement.dataset.mode === 'auto')
					document.documentElement.dataset.theme = ev.matches ? 'dark' : 'light';
			};
			if (mq.addEventListener)
				mq.addEventListener('change', follow);
			else if (mq.addListener)
				mq.addListener(follow);
		}

		/* Accordion sidebar: a group header toggles its own submenu open/closed
		   instead of navigating away. Delegation so it works once the menu is
		   populated asynchronously by LuCI's core. */
		body.addEventListener('click', function (ev) {
			var a = ev.target.closest && ev.target.closest('.ltc-nav a.menu');
			if (!a)
				return;
			var li = a.parentElement;
			if (li && li.querySelector(':scope > ul.dropdown-menu')) {
				ev.preventDefault();
				ev.stopPropagation();
				li.classList.toggle('open');
				/* In rail mode the flyout follows :hover/:focus-within; without
				   this blur the clicked header keeps focus and the panel hangs
				   open even after the mouse leaves. */
				if (document.documentElement.dataset.rail === '1')
					a.blur();
			}
		}, true);

		body.addEventListener('click', function (ev) {
			var a = ev.target.closest && ev.target.closest('.ltc-nav ul.dropdown-menu a');
			if (a)
				setTimeout(function () {
					if (document.activeElement === a) {
						try { a.blur(); } catch (e) {}
					}
				}, 60);
		});

		this.markActive();
		this.observeMenu();
		this.initSearch();
		this.initRail();
		this.watchMenu();
	},

	/* Independent safety net. menu-lucent already has its own fallbacks, but if
	   that module never loads (404, a half-written cache copy, a parse error)
	   nothing else would speak for the sidebar — and an empty column with no
	   explanation is the one outcome users cannot act on. */
	watchMenu: function () {
		if (this._watching)
			return;
		this._watching = true;

		var empty = function () {
			var ul = document.querySelector('#topmenu');
			return !!ul && !ul.children.length;
		};

		setTimeout(function () {
			if (!empty())
				return;
			L.require('menu-lucent').then(function (m) {
				if (m && typeof m.build === 'function')
					m.build();
			}).catch(function () {});
		}, 7000);

		/* the module never loaded, or loaded and produced nothing: give the
		   sidebar a usable menu anyway */
		setTimeout(function () {
			var ul = document.querySelector('#topmenu');

			if (!ul)
				return;

			if (!ul.children.length) {
				util.builtinMenu(ul, {
					reason: _('The sidebar menu could not be loaded.') + ' · #core',
					owner: '#core',
					onRetry: function () { location.reload(); }
				});
				return;
			}

			/* entries exist but occupy no pixels: that is a layout failure, not a
			   menu failure, and from the outside the two look identical — so name
			   which one it is rather than let everyone debug the wrong layer */
			if (ul.getBoundingClientRect().height < 8 && !ul.querySelector('.ltc-nav-note')) {
				ul.appendChild(E('li', { 'class': 'ltc-nav-note' }, [
					E('span', {}, _('The menu is in the page but not visible.')),
					E('small', {}, '%d items · %dpx · #core'.format(ul.children.length,
						Math.round(ul.getBoundingClientRect().height)))
				]));
			}
		}, 16000);
	},

	initSearch: function () {
		if (this._searchReady)
			return;
		this._searchReady = true;

		var open = null, close = null;

		document.addEventListener('keydown', function (ev) {
			var tag = (ev.target && ev.target.tagName || '').toLowerCase();
			var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable;

			if ((ev.ctrlKey || ev.metaKey) && String(ev.key || '').toLowerCase() === 'k') {
				ev.preventDefault();
				open && open();
			}
			else if (ev.key === 'Escape') {
				close && close();
			}
			else if (ev.key === '/' && !typing) {
				ev.preventDefault();
				open && open();
			}
		});

		document.querySelectorAll('[data-ltc-search]').forEach(function (btn) {
			btn.addEventListener('click', function () { open && open(); });
		});

		var overlay = null, input = null, list = null, items = [], active = 0;

		function collect() {
			return Array.prototype.slice.call(document.querySelectorAll('.ltc-nav a[href]')).map(function (a) {
				var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
				var href = a.getAttribute('href') || '';
				if (!label || !href || href === '#')
					return null;
				return { label: label, href: href };
			}).filter(Boolean);
		}

		function render() {
			var q = (input.value || '').toLowerCase();
			var found = items.filter(function (it) {
				return !q || it.label.toLowerCase().indexOf(q) >= 0 ||
					it.href.toLowerCase().indexOf(q) >= 0;
			});
			active = 0;
			list.textContent = '';

			if (!found.length) {
				var empty = document.createElement('div');
				empty.className = 'ltc-search-empty';
				empty.textContent = _('No matching menu item');
				list.appendChild(empty);
				return;
			}

			found.forEach(function (it, idx) {
				var a = document.createElement('a');
				a.href = it.href;
				a.className = idx === 0 ? 'on' : '';
				var b = document.createElement('b');
				b.textContent = it.label;
				var s = document.createElement('small');
				s.textContent = it.href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/cgi-bin\/luci/, '');
				a.appendChild(b);
				a.appendChild(s);
				list.appendChild(a);
			});

			list._found = found;
		}

		function move(step) {
			var links = list.querySelectorAll('a');
			if (!links.length)
				return;
			active = (active + step + links.length) % links.length;
			Array.prototype.forEach.call(links, function (a, i) {
				a.classList.toggle('on', i === active);
			});
			links[active].scrollIntoView({ block: 'nearest' });
		}

		open = function () {
			if (!overlay) {
				overlay = document.createElement('div');
				overlay.className = 'ltc-search';
				overlay.innerHTML = '<div class="ltc-search-box" role="dialog" aria-modal="true">' +
					'<div class="ltc-search-head"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>' +
					'<input type="search" autocomplete="off" spellcheck="false"></div>' +
					'<div class="ltc-search-list"></div>' +
					'<div class="ltc-search-foot"><span>↑ ↓</span><span>Enter</span><span>Esc</span></div></div>';
				document.body.appendChild(overlay);
				input = overlay.querySelector('input');
				list = overlay.querySelector('.ltc-search-list');
				input.placeholder = _('Search menu…');

				input.addEventListener('input', render);
				input.addEventListener('keydown', function (ev) {
					if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
					else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
					else if (ev.key === 'Enter') {
						var found = list._found || [];
						if (found[active])
							location.href = found[active].href;
					}
				});
				overlay.addEventListener('click', function (ev) {
					if (ev.target === overlay)
						close();
				});
			}

			items = collect();
			document.body.classList.add('ltc-search-open');
			overlay.classList.add('show');
			input.value = '';
			render();
			setTimeout(function () { input.focus(); }, 30);
		};

		close = function () {
			if (!overlay)
				return;
			overlay.classList.remove('show');
			document.body.classList.remove('ltc-search-open');
		};

		document.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && overlay && overlay.classList.contains('show'))
				close();
		});
	},

	initLogin: function () {
		var eye = document.querySelector('[data-ltc-eye]');
		var pass = document.querySelector('#luci_password');
		var form = document.querySelector('#ltc-login-form');

		if (eye && pass) {
			eye.addEventListener('click', function () {
				var show = pass.type === 'password';
				pass.type = show ? 'text' : 'password';
				eye.classList.toggle('on', show);
				pass.focus();
			});
		}
		if (pass) {
			pass.focus();
			pass.select();
		}
		if (form) {
			form.addEventListener('submit', function () {
				var btn = form.querySelector('button[type=submit]');
				if (btn) {
					btn.disabled = true;
					btn.textContent = btn.dataset.busy || '…';
				}
			});
		}
	},

	observeMenu: function () {
		var menu = document.querySelector('#topmenu');
		if (!menu)
			return;
		var self = this;
		if (window.MutationObserver) {
			new MutationObserver(function () {
				self.decorateIcons();
				self.markActive();
			})
				.observe(menu, { childList: true, subtree: true });
		}
		setTimeout(function () {
			self.decorateIcons();
			self.markActive();
		}, 250);
	},

	/* LuCI builds the menu as plain text links; prepend a small SVG glyph to
	   top-level entries. Idempotent so the observer can run it on every
	   mutation without stacking icons. */
	decorateIcons: function () {
		document.querySelectorAll('.ltc-nav > ul > li > a').forEach(function (a) {
			if (a.querySelector('svg'))
				return;

			var href = a.getAttribute('href') || '';
			if (!href || href === '#') {
				var sub = a.parentElement.querySelector('ul.dropdown-menu a[href]');
				href = sub ? sub.getAttribute('href') : '';
			}

			var m = /\/admin\/([a-z0-9_-]+)/i.exec(href);
			var name = (m && MENU_ICONS[m[1].toLowerCase()]) || 'link';
			var label = (a.textContent || '').replace(/\s+/g, ' ').trim();

			if (label)
				a.title = label;
			a.insertBefore(util.icon(name, 'ltc-nav-ic'), a.firstChild);
		});
	},

	/* The collapse control sits on the divider between the sidebar and the
	   content, not in the footer row: next to the theme and info buttons it was
	   a third identical 36px square, which nobody found. Two chevrons plus a
	   label that appears on hover make it read as "collapse this column". */
	initRail: function () {
		var side = document.querySelector('.ltc-side');
		var root = document.documentElement;
		if (!side || side.querySelector('[data-ltc-rail]'))
			return;

		/* the template bootstrap already does this before first paint; doing it
		   here too means the rule holds even on a page rendered without it */
		railAuto();
		var btn = E('button', {
			'type': 'button',
			'class': 'ltc-rail-toggle',
			'data-ltc-rail': '',
			'aria-controls': 'ltc-side'
		});
		btn.appendChild(E('span', { 'class': 'ic' }, util.icon('chevrons')));
		btn.appendChild(E('span', { 'class': 'lbl' }, ''));

		var paint = function () {
			var on = root.dataset.rail === '1';
			btn.setAttribute('title', on ? _('Expand sidebar') : _('Collapse sidebar'));
			btn.setAttribute('aria-expanded', on ? 'false' : 'true');
			btn.lastChild.textContent = on ? _('Expand sidebar') : _('Collapse sidebar');
		};

		btn.addEventListener('click', function () {
			var on = root.dataset.rail === '1';
			root.dataset.rail = on ? '0' : '1';
			try {
				/* an explicit choice wins over the width rule, permanently,
				   until the user picks the other one */
				localStorage.setItem('lucent.rail', on ? '0' : '1');
			} catch (e) {}
			paint();
		});

		side.appendChild(btn);
		paint();

		var prev = root.dataset.rail;
		window.addEventListener('resize', function () {
			var pref = null;
			try {
				pref = localStorage.getItem('lucent.rail');
			} catch (e) {}
			/* only users who never touched the button follow the width rule */
			if (pref === '0' || pref === '1')
				return;
			railAuto();
			if (root.dataset.rail !== prev)
				paint();
		});
	},

	markActive: function () {
		var here = location.pathname.replace(/\/+$/, '');
		var links = document.querySelectorAll('.ltc-nav a[href]');
		var best = null, bestLen = -1;

		links.forEach(function (a) {
			a.classList.remove('on');
			var href = a.getAttribute('href');
			if (!href || href === '#')
				return;
			try {
				var path = new URL(href, location.origin).pathname.replace(/\/+$/, '');
				if (here === path || here.indexOf(path + '/') === 0) {
					if (path.length > bestLen) {
						best = a;
						bestLen = path.length;
					}
				}
			} catch (e) {}
		});

		if (best) {
			best.classList.add('on');
			var group = best.closest('li');
			var top = group && group.parentElement && group.parentElement.closest('li');
			var topLink = top && top.querySelector(':scope > a');
			if (topLink)
				topLink.classList.add('ltc-parent');
			if (top)
				top.classList.add('open');
		}

		var dock = location.pathname;
		document.querySelectorAll('.ltc-dock a[data-dock]').forEach(function (a) {
			var key = a.dataset.dock;
			a.classList.toggle('on',
				(key === 'home' && /\/admin\/home\/?$/.test(dock)) ||
				(key === 'clients' && /\/admin\/clients\/?$/.test(dock)) ||
				(key === 'network' && /\/admin\/network\//.test(dock)) ||
				(key === 'appearance' && /\/admin\/system\/appearance\/?$/.test(dock)));
		});
	},

	save: function (option, value) {
		return uci.load('lucent').then(function () {
			uci.set('lucent', 'main', option, value);
			return uci.save().then(function () { return callCommit('lucent'); });
		});
	},

	toast: function (message, kind) {
		var el = document.querySelector('.ltc-toast');
		if (!el) {
			el = document.createElement('div');
			el.className = 'ltc-toast';
			document.body.appendChild(el);
		}
		el.textContent = message;
		el.className = 'ltc-toast show' + (kind ? ' ' + kind : '');
		clearTimeout(el._timer);
		el._timer = setTimeout(function () { el.className = 'ltc-toast'; }, 3200);
	},

	/* exported so the harness can assert the width rule, and so a page that
	   boots without the template still settles on the same answer */
	railAuto: railAuto,
	RAIL_MIN: RAIL_MIN,
	RAIL_AUTO_MAX: RAIL_AUTO_MAX
});
