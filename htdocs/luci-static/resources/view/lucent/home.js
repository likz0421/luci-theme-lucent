'use strict';
'require view';
'require poll';
'require lucent.core as core';
'require lucent.util as util';

function line(label, value) {
	return E('div', { 'class': 'ltc-hero-line' }, [
		E('small', {}, label),
		E('b', {}, value || '–')
	]);
}

function kpi(label, value, sub, key) {
	return E('div', { 'class': 'ltc-kpi' }, [
		E('small', {}, label),
		E('b', key ? { 'data-live': key } : {}, value),
		E('span', key ? { 'data-live': key + '-sub' } : {}, sub)
	]);
}

function ring(label, value, percent, key) {
	return E('div', { 'class': 'ltc-ring' }, [
		E('div', {
			'class': 'dial',
			'data-live': 'dial-' + key,
			'style': '--val:' + percent
		}, E('b', { 'data-live': 'ring-' + key }, value)),
		E('small', {}, label)
	]);
}

function node(iconName, label, cls) {
	return E('div', { 'class': 'ltc-node' + (cls ? ' ' + cls : '') }, [
		E('span', { 'class': 'ic' }, util.icon(iconName)),
		E('b', {}, label)
	]);
}

function wire(down) {
	return E('div', { 'class': 'ltc-wire' + (down ? ' down' : '') }, [E('i')]);
}

function fact(label, value, key) {
	return E('div', {}, [
		E('small', {}, label),
		E('b', key ? { 'data-live': key } : {}, value || '–')
	]);
}

function action(href, iconName, label) {
	return E('a', { 'class': 'ltc-act', 'href': href }, [
		util.icon(iconName),
		E('b', {}, label)
	]);
}

function card(title, extra, body, cls) {
	return E('section', { 'class': 'ltc-card' + (cls ? ' ' + cls : '') }, [
		E('div', { 'class': 'ltc-card-h' }, [
			E('h3', {}, title),
			extra || ''
		]),
		body
	]);
}

/* Offline fallback greetings, chosen by day-of-year so the line is stable for the day. */
var QUOTES = [
	_('May every ping come back, and every packet find its way.'),
	_('A steady router makes a calm home network.'),
	_('Keep it cool, keep it connected.'),
	_('Good signals make good days.'),
	_('Small device, whole household online.'),
	_('Reboot not required today — that is a good omen.'),
	_('Bandwidth is a gift; use it kindly.'),
	_('Firmware up to date, worries out of date.')
];

function dailyFallback() {
	var now = new Date();
	var start = new Date(now.getFullYear(), 0, 0);
	var day = Math.floor((now - start) / 86400000);
	return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

function memoryOf(info) {
	var mem = info.memory || {};
	var swap = info.swap || {};
	var cache = (Number(mem.buffered || mem.buffers) || 0) + (Number(mem.cache) || 0);
	var avail = mem.available != null ? Number(mem.available) : (mem.free || 0) + cache;
	var used = Math.max(0, (mem.total || 0) - Math.min(mem.total || 0, avail));
	var swapUsed = (swap.total || 0) - (swap.free || 0);

	return {
		total: mem.total || 0,
		used: Math.max(0, used),
		avail: Math.min(mem.total || 0, avail),
		percent: util.pct(used, mem.total),
		swapTotal: swap.total || 0,
		swapUsed: Math.max(0, swapUsed),
		swapPercent: util.pct(swapUsed, swap.total)
	};
}

function loadsOf(info) {
	return util.arr(info.load).map(function (v) {
		return (Number(v) || 0) / 65535;
	});
}

function wifiState(wifi) {
	var keys = Object.keys(wifi || {});
	var up = keys.filter(function (k) {
		var w = wifi[k] || {};
		return w.up === true || w.up === 1 || (w.config && w.config.up);
	});
	var ssids = [];

	keys.forEach(function (k) {
		util.arr((wifi[k] || {}).interfaces).forEach(function (iface) {
			var cfg = (iface && iface.config) || {};
			if (cfg.ssid && ssids.indexOf(cfg.ssid) === -1)
				ssids.push(cfg.ssid);
		});
	});

	return { total: keys.length, up: up.length, ssids: ssids };
}

function clientsOf(data) {
	return util.hosts(data.hints, data.leases);
}

/* Traffic history survives page navigation within the tab. */
function loadHist() {
	try {
		return JSON.parse(sessionStorage.getItem('lucent.hist') || '[]');
	} catch (e) {
		return [];
	}
}

function saveHist(h) {
	try {
		sessionStorage.setItem('lucent.hist', JSON.stringify(h.slice(-120)));
	} catch (e) {}
}

function sparkPath(h, key, max) {
	if (h.length < 2)
		return '';

	var d = 'M0,60';
	h.forEach(function (p, i) {
		var x = (i * 100 / (h.length - 1)).toFixed(2);
		var y = (58 - 54 * (Math.min(Number(p[key]) || 0, max) / max)).toFixed(2);
		d += ' L' + x + ',' + y;
	});
	return d + ' L100,60 Z';
}

function sparkCard() {
	return E('section', { 'class': 'ltc-card ltc-sparkcard' }, [
		E('div', { 'class': 'ltc-card-h' }, [
			E('div', {}, [
				E('h3', {}, _('Traffic trend')),
				E('p', { 'class': 'ltc-muted' }, _('Downlink and uplink rates sampled every 10 seconds.'))
			]),
			E('span', { 'class': 'ltc-badge plain', 'data-live': 'spark-now' }, '↓ –  ↑ –')
		]),
		E('div', { 'class': 'ltc-sparkwrap' }, [
			E('svg', { 'class': 'ltc-spark', 'viewBox': '0 0 100 60', 'preserveAspectRatio': 'none', 'aria-hidden': 'true' }, [
				E('path', { 'class': 'tx', 'd': '' }),
				E('path', { 'class': 'rx', 'd': '' })
			]),
			E('i', { 'class': 'ltc-spark-dot', 'style': 'display:none' })
		]),
		E('div', { 'class': 'ltc-tags' }, [
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'peak-rx' }, '–'), ' ', _('peak down')]),
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'peak-tx' }, '–'), ' ', _('peak up')]),
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'spark-samples' }, '0'), ' ', _('samples')])
		])
	]);
}

return view.extend({
	load: function () {
		return util.load();
	},

	startPoll: function () {
		if (this._polling)
			return;
		this._polling = true;

		poll.add(L.bind(function () {
			return util.load().then(L.bind(function (d) {
				this.applyLive(d);
			}, this));
		}, this), 10);

		/* Prime a second sample shortly after load so the traffic rate appears
		   within a few seconds instead of waiting for the first full poll. */
		setTimeout(L.bind(function () {
			util.load().then(L.bind(this.applyLive, this)).catch(function () {});
		}, this), 3000);
	},

	/* Pull a daily line from the network; cache per day in localStorage.
	   Rendered with textContent so remote strings can never inject markup. */
	fetchGreeting: function () {
		var el = document.querySelector('[data-quote]');
		if (!el)
			return;

		var now = new Date();
		var key = 'lucent.quote.' + [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
		var cached = null;
		try {
			cached = localStorage.getItem(key);
		} catch (e) {
			cached = null;
		}

		if (cached) {
			el.textContent = cached;
			return;
		}

		var req = new XMLHttpRequest();
		req.open('GET', 'https://v1.hitokoto.cn/?c=i&c=d&c=k&encode=json', true);
		req.timeout = 6000;
		req.onload = function () {
			var line = '';
			if (req.status >= 200 && req.status < 400) {
				try {
					var json = JSON.parse(req.responseText);
					if (json && typeof json.hitokoto === 'string')
						line = json.hitokoto + (json.from ? (' — ' + json.from) : '');
				} catch (e) {
					line = '';
				}
			}
			if (!line)
				line = dailyFallback();
			el.textContent = line;
			try {
				localStorage.setItem(key, line);
			} catch (e) {}
		};
		req.onerror = req.ontimeout = function () {
			el.textContent = dailyFallback();
		};
		req.send();
	},

	applyLive: function (data) {
		var mem = memoryOf(data.info);
		var loads = loadsOf(data.info);
		var wan = util.wan(data.ifaces);
		var lan = util.lan(data.ifaces, wan);
		var clients = clientsOf(data);
		var online = clients.filter(function (c) { return c.online; }).length;

		function set(sel, text) {
			var el = document.querySelector(sel);
			if (el)
				el.textContent = text;
		}

		function dial(key, percent) {
			var el = document.querySelector('[data-live=dial-' + key + ']');
			if (el)
				el.style.setProperty('--val', String(percent));
		}

		set('[data-live=uptime]', util.fmtDuration(data.info.uptime));
		set('[data-live=uptime-sub]', _('%s since boot').format(util.fmtDuration(data.info.uptime)));
		if (data.info.localtime)
			set('[data-live=sys-time]', new Date(data.info.localtime * 1000).toLocaleString());
		set('[data-live=memory]', mem.percent + '%');
		set('[data-live=memory-sub]', '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total)));
		set('[data-live=wan]', wan ? (util.ip4(wan) || _('Connected')) : _('Down'));
		set('[data-live=wan-sub]', wan ? (wan.proto || wan.device || '') : _('No default route'));
		set('[data-live=devices]', String(clients.length));
		set('[data-live=devices-sub]', _('%d active').format(online));

		var gwv = wan ? util.gateway(wan) : '';
		var dnsv = wan ? util.dns(wan) : [];
		var storage = util.storage(data.storage);
		set('[data-live=gateway]', gwv || '–');
		set('[data-live=dns]', dnsv.length ? dnsv.slice(0, 2).join('  ') : '–');
		if (wan && wan.uptime != null)
			set('[data-live=wan-up]', util.fmtDuration(wan.uptime));
		var liveAddr = util.arr(wan && wan['ipv4-address'])[0];
		if (liveAddr && liveAddr.valid != null) {
			set('[data-live=lease]', util.fmtDuration(liveAddr.valid));
		}
		else {
			var live6 = data.ifaces.filter(function (i) { return i && i.interface === 'wan6'; })[0];
			var la6 = util.arr(live6 && live6['ipv6-address'])[0];
			var lp6 = util.arr(live6 && live6['ipv6-prefix-assignment'])[0];
			var lv6 = (la6 && la6.valid != null) ? la6.valid : (lp6 && lp6.valid != null ? lp6.valid : null);
			if (lv6 != null)
				set('[data-live=lease]', util.fmtDuration(lv6) + ' (v6)');
		}
		set('[data-live=storage]', storage ? storage.percent + '%' : '–');
		set('[data-live=storage-sub]', storage
			? '%s / %s'.format(util.fmtBytes(storage.used), util.fmtBytes(storage.total)) : '–');

		var net = data.net || {};
		if (net.cores != null)
			set('[data-live=cores]', String(net.cores));
		if (net.temp_c != null)
			set('[data-live=temp]', '%s °C'.format(net.temp_c));
		if (net.conntrack != null)
			set('[data-live=conns]', net.conntrack + (net.conntrack_max ? ' / ' + net.conntrack_max : ''));
		if (net.processes_total != null)
			set('[data-live=procs]', net.processes_running + ' / ' + net.processes_total);

		var devName = wan && (wan['l3_device'] || wan['l3-device'] || wan.device);
		var dev = devName && data.devices && data.devices[devName];
		var stats = (wan && wan.statistics) || (dev && (dev.stats || dev.statistics));
		if (stats) {
			var now = Date.now();
			if (this._lastStats) {
				var dt = Math.max(1, (now - this._lastStats.t) / 1000);
				var rx = Math.max(0, (Number(stats.rx_bytes) - this._lastStats.rx) / dt);
				var tx = Math.max(0, (Number(stats.tx_bytes) - this._lastStats.tx) / dt);
				set('[data-live=traffic]', '↓ ' + util.fmtRate(rx) + '  ↑ ' + util.fmtRate(tx));
				set('[data-live=traffic-sub]', devName || wan.proto || '');
				this._hist.push({ rx: rx, tx: tx });
				if (this._hist.length > 120)
					this._hist = this._hist.slice(-120);
				saveHist(this._hist);
				this.drawSpark();
			}
			set('[data-live=traffic-total]', '↓ ' + util.fmtBytes(Number(stats.rx_bytes) || 0) +
				'  ↑ ' + util.fmtBytes(Number(stats.tx_bytes) || 0));
			this._lastStats = { t: now, rx: Number(stats.rx_bytes) || 0, tx: Number(stats.tx_bytes) || 0 };
		}
		set('[data-live=ring-mem]', mem.percent + '%');
		set('[data-live=ring-swap]', mem.swapPercent + '%');
		set('[data-live=ring-load]', (loads[0] || 0).toFixed(2));
		dial('mem', mem.percent);
		dial('swap', mem.swapPercent);
		dial('load', Math.min(100, Math.round((loads[0] || 0) * 100)));

		var hero = document.querySelector('[data-live=hero-uptime]');
		if (hero)
			hero.textContent = util.fmtDuration(data.info.uptime);

		var lanNode = document.querySelector('[data-live=hero-lan]');
		if (lanNode)
			lanNode.textContent = lan ? util.ip4(lan) : '–';
	},

	drawSpark: function () {
		var h = this._hist || [];
		var svg = document.querySelector('.ltc-spark');
		if (!svg || h.length < 2)
			return;

		var peakRx = 0, peakTx = 0;
		h.forEach(function (p) {
			if (p.rx > peakRx) peakRx = p.rx;
			if (p.tx > peakTx) peakTx = p.tx;
		});
		var max = Math.max(peakRx, peakTx, 1);

		svg.querySelector('.rx').setAttribute('d', sparkPath(h, 'rx', max));
		svg.querySelector('.tx').setAttribute('d', sparkPath(h, 'tx', max));

		var last = h[h.length - 1];
		var dot = document.querySelector('.ltc-spark-dot');
		if (dot) {
			var y = 58 - 54 * (Math.min(last.rx, max) / max);
			dot.style.display = '';
			dot.style.left = '99.5%';
			dot.style.top = (y / 60 * 100).toFixed(1) + '%';
		}

		function set(sel, text) {
			var el = document.querySelector(sel);
			if (el)
				el.textContent = text;
		}
		set('[data-live=spark-now]', '↓ ' + util.fmtRate(last.rx) + '  ↑ ' + util.fmtRate(last.tx));
		set('[data-live=peak-rx]', util.fmtRate(peakRx));
		set('[data-live=peak-tx]', util.fmtRate(peakTx));
		set('[data-live=spark-samples]', String(h.length));
	},

	updateCard: function (data) {
		var self = this;
		var net = (data && data.net) || {};
		var verLabel = E('b', {}, net.version || '—');
		var status = E('div', { 'class': 'ltc-help' },
			_('Checking for updates automatically…'));
		var checkBtn = E('button', { 'type': 'button', 'class': 'ltc-btn sm' }, _('Check for updates'));
		var updBtn = E('button', { 'type': 'button', 'class': 'ltc-btn sm primary', 'style': 'display:none' }, _('Update'));

		function setBusy(b) {
			checkBtn.disabled = b;
			updBtn.disabled = b;
		}
		function note(text, cls) {
			status.className = 'ltc-help';
			status.textContent = text;
		}

		/* The server-side check runs detached across mirrors and answers
		   {"checking":1} until a fresh result is cached; poll a few seconds. */
		function doCheck(attempt) {
			setBusy(true);
			if (attempt == null) {
				self._checkDeadline = Date.now() + 90000;
				attempt = 0;
			}
			note(_('Checking…'));
			return util.checkUpdate().then(function (res) {
				if (res && res.current)
					verLabel.textContent = res.current;
				if (res && res.checking && Date.now() < self._checkDeadline) {
					setTimeout(function () { doCheck(attempt + 1); }, 2500);
					return;
				}
				setBusy(false);
				if (!res || res.checking || res.error || !res.latest) {
					note(_('Unable to reach the update source. Check the network, or set a mirror in Appearance.'));
					return;
				}
				if (!res.current)
					verLabel.textContent = _('not installed');
				if (!res.available) {
					note(_('You are on the latest version (%s).').format(res.latest));
					updBtn.style.display = 'none';
				}
				else {
					note(_('A new version %s is available (current %s).').format(res.latest, res.current || '—'));
					updBtn.textContent = _('Update to %s').format(res.latest);
					updBtn.style.display = '';
				}
			}).catch(function () {
				setBusy(false);
				note(_('The update check failed.'));
			});
		}

		function pollStatus() {
			if (self._upTimer)
				clearInterval(self._upTimer);
			self._upSeen = false;
			self._upTimer = setInterval(function () {
				util.updateStatus().then(function (st) {
					if (!st)
						return;
					if (st.running) {
						self._upSeen = true;
						note((st.log || _('Updating…')).slice(-220));
						return;
					}
					/* The detached job may not have registered yet; keep polling
					 * until we either see it running or get a real exit code. */
					if (!self._upSeen && (st.code == null || st.code < 0))
						return;
					clearInterval(self._upTimer);
					self._upTimer = null;
					if (st.code === 0) {
						note(_('Update finished. Reloading…'));
						core.toast(_('Theme updated. Reloading…'), 'ok');
						setTimeout(function () { location.href = L.url('admin/home'); }, 1200);
					}
					else {
						note(_('Update failed. %s').format(st.log ? String(st.log).slice(-200) : ''));
						setBusy(false);
					}
				}).catch(function () {
					/* uhttpd may be restarting after the update; keep polling. */
				});
			}, 2000);
		}

		function doUpdate() {
			setBusy(true);
			note(_('Starting the update…'));
			return util.startUpdate().then(function (res) {
				if (!res || !res.ok)
					throw new Error((res && res.error) || _('The update could not be started'));
				pollStatus();
			}).catch(function (err) {
				setBusy(false);
				note(_('Update error: %s').format(err && err.message || String(err)));
			});
		}

		checkBtn.addEventListener('click', function () { doCheck(); });
		updBtn.addEventListener('click', doUpdate);

		/* Auto-check shortly after the page settles; cached server-side,
		   so this is cheap on repeat visits. */
		setTimeout(function () { doCheck(); }, 800);

		return card(_('Updates'), null, E('div', { 'class': 'ltc-update' }, [
			E('div', { 'class': 'ltc-hero-line' }, [E('small', {}, _('Installed version')), verLabel]),
			status,
			E('div', { 'class': 'ltc-row', 'style': 'gap:8px;margin-top:10px;flex-wrap:wrap' }, [checkBtn, updBtn])
		]));
	},

	render: function (data) {
		var board = data.board || {};
		var info = data.info || {};
		var mem = memoryOf(info);
		var loads = loadsOf(info);
		var wan = util.wan(data.ifaces);
		var lan = util.lan(data.ifaces, wan);
		var clients = clientsOf(data);
		var online = clients.filter(function (c) { return c.online; }).length;
		var wifi = wifiState(data.wifi);
		var release = (board.release && (board.release.description || board.release.revision)) || board.description || '';
		var hostname = board.hostname || 'OpenWrt';
		var uptime = util.fmtDuration(info.uptime);
		var wanIp = wan ? (util.ip4(wan) || _('Connected')) : _('Down');
		var lanIp = lan ? util.ip4(lan) : '';
		var wan6 = wan ? util.ip6(wan) : '';
		var lan6 = lan ? util.ip6(lan) : '';
		var gw = wan ? util.gateway(wan) : '';
		var dns = wan ? util.dns(wan) : [];
		var dnsStr = dns.length ? dns.slice(0, 2).join('  ') : '–';
		var storage = util.storage(data.storage);
		var storageStr = storage ? '%s / %s'.format(util.fmtBytes(storage.used), util.fmtBytes(storage.total)) : '–';
		var devName = wan && (wan['l3_device'] || wan['l3-device'] || wan.device);
		var dev = devName && data.devices && data.devices[devName];
		var stats0 = (wan && wan.statistics) || (dev && (dev.stats || dev.statistics));
		var totalStr = stats0
			? '↓ %s  ↑ %s'.format(util.fmtBytes(Number(stats0.rx_bytes) || 0), util.fmtBytes(Number(stats0.tx_bytes) || 0))
			: '–';
		var leaseCount = util.arr((data.leases && (data.leases.dhcp_leases || data.leases.leases)) || []).length;
		var net = data.net || {};
		var wifiStr = wifi.ssids.length
			? wifi.ssids.slice(0, 2).join(', ') + (wifi.ssids.length > 2 ? ' +' + (wifi.ssids.length - 2) : '')
			: '%d / %d %s'.format(wifi.up, wifi.total, _('radios'));
		var localTime = info.localtime ? new Date(info.localtime * 1000).toLocaleString() : '–';
		var upIfaces = data.ifaces.filter(function (i) { return i && i.up && i.interface !== 'loopback'; }).length;
		var greetingOn = document.documentElement.dataset.greeting !== '0';

		var hour = new Date().getHours();
		var greeting = hour < 5 ? _('Good night') : hour < 12 ? _('Good morning') : hour < 18 ? _('Good afternoon') : _('Good evening');

		var visibleClients = clients.slice(0, 6);

		var hero = E('section', { 'class': 'ltc-hero ltc-card' }, [
			E('div', {}, [
				E('span', { 'class': 'ltc-badge plain' }, [
					E('b', {}, hostname),
					' · ',
					release || _('OpenWrt')
				]),
				E('h1', {}, greeting + ', ' + hostname),
				E('p', { 'class': 'ltc-hero-sub' },
					_('Everything important about this router on one page — uplink, memory, devices and shortcuts.')),
				greetingOn ? E('p', { 'class': 'ltc-hero-quote', 'data-quote': '' }, dailyFallback()) : '',
				E('div', { 'class': 'ltc-hero-actions' }, [
					E('a', { 'class': 'ltc-btn primary', 'href': L.url('admin/clients') }, _('View devices')),
					E('a', { 'class': 'ltc-btn', 'href': L.url('admin/system/appearance') }, _('Appearance')),
					E('a', { 'class': 'ltc-btn ghost', 'href': L.url('admin/status/overview') }, _('System status'))
				])
			]),
			E('div', { 'class': 'ltc-hero-side' }, [
				line(_('WAN'), wanIp),
				E('div', { 'class': 'ltc-hero-line' }, [
					E('small', {}, _('LAN')),
					E('b', { 'data-live': 'hero-lan' }, lanIp || '–')
				]),
				line(_('Uptime'), uptime),
				line(_('Model'), board.model || board.system || '–')
			])
		]);

		var kpis = E('div', { 'class': 'ltc-kpis' }, [
			kpi(_('WAN address'), wanIp, wan ? (wan.proto || wan.device || '') : _('No default route'), 'wan'),
			kpi(_('Devices'), String(clients.length), _('%d active').format(online), 'devices'),
			kpi(_('Traffic'), '↓ –', _('WAN throughput'), 'traffic'),
			kpi(_('Uptime'), uptime, _('%s since boot').format(uptime), 'uptime'),
			kpi(_('Memory'), mem.percent + '%', '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total)), 'memory'),
			kpi(_('Storage'), storage ? storage.percent + '%' : '–', storageStr, 'storage')
		]);

		var topo = E('div', { 'class': 'ltc-topo' }, [
			node('globe', _('Internet'), wan ? 'ok' : 'bad'),
			wire(!wan),
			node('network', 'WAN', wan ? 'ok' : 'bad'),
			wire(false),
			node('router', _('Router'), 'me'),
			wire(false),
			node('laptop', _('LAN'), lan ? 'ok' : ''),
			wire(false),
			node('wifi', _('WiFi'), wifi.up ? 'ok' : '')
		]);

		var leaseRem = '–';
		var addr4 = util.arr(wan && wan['ipv4-address'])[0];
		if (addr4 && addr4.valid != null)
			leaseRem = util.fmtDuration(addr4.valid);
		else {
			/* PPPoE has no v4 lease; fall back to the DHCPv6 upstream. */
			var wan6i = data.ifaces.filter(function (i) { return i && i.interface === 'wan6'; })[0];
			var a6 = util.arr(wan6i && wan6i['ipv6-address'])[0];
			var p6 = util.arr(wan6i && wan6i['ipv6-prefix-assignment'])[0];
			var v6 = (a6 && a6.valid != null) ? a6.valid : (p6 && p6.valid != null ? p6.valid : null);
			if (v6 != null)
				leaseRem = util.fmtDuration(v6) + ' (v6)';
		}
		var wanUp = (wan && wan.uptime != null) ? util.fmtDuration(wan.uptime) : '–';

		var facts = E('div', { 'class': 'ltc-facts' }, [
			fact(_('Firmware'), release),
			fact(_('Kernel'), board.kernel || '–'),
			fact(_('Architecture'), board.system || '–'),
			fact(_('LAN address'), lanIp || '–'),
			fact(_('WiFi'), wifiStr),
			fact(_('WAN protocol'), wan ? (wan.proto || '–') : '–'),
			fact(_('WAN device'), devName || '–'),
			fact(_('Gateway'), gw || '–', 'gateway'),
			fact(_('DNS'), dnsStr, 'dns'),
			fact(_('WAN IPv6'), wan6 || '–'),
			fact(_('WAN uptime'), wanUp, 'wan-up'),
			fact(_('Lease remaining'), leaseRem, 'lease'),
			fact(_('Total traffic'), totalStr, 'traffic-total'),
			fact(_('DHCP leases'), String(leaseCount)),
			fact(_('Load average'), loads.length ? '%.2f  %.2f  %.2f'.format(loads[0] || 0, loads[1] || 0, loads[2] || 0) : '–')
		]);

		var networkCard = card(_('Network'), E('a', { 'class': 'ltc-link', 'href': L.url('admin/network/network') }, _('Manage') + ' →'),
			E([topo, facts]));

		var health = E('div', { 'class': 'ltc-rings' }, [
			ring(_('Memory'), mem.percent + '%', mem.percent, 'mem'),
			ring(_('Swap'), mem.swapPercent + '%', mem.swapPercent, 'swap'),
			ring(_('Load'), (loads[0] || 0).toFixed(2), Math.min(100, Math.round((loads[0] || 0) * 100)), 'load')
		]);

		var healthCard = card(_('System health'), null, E([
			health,
			E('div', { 'class': 'ltc-tags' }, [
				E('span', { 'class': 'ltc-tag' }, [E('b', {}, util.fmtBytes(mem.used)), ' / ', util.fmtBytes(mem.total), ' ', _('memory')]),
				E('span', { 'class': 'ltc-tag' }, [E('b', {}, util.fmtBytes(mem.avail)), ' ', _('available')]),
				mem.swapTotal ? E('span', { 'class': 'ltc-tag' }, [E('b', {}, util.fmtBytes(mem.swapUsed)), ' / ', util.fmtBytes(mem.swapTotal), ' swap']) : '',
				storage ? E('span', { 'class': 'ltc-tag' }, [E('b', {}, util.fmtBytes(storage.used)), ' / ', util.fmtBytes(storage.total), ' ', _('storage')]) : '',
				E('span', { 'class': 'ltc-tag' }, [E('b', {}, String(wifi.up)), ' / ', String(wifi.total), ' ', _('radios')])
			])
		]));

		var clientList = visibleClients.length
			? E('ul', { 'class': 'ltc-list' }, visibleClients.map(function (c) {
				return E('li', {}, [
					E('span', { 'class': 'ltc-dot' + (c.online ? '' : ' off') }),
					E('div', { 'class': 'grow' }, [
						E('b', {}, c.name || c.mac),
						E('small', {}, c.ips[0] || c.v6[0] || c.mac)
					]),
					E('span', { 'class': 'ltc-badge ' + (c.online ? 'ok' : 'plain') },
						c.online ? _('Active') : _('Known'))
				]);
			}))
			: E('div', { 'class': 'ltc-empty' }, _('No devices have been seen yet.'));

		var clientsCard = card(_('Devices'), E('a', { 'class': 'ltc-link', 'href': L.url('admin/clients') }, _('All devices') + ' →'), clientList);

		var acts = [];
		if (wifi.total > 0)
			acts.push(action(L.url('admin/network/wireless'), 'wifi', _('Wireless')));
		acts.push(action(L.url('admin/network/firewall'), 'shield', _('Firewall')));
		acts.push(action(L.url('admin/network/dhcp'), 'devices', _('DHCP leases')));
		acts.push(action(L.url('admin/system/package-manager'), 'download', _('Software')));
		acts.push(action(L.url('admin/status/logs'), 'info', _('Logs')));
		acts.push(action(L.url('admin/system/reboot'), 'refresh', _('Reboot')));

		var actionsCard = card(_('Quick actions'), null,
			E('div', { 'class': 'ltc-acts' }, acts));

		var systemFacts = E('div', { 'class': 'ltc-facts' }, [
			fact(_('Hostname'), hostname),
			fact(_('Model'), board.model || board.system || '–'),
			fact(_('Architecture'), board.system || '–'),
			fact(_('Kernel'), board.kernel || '–'),
			fact(_('Firmware'), release),
			fact(_('Local time'), localTime, 'sys-time'),
			fact(_('Active interfaces'), String(upIfaces)),
			fact(_('CPU cores'), net.cores != null && net.cores > 0 ? String(net.cores) : '–', 'cores'),
			fact(_('CPU temperature'), net.temp_c != null ? '%s °C'.format(net.temp_c) : '–', 'temp'),
			fact(_('Processes'), net.processes_total != null ? '%d / %d'.format(net.processes_running, net.processes_total) : '–', 'procs'),
			fact(_('Active connections'), net.conntrack != null ? '%d%s'.format(net.conntrack, net.conntrack_max ? ' / ' + net.conntrack_max : '') : '–', 'conns'),
			fact(_('Memory'), '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total))),
			fact(_('Swap'), mem.swapTotal ? '%s / %s'.format(util.fmtBytes(mem.swapUsed), util.fmtBytes(mem.swapTotal)) : _('None')),
			fact(_('Storage'), storageStr),
			fact(_('Load average'), loads.length ? '%.2f  %.2f  %.2f'.format(loads[0] || 0, loads[1] || 0, loads[2] || 0) : '–')
		]);

		var systemCard = card(_('System'), E('a', { 'class': 'ltc-link', 'href': L.url('admin/status/overview') }, _('Details') + ' →'), systemFacts);

		this._hist = loadHist();

		this.startPoll();
		if (greetingOn)
			Promise.resolve().then(L.bind(this.fetchGreeting, this));
		Promise.resolve().then(L.bind(this.drawSpark, this));

		return E('div', { 'class': 'ltc-stack' }, [
			hero,
			kpis,
			sparkCard(),
			E('div', { 'class': 'ltc-grid' }, [networkCard, healthCard]),
			E('div', { 'class': 'ltc-grid' }, [clientsCard, actionsCard]),
			E('div', { 'class': 'ltc-grid' }, [systemCard, this.updateCard(data)])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
