'use strict';
'require baseclass';
'require rpc';
'require lucent.util as util';

/*
 * Live status panel docked in the sidebar.
 *
 * The dashboard only shows these numbers on /admin/home; the sidebar is open
 * on every page, so it carries a compact always-on reading of the router.
 * Calls are tiered: the cheap counters run every tick, while the heavier
 * leases / wireless / storage reads run every few ticks.
 */

var callInfo = rpc.declare({ object: 'system', method: 'info' });
var callOverview = rpc.declare({ object: 'luci.lucent', method: 'overview' });
var callDevices = rpc.declare({ object: 'luci-rpc', method: 'getNetworkDevices' });
var callIfaces = rpc.declare({ object: 'network.interface', method: 'dump' });
var callLeases = rpc.declare({ object: 'luci-rpc', method: 'getDHCPLeases' });
var callHosts = rpc.declare({ object: 'luci-rpc', method: 'getHostHints' });
var callWifi = rpc.declare({ object: 'luci-rpc', method: 'getWirelessDevices' });
var callStorage = rpc.declare({ object: 'luci.lucent', method: 'storage' });

var TICK_MS = 5000;
var POINTS = 34;

var ROWS = [
	{ key: 'wan', label: 'WAN', href: 'admin/network/network' },
	{ key: 'lan', label: 'LAN', href: 'admin/network/network' },
	{ key: 'up', label: 'Uptime' },
	{ key: 'dev', label: 'Devices', href: 'admin/clients' },
	{ key: 'wifi', label: 'Wi-Fi', href: 'admin/network/wireless', optional: true },
	{ key: 'temp', label: 'Temp', optional: true }
];

function sv(name, attrs, children) {
	var el = document.createElementNS('http://www.w3.org/2000/svg', name);

	Object.keys(attrs || {}).forEach(function (k) {
		el.setAttribute(k, attrs[k]);
	});

	(children || []).forEach(function (c) {
		el.appendChild(c);
	});

	return el;
}

/* LuCI's E() builds HTML elements only, so chart nodes go through sv(). */
function areaPath(h, key, max) {
	if (h.length < 2)
		return '';

	var d = 'M0,24';
	h.forEach(function (p, i) {
		var x = (i * 100 / (h.length - 1)).toFixed(2);
		var y = (23 - 20 * (Math.min(Number(p[key]) || 0, max) / max)).toFixed(2);
		d += ' L' + x + ',' + y;
	});

	return d + ' L100,24 Z';
}

function memOf(info) {
	var m = (info && info.memory) || {};
	var total = Number(m.total) || 0;
	var cache = (Number(m.buffered || m.buffers) || 0) + (Number(m.cache) || 0);
	var avail = m.available != null ? Number(m.available) : (Number(m.free) || 0) + cache;

	return {
		total: total,
		used: Math.max(0, total - Math.min(total, avail)),
		percent: util.pct(Math.max(0, total - Math.min(total, avail)), total)
	};
}

function cpuOf(net, info) {
	var cores = Number(net.cores) || 0;
	var per = util.arr(net.cpus).map(function (v) { return Number(v); })
		.filter(function (v) { return isFinite(v) && v >= 0; });

	if (per.length)
		return Math.min(100, Math.round(per.reduce(function (a, b) { return a + b; }, 0) / per.length));

	var load = util.arr(info.load)[0];
	if (load != null)
		return Math.max(0, Math.min(100, Math.round((Number(load) / 65535) * 100 / Math.max(1, cores))));

	return 0;
}

function countsOf(hints, leases) {
	var list = util.hosts(hints, leases);
	return {
		total: list.length,
		online: list.filter(function (h) { return h.online; }).length
	};
}

function wifiOf(wifi) {
	var keys = Object.keys(wifi || {});
	var ssids = [];

	keys.forEach(function (k) {
		var w = wifi[k] || {};
		util.arr(w.interfaces).forEach(function (i) {
			var ssid = (i && i.config && i.config.ssid) || '';
			if (ssid && ssids.indexOf(ssid) === -1)
				ssids.push(ssid);
		});
	});

	if (!keys.length)
		return null;

	return '%d · %s'.format(keys.length, ssids[0] || _('no SSID'));
}

return baseclass.extend({
	init: function () {
		var side = document.querySelector('.ltc-side');
		if (!side || side.querySelector('.ltc-side-info'))
			return;

		this._hist = [];
		this._n = 0;
		this._dump = null;
		this.build(side);
		this.bind();
		this.tick();

		/* Re-rendering must not stack another pair of intervals on top of the
		   old ones: the closures keep the previous DOM alive forever. */
		if (this._timer)
			clearInterval(this._timer);
		if (this._clock)
			clearInterval(this._clock);

		this._timer = setInterval(L.bind(function () {
			if (!document.hidden)
				this.tick();
		}, this), TICK_MS);

		this._clock = setInterval(L.bind(this.drawClock, this), 1000);
		this.drawClock();

		if (!this._visibleBound) {
			this._visibleBound = true;
			document.addEventListener('visibilitychange', L.bind(function () {
				if (!document.hidden)
					this.tick();
			}, this));
		}
	},

	build: function (side) {
		var foot = side.querySelector('.ltc-side-foot') || side;
		var open = '1';

		/* On phones the drawer is short: an always-open 400px panel squeezed the
		   menu into a few rows and the rest of it fell out of sight. There the
		   panel starts collapsed unless the user chose otherwise. */
		if (window.innerWidth <= 980)
			open = '0';

		try {
			var stored = localStorage.getItem('lucent.sideinfo');
			if (stored === '0' || stored === '1')
				open = stored;
		} catch (e) {}

		this.root = E('section', { 'class': 'ltc-side-info', 'data-open': open }, [
			E('div', { 'class': 'ltc-si-head' }, [
				E('span', { 'class': 'ltc-si-name' }, [
					E('i', { 'class': 'ltc-si-dot' }),
					E('b', {}, _('Live status'))
				]),
				E('span', { 'class': 'ltc-si-clock', 'data-si': 'clock' }, '–'),
				E('button', {
					'type': 'button', 'class': 'ltc-si-btn', 'data-si-refresh': '',
					'title': _('Refresh now')
				}, util.icon('refresh')),
				E('button', {
					'type': 'button', 'class': 'ltc-si-btn', 'data-si-toggle': '',
					'title': _('Collapse panel')
				}, util.icon('chev'))
			]),
			E('div', { 'class': 'ltc-si-body' }, [
				E('div', { 'class': 'ltc-si-dials' }, [
					E('a', { 'class': 'ltc-si-dial', 'href': L.url('admin/home'), 'title': _('Open dashboard') }, [
						E('span', { 'class': 'dial', 'data-si-dial': 'cpu' }, E('b', { 'data-si': 'cpu' }, '–')),
						E('small', {}, _('CPU'))
					]),
					E('a', { 'class': 'ltc-si-dial', 'href': L.url('admin/home'), 'title': _('Open dashboard') }, [
						E('span', { 'class': 'dial', 'data-si-dial': 'mem' }, E('b', { 'data-si': 'mem' }, '–')),
						E('small', {}, _('Memory'))
					])
				]),
				E('div', { 'class': 'ltc-si-spark' }, [
					sv('svg', {
						'class': 'ltc-si-curve', 'viewBox': '0 0 100 24',
						'preserveAspectRatio': 'none', 'aria-hidden': 'true'
					}, [
						sv('defs', {}, [
							sv('linearGradient', { id: 'ltcSideG', x1: '0', y1: '0', x2: '0', y2: '1' }, [
								sv('stop', { offset: '0', 'stop-color': 'var(--accent)', 'stop-opacity': '0.55' }),
								sv('stop', { offset: '1', 'stop-color': 'var(--accent)', 'stop-opacity': '0.04' })
							])
						]),
						sv('path', { 'class': 'rx', 'fill': 'url(#ltcSideG)', 'd': '' })
					]),
					E('div', { 'class': 'ltc-si-rate' }, [
						E('span', { 'class': 'ltc-skel', 'data-si': 'rx' }, '↓ –'),
						E('span', { 'class': 'ltc-skel', 'data-si': 'tx' }, '↑ –')
					])
				]),
				E('ul', { 'class': 'ltc-si-rows' }, ROWS.map(function (r) {
					var kids = [
						E('small', {}, _(r.label)),
						E('b', { 'class': 'ltc-skel', 'data-si': r.key }, '–')
					];

					return E('li', {}, r.href
						? E('a', { 'class': 'ltc-si-row', 'href': L.url(r.href) }, kids)
						: E('div', { 'class': 'ltc-si-row' }, kids));
				})),
				E('div', { 'class': 'ltc-si-meter' }, [
					E('div', { 'class': 'ltc-si-mrow' }, [
						E('small', {}, _('Storage')),
						E('b', { 'class': 'ltc-skel', 'data-si': 'sto' }, '–')
					]),
					E('i', { 'class': 'ltc-si-track' }, E('u', { 'data-si-bar': 'sto' }))
				]),
				E('div', { 'class': 'ltc-si-tags' }, [
					E('span', { 'class': 'ltc-tag' }, [E('b', { 'class': 'ltc-skel', 'data-si': 'load' }, '–'), ' ', _('load')]),
					E('span', { 'class': 'ltc-tag' }, [E('b', { 'class': 'ltc-skel', 'data-si': 'ct' }, '–'), ' ', _('connections')]),
					E('span', { 'class': 'ltc-tag' }, [E('b', { 'class': 'ltc-skel', 'data-si': 'procs' }, '–'), ' ', _('processes')])
				])
			])
		]);

		side.insertBefore(this.root, foot);
	},

	bind: function () {
		var self = this;
		var toggle = this.root.querySelector('[data-si-toggle]');
		var refresh = this.root.querySelector('[data-si-refresh]');

		toggle.title = this.root.dataset.open === '1' ? _('Collapse panel') : _('Expand panel');

		toggle.addEventListener('click', function () {
			var open = self.root.dataset.open === '1';
			self.root.dataset.open = open ? '0' : '1';
			toggle.title = open ? _('Expand panel') : _('Collapse panel');
			try {
				localStorage.setItem('lucent.sideinfo', open ? '0' : '1');
			} catch (e) {}
		});

		refresh.addEventListener('click', function () {
			refresh.classList.add('spin');
			setTimeout(function () { refresh.classList.remove('spin'); }, 700);
			self._n = 0;
			self.tick();
		});
	},

	/* Only touch the DOM when the reading actually changed, so the flash
	   animation marks real movement instead of firing on every tick. The
	   shimmer is dropped either way: a value that stays "–" is a real
	   reading, not a pending one. */
	set: function (key, text) {
		var el = this.root.querySelector('[data-si=' + key + ']');
		text = String(text);

		if (!el)
			return;

		el.classList.remove('ltc-skel');

		if (el.textContent === text)
			return;

		el.textContent = text;
		el.classList.remove('ltc-flash');
		void el.offsetWidth;
		el.classList.add('ltc-flash');
	},

	dial: function (key, percent) {
		var el = this.root.querySelector('[data-si-dial=' + key + ']');
		if (el)
			el.style.setProperty('--val', String(percent));
	},

	drawClock: function () {
		var now = new Date();
		var el = this.root.querySelector('[data-si=clock]');

		if (!el)
			return;

		el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		el.title = now.toLocaleDateString();
	},

	needed: function (every) {
		return this._n === 1 || this._n % every === 0;
	},

	tick: function () {
		var self = this;
		this._n++;

		var jobs = [
			L.resolveDefault(callInfo(), {}),
			L.resolveDefault(callOverview(), {}),
			L.resolveDefault(callDevices(), {})
		];

		if (this.needed(3))
			jobs.push(L.resolveDefault(callIfaces(), { interface: [] }));
		else
			jobs.push(Promise.resolve(null));

		if (this.needed(6))
			jobs.push(L.resolveDefault(callHosts(), {}), L.resolveDefault(callLeases(), {}));
		else
			jobs.push(Promise.resolve(null), Promise.resolve(null));

		if (this.needed(12))
			jobs.push(L.resolveDefault(callWifi(), {}), L.resolveDefault(callStorage(), {}));
		else
			jobs.push(Promise.resolve(null), Promise.resolve(null));

		Promise.all(jobs).then(function (r) {
			var info = r[0] || {}, net = r[1] || {}, devices = r[2] || {};
			var mem = memOf(info);
			var cpu = cpuOf(net, info);

			self.set('cpu', cpu + '%');
			self.dial('cpu', cpu);
			self.set('mem', mem.percent + '%');
			self.dial('mem', mem.percent);
			self.root.querySelector('[data-si-dial=cpu]').title =
				_('%d cores · %s °C').format(Number(net.cores) || 0, net.temp_c != null ? net.temp_c : '–');
			self.root.querySelector('[data-si-dial=mem]').title =
				_('Used %s of %s').format(util.fmtBytes(mem.used), util.fmtBytes(mem.total));

			self.set('up', util.fmtDuration(info.uptime));
			self.set('load', net.load1 || (util.arr(info.load)[0] != null
				? (Number(util.arr(info.load)[0]) / 65535).toFixed(2) : '–'));
			self.set('ct', net.conntrack != null
				? '%s/%s'.format(net.conntrack, net.conntrack_max || '?') : '–');
			self.set('procs', net.processes_total != null
				? '%s/%s'.format(net.processes_running, net.processes_total) : '–');

			self.row('temp', net.temp_c != null, net.temp_c + ' °C');

			/* The dump only refreshes every few ticks, but the byte counters do
			   not — keeping the last dump lets the curve get a point per tick. */
			if (r[3])
				self._dump = r[3];

			if (self._dump)
				self.updateNet(self._dump, devices);

			if (r[4] && r[5]) {
				var c = countsOf(r[4], r[5]);
				var li = self.root.querySelector('[data-si=dev]').closest('li');
				li.title = _('%d of %d known hosts online').format(c.online, c.total);
				self.row('dev', true, '%d/%d'.format(c.online, c.total));
			}

			if (r[6]) {
				var w = wifiOf(r[6]);
				self.row('wifi', w != null, w || '–');
			}

			if (r[7]) {
				var sto = util.storage(r[7]);
				var meter = self.root.querySelector('.ltc-si-meter');
				var bar = self.root.querySelector('[data-si-bar=sto]');

				if (sto && meter && bar) {
					meter.style.display = '';
					self.set('sto', '%d%%'.format(sto.percent));
					bar.style.width = sto.percent + '%';
					bar.className = sto.percent >= 90 ? 'hi' : '';
					meter.title = _('%s free of %s').format(util.fmtBytes(sto.free), util.fmtBytes(sto.total));
				}
				else if (meter) {
					meter.style.display = 'none';
				}
			}
		}).catch(function () {});
	},

	/* Optional rows are hidden rather than left as "–", since an empty reading
	   there is normal (no sensor, no radio) rather than an error. */
	row: function (key, visible, text) {
		var li = this.root.querySelector('[data-si=' + key + ']');
		li = li && li.closest('li');

		if (!li)
			return;

		if (!visible) {
			li.style.display = 'none';
			return;
		}

		li.style.display = '';
		if (text != null)
			this.set(key, text);
	},

	updateNet: function (dump, devices) {
		var ifaces = util.arr(dump && dump.interface);
		var wan = util.wan(ifaces);
		var lan = util.lan(ifaces, wan);

		this.row('wan', true, wan
			? (util.ip4(wan) || _('Connected')) : _('Down'));
		this.root.querySelector('[data-si=wan]').closest('li').title = wan
			? '%s · %s'.format(wan.proto || '', util.gateway(wan) || _('no gateway'))
			: _('No default route');

		this.row('lan', true, lan ? util.ip4(lan) : '–');

		var name = wan && (wan['l3_device'] || wan.device);
		var stats = wan && wan.statistics;
		var dev = name && devices[name];

		if (!stats && dev)
			stats = dev.stats || dev.statistics;

		if (!stats)
			return;

		var now = Date.now();
		var rx = Number(stats.rx_bytes) || 0, tx = Number(stats.tx_bytes) || 0;

		if (this._prev) {
			var dt = Math.max(1, (now - this._prev.t) / 1000);
			this._hist.push({
				t: now,
				rx: Math.max(0, (rx - this._prev.rx) / dt),
				tx: Math.max(0, (tx - this._prev.tx) / dt)
			});

			if (this._hist.length > POINTS)
				this._hist = this._hist.slice(-POINTS);

			this.drawSpark();
		}

		this._prev = { t: now, rx: rx, tx: tx };
	},

	drawSpark: function () {
		var h = this._hist;
		var curve = this.root.querySelector('.ltc-si-curve');
		var last = h[h.length - 1];
		var max = 1;

		if (!curve || !last)
			return;

		h.forEach(function (p) {
			if (p.rx > max) max = p.rx;
			if (p.tx > max) max = p.tx;
		});

		curve.querySelector('.rx').setAttribute('d', areaPath(h, 'rx', max));
		this.set('rx', '↓ ' + util.fmtRate(last.rx));
		this.set('tx', '↑ ' + util.fmtRate(last.tx));
	}
});
