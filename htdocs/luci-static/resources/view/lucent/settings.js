'use strict';
'require view';
'require uci';
'require ui';
'require rpc';
'require lucent.core as core';
'require lucent.util as util';

var TMP = '/tmp/lucent-upload/file.bin';

var callFileWrite = rpc.declare({
	object: 'file', method: 'write',
	params: ['path', 'data', 'mode', 'append', 'base64']
});
var callMediaList = rpc.declare({ object: 'luci.lucent', method: 'media_list' });
var callMediaCommit = rpc.declare({ object: 'luci.lucent', method: 'media_commit', params: ['kind', 'name'] });
var callMediaRemove = rpc.declare({ object: 'luci.lucent', method: 'media_remove', params: ['kind', 'name'] });
var callWallpaperFetch = rpc.declare({ object: 'luci.lucent', method: 'wallpaper_fetch', params: ['provider', 'query', 'key'] });
var callWallpaperAuto = rpc.declare({ object: 'luci.lucent', method: 'wallpaper_auto', params: ['enabled'] });
var callPluginCheck = rpc.declare({ object: 'luci.lucent', method: 'plugin_check' });
var callPluginInstall = rpc.declare({ object: 'luci.lucent', method: 'plugin_install', params: ['name'] });
var callPluginStatus = rpc.declare({ object: 'luci.lucent', method: 'plugin_status' });

var PALETTES = [
	{ id: 'clay', label: 'Clay', color: '#cd7255' },
	{ id: 'celadon', label: 'Celadon', color: '#3d8674' },
	{ id: 'mist', label: 'Mist', color: '#4b6daa' },
	{ id: 'dusk', label: 'Dusk', color: '#96608a' },
	{ id: 'graphite', label: 'Graphite', color: '#34342f' }
];

var PLUGINS = {
	openclash: 'OpenClash',
	passwall: 'PassWall',
	passwall2: 'PassWall 2',
	ssrplus: 'SSR Plus',
	mosdns: 'MosDNS',
	adguardhome: 'AdGuard Home',
	dockerman: 'Docker Manager',
	smartdns: 'SmartDNS'
};

var DEFAULTS = {
	palette: 'mist',
	mode: 'auto',
	glass: '1',
	glass_blur: '20',
	glass_alpha: '62',
	bg_dim: '0',
	density: 'cozy',
	greeting: '1',
	background: '',
	logo_image: '',
	wallpaper_auto: '0'
};

function tr(msg) {
	return _(String(msg));
}

function save(option, value, message) {
	return core.save(option, String(value)).then(function () {
		if (message)
			core.toast(message, 'ok');
	}).catch(function (err) {
		core.toast(_('Unable to save: %s').format(tr(err && err.message || err)), 'err');
	});
}

function resolveTheme(mode) {
	return (mode === 'dark' ||
		(mode === 'auto' && window.matchMedia &&
		 window.matchMedia('(prefers-color-scheme: dark)').matches)) ? 'dark' : 'light';
}

function card(title, desc, body, cls) {
	return E('section', { 'class': 'ltc-card' + (cls ? ' ' + cls : '') }, [
		E('div', { 'class': 'ltc-card-h' }, [
			E('div', {}, [
				E('h3', {}, title),
				desc ? E('p', { 'class': 'ltc-muted' }, desc) : ''
			])
		]),
		body
	]);
}

function field(label, control, help) {
	return E('div', { 'class': 'ltc-setting' }, [
		E('div', { 'class': 'ltc-setting-l' }, label),
		E('div', { 'class': 'ltc-setting-c' }, [
			control,
			help ? E('div', { 'class': 'ltc-help' }, help) : ''
		])
	]);
}

function segmented(items, current, onPick) {
	var box = E('div', { 'class': 'ltc-seg' });

	items.forEach(function (item) {
		var button = E('button', {
			'type': 'button',
			'class': (item.value === current) ? 'on' : '',
			'data-value': item.value
		}, item.label);

		button.addEventListener('click', function () {
			box.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
			button.classList.add('on');
			onPick(item.value);
		});

		box.appendChild(button);
	});

	return box;
}

function selectBox(items, current, onPick) {
	var select = E('select', {}, items.map(function (item) {
		return E('option', { 'value': item.value }, item.label);
	}));

	select.value = current;
	select.addEventListener('change', function () { onPick(select.value); });

	return select;
}

function range(label, value, min, max, unit, onInput, onChange) {
	var output = E('b', {}, String(value) + unit);
	var input = E('input', {
		'type': 'range',
		'min': min,
		'max': max,
		'step': 1,
		'value': value
	});

	input.addEventListener('input', function () {
		output.textContent = String(input.value) + unit;
		onInput(Number(input.value));
	});
	input.addEventListener('change', function () {
		onChange(Number(input.value));
	});

	return field(label, E('div', { 'class': 'ltc-range' }, [input, output]));
}

function readChunk(blob) {
	return new Promise(function (resolve, reject) {
		var reader = new FileReader();
		reader.onload = function () {
			var result = String(reader.result || '');
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.onerror = function () { reject(new Error(_('Cannot read the selected file'))); };
		reader.readAsDataURL(blob);
	});
}

function uploadChunks(file, onProgress) {
	var offset = 0;
	var size = 192 * 1024;

	function step() {
		if (offset >= file.size)
			return Promise.resolve();

		var blob = file.slice(offset, Math.min(offset + size, file.size));

		return readChunk(blob).then(function (base64) {
			return callFileWrite(TMP, base64, 420, offset > 0, true).then(function (rc) {
				if (typeof rc === 'number' && rc !== 0)
					throw new Error(_('The router refused the upload (code %d)').format(rc));
				offset += blob.size;
				onProgress(Math.round(offset * 100 / file.size));
				return step();
			});
		});
	}

	return step();
}

function cssUrl(url) {
	return 'url("' + String(url).replace(/"/g, '%22') + '")';
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('lucent'),
			L.resolveDefault(callMediaList(), { items: [] }),
			L.resolveDefault(callPluginCheck(), { items: [] }),
			L.resolveDefault(util.overview(), {})
		]).then(function (r) {
			var cfg = {};

			Object.keys(DEFAULTS).forEach(function (key) {
				var value = uci.get('lucent', 'main', key);
				cfg[key] = (value != null && value !== '') ? value : DEFAULTS[key];
			});

			return {
				cfg: cfg,
				media: (r[1] && r[1].items) || [],
				plugins: (r[2] && r[2].items) || [],
				net: r[3] || {}
			};
		});
	},

	render: function (data) {
		this.cfg = data.cfg;
		this.media = data.media.slice();
		this.plugins = data.plugins.slice();

		var self = this;

		var hero = E('section', { 'class': 'ltc-hero ltc-card' }, [
			E('div', {}, [
				E('span', { 'class': 'ltc-badge plain' }, 'Lucent 3'),
				E('h1', {}, _('Appearance')),
				E('p', { 'class': 'ltc-hero-sub' },
					_('Colour, glass, wallpapers and optional add-ons. Changes are saved to /etc/config/lucent immediately.')),
				E('div', { 'class': 'ltc-hero-actions' }, [
					E('button', { 'type': 'button', 'class': 'ltc-btn', 'click': function () { location.reload(); } }, _('Reload page')),
					E('a', { 'class': 'ltc-btn ghost', 'href': L.url('admin/home') }, _('Back to home'))
				])
			]),
			E('div', { 'class': 'ltc-hero-side' }, [
				E('div', { 'class': 'ltc-hero-line' }, [E('small', {}, _('Theme')), E('b', {}, 'Lucent ' + ((data.net && data.net.version) || '3'))]),
				E('div', { 'class': 'ltc-hero-line' }, [E('small', {}, _('Storage')), E('b', {}, _('Router media library'))]),
				E('div', { 'class': 'ltc-hero-line' }, [E('small', {}, _('Backend')), E('b', {}, 'rpcd · luci.lucent')])
			])
		]);

		var paletteBody = E('div', { 'class': 'ltc-swatches' }, PALETTES.map(function (p) {
			return E('button', {
				'type': 'button',
				'class': 'ltc-swatch' + (self.cfg.palette === p.id ? ' on' : ''),
				'data-palette': p.id,
				'style': '--sw:' + p.color,
				'click': function (ev) {
					document.documentElement.dataset.palette = p.id;
					document.querySelectorAll('.ltc-swatch').forEach(function (b) {
						b.classList.toggle('on', b === ev.currentTarget);
					});
					self.cfg.palette = p.id;
					save('palette', p.id);
				},
				'title': _(p.label)
			}, [
				E('span', { 'class': 'chip' }),
				E('span', {}, _(p.label))
			]);
		}));

		var modeBody = E([
			field(_('Colour mode'), segmented([
				{ value: 'auto', label: _('Auto') },
				{ value: 'light', label: _('Light') },
				{ value: 'dark', label: _('Dark') }
			], self.cfg.mode, function (mode) {
				self.cfg.mode = mode;
				document.documentElement.dataset.mode = mode;
				document.documentElement.dataset.theme = resolveTheme(mode);
				save('mode', mode);
			})),
			field(_('Density'), segmented([
				{ value: 'cozy', label: _('Cozy') },
				{ value: 'compact', label: _('Compact') }
			], self.cfg.density, function (density) {
				self.cfg.density = density;
				document.documentElement.dataset.density = density;
				save('density', density);
			}))
		]);

		var glassBody = E([
			field(_('Glass effect'), segmented([
				{ value: '1', label: _('On') },
				{ value: '0', label: _('Off') }
			], self.cfg.glass, function (glass) {
				self.cfg.glass = glass;
				document.documentElement.dataset.glass = glass;
				save('glass', glass);
			})),
			range(_('Blur'), parseInt(self.cfg.glass_blur, 10) || 0, 0, 40, 'px',
				function (v) { document.documentElement.style.setProperty('--glass-blur', v + 'px'); },
				function (v) { self.cfg.glass_blur = v; save('glass_blur', v); }),
			range(_('Surface opacity'), parseInt(self.cfg.glass_alpha, 10) || 0, 30, 100, '%',
				function (v) { document.documentElement.style.setProperty('--glass-alpha', v + '%'); },
				function (v) { self.cfg.glass_alpha = v; save('glass_alpha', v); }),
			range(_('Background dimming'), parseInt(self.cfg.bg_dim, 10) || 0, 0, 100, '%',
				function (v) { document.documentElement.style.setProperty('--bg-dim', String(v)); },
				function (v) { self.cfg.bg_dim = v; save('bg_dim', v); })
		]);

		this.wallPreview = E('div', { 'class': 'ltc-preview' });
		this.setPreview(this.cfg.background);

		var urlInput = E('input', {
			'type': 'url',
			'value': self.cfg.background,
			'placeholder': 'https://… or /luci-static/lucent/media/…',
			'spellcheck': 'false'
		});
		var logoInput = E('input', {
			'type': 'url',
			'value': self.cfg.logo_image,
			'placeholder': '/luci-static/lucent/media/icon/…',
			'spellcheck': 'false'
		});
		var uploadStatus = E('div', { 'class': 'ltc-status' });

		var uploadInput = E('input', {
			'type': 'file',
			'accept': 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm'
		});
		uploadInput.addEventListener('change', function () {
			var file = uploadInput.files && uploadInput.files[0];
			if (!file)
				return;
			var kind = /^video\//.test(file.type) ? 'video' : 'image';
			self.upload(file, kind, uploadStatus).then(function () {
				uploadInput.value = '';
			});
		});

		var wallBody = E([
			this.wallPreview,
			field(_('Background URL'), E('div', { 'class': 'ltc-field-row' }, [
				urlInput,
				E('button', { 'class': 'ltc-btn primary sm', 'type': 'button', 'click': function () {
					self.setBackground(urlInput.value.trim(), true);
				} }, _('Apply')),
				E('button', { 'class': 'ltc-btn sm', 'type': 'button', 'click': function () {
					urlInput.value = '';
					self.setBackground('', true);
				} }, _('Clear'))
			]), _('Images, videos, or a URL served by the router itself.')),
			field(_('Logo URL'), E('div', { 'class': 'ltc-field-row' }, [
				logoInput,
				E('button', { 'class': 'ltc-btn primary sm', 'type': 'button', 'click': function () {
					self.setLogo(logoInput.value.trim(), true);
				} }, _('Apply')),
				E('button', { 'class': 'ltc-btn sm', 'type': 'button', 'click': function () {
					logoInput.value = '';
					self.setLogo('', true);
				} }, _('Clear'))
			]), _('A small PNG, WebP, ICO or SVG served by the router replaces the default mark.')),
			field(_('Upload media'), E([uploadInput, uploadStatus]),
				_('Up to 8 MB images, 32 MB videos and 1 MB icons. Files are validated by their magic bytes on the router.')),
			E('div', { 'class': 'ltc-help' },
				_('The sidebar logo and the page background update after a reload. The preview above changes immediately.'))
		]);

		this.mediaBox = E('div', { 'class': 'ltc-media-grid' });
		this.mediaStatus = E('div', { 'class': 'ltc-status' });
		this.renderMedia();

		var mediaBody = E([
			this.mediaBox,
			this.mediaStatus,
			E('div', { 'class': 'ltc-help' },
				_('Files live under /www/luci-static/lucent/media. They are removed when this package is uninstalled.'))
		]);

		var provider = selectBox([
			{ value: 'bing', label: _('Bing daily image') },
			{ value: 'unsplash', label: 'Unsplash' },
			{ value: 'wallhaven', label: 'Wallhaven' }
		], 'bing', function () {});

		var queryInput = E('input', {
			'type': 'text',
			'placeholder': _('Optional search words, e.g. mountains'),
			'spellcheck': 'false'
		});
		var keyInput = E('input', {
			'type': 'password',
			'placeholder': _('Unsplash API key (only for Unsplash)'),
			'autocomplete': 'off'
		});
		var fetchStatus = E('div', { 'class': 'ltc-status' });
		var fetchButton = E('button', { 'class': 'ltc-btn primary', 'type': 'button' }, _('Fetch wallpaper'));

		fetchButton.addEventListener('click', function () {
			fetchButton.disabled = true;
			fetchStatus.className = 'ltc-status';
			fetchStatus.textContent = _('Contacting the wallpaper source…');

			callWallpaperFetch(provider.value, queryInput.value.trim(), keyInput.value.trim()).then(function (res) {
				fetchButton.disabled = false;
				if (!res || !res.ok)
					throw new Error(tr(res && res.error || _('The wallpaper could not be fetched')));

				self.media.push(res);
				self.renderMedia();
				self.setBackground(res.url, true);
				fetchStatus.className = 'ltc-status ok';
				fetchStatus.textContent = _('Downloaded %s').format(res.name);
			}).catch(function (err) {
				fetchButton.disabled = false;
				fetchStatus.className = 'ltc-status err';
				fetchStatus.textContent = tr(err && err.message || String(err));
			});
		});

		var onlineBody = E([
			field(_('Source'), provider),
			field(_('Search words'), queryInput),
			field(_('API key'), keyInput, _('Unsplash requires a free API key. Bing and Wallhaven do not.')),
			E('div', { 'class': 'ltc-row', 'style': 'margin-top:12px;flex-wrap:wrap' }, [fetchButton, fetchStatus]),
			field(_('Daily auto wallpaper'), segmented([
				{ value: '1', label: _('On') },
				{ value: '0', label: _('Off') }
			], self.cfg.wallpaper_auto, function (v) {
				self.cfg.wallpaper_auto = v;
				save('wallpaper_auto', v);
				callWallpaperAuto(v).then(function (res) {
					if (!res || !res.ok)
						core.toast(_('The cron job could not be updated'), 'err');
					else
						core.toast(v === '1' ? _('Bing daily image will be fetched at 06:00') : _('Auto wallpaper disabled'), 'ok');
				}).catch(function () {
					core.toast(_('The cron job could not be updated'), 'err');
				});
			}), _('When on, the router downloads the Bing image of the day at 06:00 and sets it as the background. It replaces the previous auto image, and needs internet access.'))
		]);

		var homeBody = E([
			field(_('Daily greeting line'), segmented([
				{ value: '1', label: _('On') },
				{ value: '0', label: _('Off') }
			], self.cfg.greeting, function (greeting) {
				self.cfg.greeting = greeting;
				document.documentElement.dataset.greeting = greeting;
				save('greeting', greeting);
			}), _('When on, the home page fetches one line of the day from v1.hitokoto.cn and caches it for that date. Without internet it falls back to a built-in line.'))
		]);

		this.pluginBox = E('div', { 'class': 'ltc-plugins' });
		this.pluginStatus = E('div', { 'class': 'ltc-status' });
		this.renderPlugins();

		var pluginBody = E([
			this.pluginBox,
			this.pluginStatus,
			E('div', { 'class': 'ltc-help' },
				_('Only the packages listed above can be installed. They are downloaded from the package feeds already configured on this router; no third-party URL is accepted.'))
		]);

		var resetBody = E('div', { 'class': 'ltc-row', 'style': 'flex-wrap:wrap;justify-content:space-between' }, [
			E('div', { 'class': 'ltc-help', 'style': 'max-width:46ch' },
				_('Restore the default palette, glass values and background. Media files and installed packages are not removed.')),
			E('button', { 'class': 'ltc-btn danger', 'type': 'button', 'click': function () { self.resetDefaults(); } }, _('Restore defaults'))
		]);

		return E('div', { 'class': 'ltc-stack' }, [
			hero,
			E('div', { 'class': 'ltc-grid' }, [
				card(_('Palette'), _('Five quiet colour families, each with light and dark readings.'), paletteBody),
				card(_('Mode and density'), _('Auto follows the phone or desktop preference.'), modeBody)
			]),
			card(_('Glass'), _('Tune blur, surface opacity and how much the wallpaper is dimmed.'), glassBody),
			card(_('Home page'), _('Choose what the overview shows when you sign in.'), homeBody),
			card(_('Background and logo'), _('A still image or a short looping video.'), wallBody),
			card(_('Media library'), _('Uploaded images, videos and icons, plus fetched wallpapers.'), mediaBody),
			card(_('Online wallpapers'), _('Download a fresh image directly to the router.'), onlineBody),
			card(_('Optional add-ons'), _('Allow-listed LuCI applications, installed through the configured feeds.'), pluginBody),
			card(_('Maintenance'), null, resetBody)
		]);
	},

	setPreview: function (url) {
		var box = this.wallPreview;
		if (!box)
			return;

		while (box.firstChild)
			box.removeChild(box.firstChild);

		if (!url) {
			box.appendChild(E('span', {}, _('No background selected')));
			return;
		}

		if (/\.(mp4|webm|ogv)(\?|$)/i.test(url)) {
			box.appendChild(E('video', {
				'src': url, 'muted': '', 'loop': '', 'autoplay': '', 'playsinline': '', 'preload': 'metadata'
			}));
		}
		else {
			box.appendChild(E('div', {
				'class': 'ltc-preview-img',
				'style': 'background-image:' + cssUrl(url)
			}));
		}
	},

	applyWall: function (url) {
		var wall = document.querySelector('.ltc-wall');
		var video = /\.(mp4|webm|ogv)(\?|$)/i.test(url || '');
		var el = null;

		if (!url) {
			if (wall)
				wall.remove();
			return;
		}

		if (video) {
			el = document.createElement('video');
			el.src = url;
			el.muted = true;
			el.loop = true;
			el.autoplay = true;
			el.playsInline = true;
			el.className = 'ltc-wall';
		}
		else {
			el = document.createElement('div');
			el.className = 'ltc-wall';
			el.style.backgroundImage = cssUrl(url);
		}

		if (wall)
			wall.replaceWith(el);
		else
			document.body.insertBefore(el, document.body.firstChild);
	},

	setBackground: function (url, notify) {
		if (url && !/^(https?:\/\/|\/luci-static\/|data:image\/)/i.test(url)) {
			core.toast(_('Use an http(s) URL or a path under /luci-static/'), 'err');
			return Promise.resolve();
		}

		this.cfg.background = url;
		this.setPreview(url);
		this.applyWall(url);

		return save('background', url, notify ? _('Background updated') : null);
	},

	setLogo: function (url, notify) {
		if (url && !/^(https?:\/\/|\/luci-static\/)/i.test(url)) {
			core.toast(_('Use an http(s) URL or a path under /luci-static/'), 'err');
			return Promise.resolve();
		}

		this.cfg.logo_image = url;

		return save('logo_image', url, notify ? _('Logo updated — reload to see it in the sidebar') : null);
	},

	upload: function (file, kind, status) {
		var self = this;
		var limit = kind === 'video' ? 32 * 1024 * 1024 : 8 * 1024 * 1024;

		if (file.size > limit) {
			status.className = 'ltc-status err';
			status.textContent = _('This file is larger than the %s limit').format(util.fmtBytes(limit));
			return Promise.resolve();
		}

		status.className = 'ltc-status';
		status.textContent = _('Uploading… 0%');

		return uploadChunks(file, function (percent) {
			status.textContent = _('Uploading… %d%%').format(percent);
		}).then(function () {
			return callMediaCommit(kind, file.name);
		}).then(function (res) {
			if (!res || !res.ok)
				throw new Error(tr(res && res.error || _('The upload could not be committed')));

			self.media.push(res);
			self.renderMedia();
			status.className = 'ltc-status ok';
			status.textContent = _('Uploaded %s').format(res.name);
			return res;
		}).catch(function (err) {
			status.className = 'ltc-status err';
			status.textContent = tr(err && err.message || String(err));
		});
	},

	renderMedia: function () {
		var box = this.mediaBox;
		if (!box)
			return;

		while (box.firstChild)
			box.removeChild(box.firstChild);

		if (!this.media.length) {
			box.appendChild(E('div', { 'class': 'ltc-empty' },
				_('No media yet. Upload a file or fetch a wallpaper above.')));
			return;
		}

		var self = this;

		this.media.forEach(function (item) {
			var preview;

			if (item.kind === 'video') {
				preview = E('video', {
					'src': item.url, 'muted': '', 'playsinline': '', 'preload': 'metadata'
				});
			}
			else {
				preview = E('img', { 'src': item.url, 'alt': '', 'loading': 'lazy' });
			}

			var acts = [];

			if (item.kind !== 'icon') {
				acts.push(E('button', {
					'type': 'button',
					'click': function () { self.setBackground(item.url, true); }
				}, _('Use')));
			}

			if (item.kind === 'icon' || item.kind === 'image') {
				acts.push(E('button', {
					'type': 'button',
					'click': function () { self.setLogo(item.url, true); }
				}, _('Logo')));
			}

			acts.push(E('button', {
				'type': 'button',
				'class': 'del',
				'click': function () { self.confirmRemove(item); }
			}, _('Delete')));

			box.appendChild(E('div', { 'class': 'ltc-media' }, [
				E('div', { 'class': 'ltc-media-pv' }, preview),
				E('div', { 'class': 'ltc-media-meta' }, [
					E('b', {}, item.name),
					E('small', {}, item.kind + ' · ' + util.fmtBytes(item.size))
				]),
				E('div', { 'class': 'ltc-media-acts' }, acts)
			]));
		});
	},

	confirmRemove: function (item) {
		var self = this;

		ui.showModal(_('Delete this file?'), [
			E('p', {}, _('%s will be removed from the router.').format(item.name)),
			E('div', { 'class': 'ltc-row', 'style': 'justify-content:flex-end;margin-top:14px' }, [
				E('button', { 'class': 'ltc-btn', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'ltc-btn danger',
					'click': function () {
						ui.hideModal();
						callMediaRemove(item.kind, item.name).then(function (res) {
							if (!res || !res.ok)
								throw new Error(tr(res && res.error || _('The file could not be removed')));

							self.media = self.media.filter(function (m) {
								return !(m.kind === item.kind && m.name === item.name);
							});
							if (self.cfg.background === item.url)
								self.setBackground('', false);
							if (self.cfg.logo_image === item.url)
								self.setLogo('', false);
							self.renderMedia();
							core.toast(_('File deleted'), 'ok');
						}).catch(function (err) {
							core.toast(tr(err && err.message || String(err)), 'err');
						});
					}
				}, _('Delete'))
			])
		]);
	},

	renderPlugins: function () {
		var box = this.pluginBox;
		if (!box)
			return;

		while (box.firstChild)
			box.removeChild(box.firstChild);

		var self = this;

		this.plugins.forEach(function (item) {
			var label = PLUGINS[item.name] || item.name;
			var installed = !!item.installed;
			var badge = E('span', { 'class': 'ltc-badge ' + (installed ? 'ok' : 'plain') },
				installed ? _('Installed') : _('Not installed'));

			var node = E('div', { 'class': 'ltc-plugin', 'data-plugin': item.name }, [
				E('span', { 'class': 'ltc-dot' + (installed ? '' : ' off') }),
				E('div', { 'class': 'grow' }, [
					E('b', {}, label),
					E('small', {}, item.pkg)
				]),
				badge
			]);

			if (!installed) {
				node.appendChild(E('button', {
					'class': 'ltc-btn sm primary',
					'type': 'button',
					'click': function () { self.confirmInstall(item, node); }
				}, _('Install')));
			}

			box.appendChild(node);
		});
	},

	reloadPlugins: function () {
		var self = this;

		return callPluginCheck().then(function (res) {
			if (res && res.items) {
				self.plugins = res.items;
				self.renderPlugins();
			}
		});
	},

	confirmInstall: function (item, node) {
		var self = this;
		var label = PLUGINS[item.name] || item.name;

		ui.showModal(_('Install %s?').format(label), [
			E('p', {}, _('%s (%s) will be downloaded from the package feeds configured on this router and installed.').format(label, item.pkg)),
			E('p', { 'class': 'ltc-help' },
				_('The router needs internet access and enough free space. Do not power it off during installation.')),
			E('div', { 'class': 'ltc-row', 'style': 'justify-content:flex-end;margin-top:14px' }, [
				E('button', { 'class': 'ltc-btn', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'ltc-btn primary',
					'click': function () {
						ui.hideModal();
						self.installPlugin(item, node);
					}
				}, _('Install'))
			])
		]);
	},

	installPlugin: function (item, node) {
		var self = this;
		var badge = node.querySelector('.ltc-badge');
		var button = node.querySelector('button');

		if (button) {
			button.disabled = true;
			button.textContent = _('Installing…');
		}
		if (badge) {
			badge.className = 'ltc-badge warn';
			badge.textContent = _('Installing…');
		}

		this.pluginStatus.className = 'ltc-status';
		this.pluginStatus.textContent = _('Starting installation of %s…').format(item.pkg);

		callPluginInstall(item.name).then(function (res) {
			if (!res || !res.ok)
				throw new Error(tr(res && res.error || _('The installation could not be started')));

			self.pollInstall(item, node);
		}).catch(function (err) {
			if (button) {
				button.disabled = false;
				button.textContent = _('Install');
			}
			if (badge) {
				badge.className = 'ltc-badge plain';
				badge.textContent = _('Not installed');
			}
			self.pluginStatus.className = 'ltc-status err';
			self.pluginStatus.textContent = tr(err && err.message || String(err));
		});
	},

	pollInstall: function (item, node) {
		var self = this;
		var tries = 0;

		if (node._timer)
			clearInterval(node._timer);

		node._timer = setInterval(function () {
			tries++;

			callPluginStatus().then(function (st) {
				if (!st)
					return;

				if (st.running) {
					self.pluginStatus.className = 'ltc-status';
					self.pluginStatus.textContent = st.log || _('Installing…');
					return;
				}

				clearInterval(node._timer);
				node._timer = null;

				var badge = node.querySelector('.ltc-badge');
				var button = node.querySelector('button');

				if (st.code === 0) {
					if (badge) {
						badge.className = 'ltc-badge ok';
						badge.textContent = _('Installed');
					}
					if (button)
						button.remove();

					self.pluginStatus.className = 'ltc-status ok';
					self.pluginStatus.textContent = _('%s installed successfully.').format(PLUGINS[item.name] || item.name);
					core.toast(_('Installation finished'), 'ok');
				}
				else if (st.code > 0) {
					if (badge) {
						badge.className = 'ltc-badge bad';
						badge.textContent = _('Failed');
					}
					if (button) {
						button.disabled = false;
						button.textContent = _('Retry');
					}

					self.pluginStatus.className = 'ltc-status err';
					self.pluginStatus.textContent = st.log || _('Installation failed with code %d.').format(st.code);
					core.toast(_('Installation failed'), 'err');
				}
				else {
					self.pluginStatus.className = 'ltc-status err';
					self.pluginStatus.textContent = _('The installer stopped without reporting a result.');
				}

				self.reloadPlugins();
			}).catch(function (err) {
				clearInterval(node._timer);
				node._timer = null;
				self.pluginStatus.className = 'ltc-status err';
				self.pluginStatus.textContent = tr(err && err.message || String(err));
			});

			if (tries > 120) {
				clearInterval(node._timer);
				node._timer = null;
				self.pluginStatus.className = 'ltc-status err';
				self.pluginStatus.textContent = _('Installation is taking unusually long. Check the system log.');
			}
		}, 2000);
	},

	resetDefaults: function () {
		var self = this;

		ui.showModal(_('Restore defaults?'), [
			E('p', {}, _('The palette, mode, glass values, density, background and logo will be reset. Media files and packages are kept.')),
			E('div', { 'class': 'ltc-row', 'style': 'justify-content:flex-end;margin-top:14px' }, [
				E('button', { 'class': 'ltc-btn', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'ltc-btn danger',
					'click': function () {
						ui.hideModal();
						var keys = Object.keys(DEFAULTS);
						var chain = Promise.resolve();

						keys.forEach(function (key) {
							chain = chain.then(function () { return core.save(key, DEFAULTS[key]); });
						});

						chain.then(function () {
							return callWallpaperAuto('0').catch(function () {});
						}).then(function () {
							core.toast(_('Defaults restored'), 'ok');
							setTimeout(function () { location.reload(); }, 400);
						}).catch(function (err) {
							core.toast(_('Unable to restore defaults: %s').format(tr(err && err.message || err)), 'err');
						});
					}
				}, _('Restore'))
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
