'use strict';
'require baseclass';
'require uci';
'require rpc';

var callCommit = rpc.declare({ object: 'uci', method: 'commit', params: ['config'] });

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
			if (body.classList.contains('ltc-menu-open') &&
			    !ev.target.closest('.ltc-side') &&
			    !ev.target.closest('[data-ltc-menu]'))
				body.classList.remove('ltc-menu-open');

			var link = ev.target.closest('.ltc-side a, .ltc-dock a');
			if (link)
				body.classList.remove('ltc-menu-open');
		});

		document.querySelectorAll('[data-ltc-theme]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var root = document.documentElement;
				var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
				root.dataset.theme = next;
				root.dataset.mode = next;
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

		this.markActive();
		this.observeMenu();
		this.initSearch();
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
			new MutationObserver(function () { self.markActive(); })
				.observe(menu, { childList: true, subtree: true });
		}
		setTimeout(function () { self.markActive(); }, 250);
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
	}
});
