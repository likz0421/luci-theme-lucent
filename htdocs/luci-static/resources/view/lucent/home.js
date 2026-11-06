'use strict';
'require view';
'require poll';
'require lucent.core as core';
'require lucent.util as util';

function line(label, value, key) {
	return E('div', { 'class': 'ltc-hero-line' }, [
		E('small', {}, label),
		E('b', key ? { 'data-live': key } : {}, value || '–')
	]);
}

/* The reference writes one identity line under the headline — what this box
   is, what it runs, what time it thinks it is and how many hosts it holds.
   Statistics live in the tiles; this line answers "which router am I on?". */
function heroChain(model, release, when, clients) {
	return [model, release, when, plural(clients, 'client', 'clients')]
		.filter(Boolean).join(' · ');
}

/* A KPI card with one number and one small line leaves most of the tile empty;
   `meter` puts a proportion under it, which is the information the number
   alone withholds (26% of what, and how full is that?). `word` is the
   reference's habit of putting the qualifier inside the big line — 可用 87%
   reads faster than a label that has to be matched to a number by eye. */
function kpi(label, value, sub, key, meter, word, state) {
	return E('div', { 'class': 'ltc-kpi' }, [
		/* the reference marks every tile that passes and leaves the failing
		   ones plain, so a wall of green is itself the answer — and the mark
		   sits in front of the label, which is where the eye reads it */
		E('small', {}, [
			E('i', { 'class': 'ltc-kcheck ' + (state || 'ok'), 'data-live': key ? key + '-state' : undefined },
				util.icon('check')),
			label
		]),
		E('b', {}, [word ? E('em', { 'class': 'kword' }, word + ' ') : '',
			E('span', key ? { 'data-live': key } : {}, value)]),
		E('span', key ? { 'data-live': key + '-sub' } : {}, sub),
		meter != null ? E('i', { 'class': 'ltc-kmeter' }, E('u', {
			'style': 'width:%d%%'.format(Math.max(2, Math.min(100, Math.round(meter)))),
			'data-live': key ? key + '-meter' : ''
		})) : ''
	]);
}

function kstate(key, ok) {
	var el = document.querySelector('[data-live=' + key + '-state]');

	if (el)
		el.className = 'ltc-kcheck ' + (ok ? 'ok' : 'warn');
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

/* gettext has no plural table here, so the two forms are spelled out. */
function plural(n, one, many) {
	return '%d %s'.format(n, n === 1 ? _(one) : _(many));
}

/* "实时 · 4 秒前" has to age between polls or it is a lie, and it has to be
   honest about how stale the numbers on screen are. */
function tickSince(self) {
	var el = document.querySelector('[data-live=hero-since]');

	if (!el)
		return;

	var s = Math.round((Date.now() - (self._since || Date.now())) / 1000);
	var txt = s < 3 ? _('just now') : _('%ds ago').format(s);

	if (el.textContent !== txt)
		el.textContent = txt;
}

/* One memory model, shared with the sidebar panel, so the two can never
   disagree about what "used" means. */
function memoryOf(info) {
	return util.mem(info);
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

/* Traffic history survives page navigation, tab close and a browser restart:
   sessionStorage would leave the trend card empty on every fresh page, which
   is the "half an empty card" the day-to-day complaint is about. Keyed by day
   so yesterday's curve does not stretch today's axis. */
function dayKey() {
	var d = new Date();

	/* Local, not UTC: a UTC+8 router would otherwise roll "today" at 08:00 and
	   reset the trend history and the daily peak mid-afternoon. */
	return '%04d-%02d-%02d'.format(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function histKey() {
	return 'lucent.hist.' + dayKey();
}

/* Yesterday's keys would otherwise pile up in localStorage forever. */
function pruneDaily() {
	try {
		var drop = [];

		Object.keys(localStorage).forEach(function (k) {
			if (/^lucent\.(hist|peak|quote|events)\./.test(k) && k.slice(k.lastIndexOf('.') + 1) !== dayKey())
				drop.push(k);
		});
		drop.forEach(function (k) { localStorage.removeItem(k); });
	} catch (e) {}
}

function loadHist() {
	var out = [];

	try {
		var raw = localStorage.getItem(histKey());
		out = raw ? JSON.parse(raw) : [];
	} catch (e) {
		return [];
	}

	/* a browser left open for days would keep every earlier day's tail */
	var dayAgo = Date.now() - 86400000;
	return out.filter(function (p) { return p && p.t > dayAgo; }).slice(-120);
}

function saveHist(h) {
	try {
		localStorage.setItem(histKey(), JSON.stringify(h.slice(-120)));
		pruneDaily();
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

/* LuCI's E() has no SVG namespace support; build these nodes manually. */
function svgel(name, attrs, children) {
	var el = document.createElementNS('http://www.w3.org/2000/svg', name);
	Object.keys(attrs || {}).forEach(function (k) {
		el.setAttribute(k, attrs[k]);
	});
	(children || []).forEach(function (c) {
		el.appendChild(c);
	});
	return el;
}

function sparkCard() {
	var grad = function (id, color) {
		return svgel('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' }, [
			svgel('stop', { offset: '0', 'stop-color': color, 'stop-opacity': '0.5' }),
			svgel('stop', { offset: '1', 'stop-color': color, 'stop-opacity': '0.05' })
		]);
	};

	var svg = svgel('svg', { 'class': 'ltc-spark', viewBox: '0 0 100 60', preserveAspectRatio: 'none', 'aria-hidden': 'true', style: 'position:absolute;inset:0;width:100%;height:100%' }, [
		svgel('defs', {}, [grad('ltcGRx', 'var(--accent)'), grad('ltcGTx', 'var(--ok)')]),
		svgel('path', { 'class': 'tx', fill: 'url(#ltcGTx)', d: '' }),
		svgel('path', { 'class': 'rx', fill: 'url(#ltcGRx)', d: '' })
	]);

	return E('section', { 'class': 'ltc-card ltc-sparkcard' }, [
		E('div', { 'class': 'ltc-card-h' }, [
			E('div', {}, [
				E('h3', {}, _('Traffic trend')),
				E('p', { 'class': 'ltc-muted' }, _('Downlink and uplink rates sampled every 10 seconds.'))
			]),
			E('span', { 'class': 'ltc-badge plain', 'data-live': 'spark-now' }, '↓ –  ↑ –')
		]),
		E('div', { 'class': 'ltc-sparkwrap', 'style': 'position:relative;height:88px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--card-2)' }, [
			svg,
			E('i', { 'class': 'ltc-spark-dot', 'style': 'display:none' }),
			E('div', { 'class': 'ltc-spark-tip', 'style': 'display:none' })
		]),
		E('div', { 'class': 'ltc-spark-ticks' }, [
			E('span', { 'data-live': 'tick-0' }, ''),
			E('span', { 'data-live': 'tick-1' }, ''),
			E('span', { 'data-live': 'tick-2' }, ''),
			E('span', { 'data-live': 'tick-3' }, _('now'))
		]),
		E('div', { 'class': 'ltc-tags' }, [
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'peak-rx' }, '–'), ' ', _('peak down')]),
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'peak-tx' }, '–'), ' ', _('peak up')]),
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'day-peak' }, '–'), ' ', _('today peak')]),
			E('span', { 'class': 'ltc-tag' }, [E('b', { 'data-live': 'spark-samples' }, '0'), ' ', _('samples')])
		])
	]);
}

/* Animated counter for live KPI numbers. */
function setNum(sel, value, suffix) {
	var el = document.querySelector(sel);
	if (!el)
		return;
	/* render() writes the first value straight into the text, so _num is
	   usually still unset here — reading the displayed number instead makes
	   the animation start where the user already sees it rather than at zero */
	var from = Number(el._num);

	if (isNaN(from)) {
		var m = String(el.textContent).match(/-?\d+(?:\.\d+)?/);
		from = m ? Number(m[0]) : 0;
	}
	if (from === value) {
		el.textContent = value + suffix;
		return;
	}
	el._num = value;

	/* A poll landing mid-animation used to start a second frame chain on the
	   same element; the two then fought over textContent forever. */
	if (el._raf)
		cancelAnimationFrame(el._raf);

	/* t0 comes from the first rAF timestamp, not performance.now(): the two
	   clocks differ under a throttled tab or a virtual-time harness, and a
	   negative progress made the easing overshoot below zero — which is how
	   "Memory 56%" once rendered as "-118%". */
	var t0 = null;

	function step(t) {
		if (t0 === null)
			t0 = t;
		var k = (t - t0) / 450;
		k = k < 0 ? 0 : (k > 1 ? 1 : k);
		var e = 1 - Math.pow(1 - k, 3);

		el.textContent = (k >= 1 ? value : Math.round(from + (value - from) * e)) + suffix;
		el._raf = k < 1 ? requestAnimationFrame(step) : null;
	}

	el._raf = requestAnimationFrame(step);
}

/* The interface moving the most bytes right now, from the same counter deltas
   the tiles use. Null until there is a second sample to diff against. */
function busiestIface(self, data) {
	var now = Date.now();
	var best = null;

	self._lastDev = self._lastDev || {};

	util.arr(data.ifaces).forEach(function (i) {
		if (!i || !i.up || i.interface === 'loopback')
			return;

		var dn = i['l3_device'] || i.device;
		var dd = dn && data.devices && data.devices[dn];
		var ds = dd && (dd.stats || dd.statistics);

		if (!ds)
			return;

		var p = self._lastDev[i.interface];

		if (p) {
			var dt = Math.max(1, (now - p.t) / 1000);
			var rx = Math.max(0, (Number(ds.rx_bytes) - p.rx) / dt);
			var tx = Math.max(0, (Number(ds.tx_bytes) - p.tx) / dt);

			if (!best || rx + tx > best.rx + best.tx)
				best = { name: i.interface, rx: rx, tx: tx };
		}

		self._lastDev[i.interface] = { t: now, rx: Number(ds.rx_bytes) || 0, tx: Number(ds.tx_bytes) || 0 };
	});

	return best;
}

/* Per-netdev throughput, keyed by the name the tree shows (wlan0, lan1, …).
   The interface-level sampler above only knows logical interfaces; a branch
   needs the counters of the device that carries it, and those live in
   getNetworkDevices under the netdev name. */
function netdevRates(self, data) {
	var now = Date.now();
	var out = {};

	self._lastNet = self._lastNet || {};
	Object.keys(data.devices || {}).forEach(function (name) {
		var d = data.devices[name];
		var st = d && (d.stats || d.statistics);
		if (!st)
			return;

		var rx = Number(st.rx_bytes) || 0;
		var tx = Number(st.tx_bytes) || 0;
		var prev = self._lastNet[name];

		if (prev) {
			var dt = Math.max(1, (now - prev.t) / 1000);
			var drx = (rx - prev.rx) / dt;
			var dtx = (tx - prev.tx) / dt;
			/* counters are 32-bit on some targets and wrap, or restart on boot */
			out[name] = {
				rx: drx >= 0 ? drx : 0,
				tx: dtx >= 0 ? dtx : 0
			};
		}
		self._lastNet[name] = { t: now, rx: rx, tx: tx };
	});

	return out;
}

/* The physical port a MAC was learned on, and that port's link speed — the
   reference writes "1 Gbit/s" on a wired leaf, which is a fact the bridge
   already knows even when conntrack accounting is off. */
function portOfMac(topo, fdb, mac) {
	var dev = fdb[macKey(mac)];

	if (!dev)
		return null;
	return util.arr(topo.ports).filter(function (p) { return p && p.device === dev; })[0] || { device: dev };
}

function pathCard(data, wan, lan, wifiDump, hostname) {
	var info = data.info || {};
	var board = data.board || {};
	var dns = wan ? util.dns(wan) : [];
	var lanMask = util.arr(lan && lan['ipv4-address'])[0];
	var mem = memoryOf(info);
	var sig = signalStats(data);
	var band = bandStats(data);

	function psum(label, value, key, sub, subKey) {
		return E('div', { 'class': 'ltc-psum' }, [
			E('small', {}, label),
			E('b', key ? { 'data-live': key } : {}, value),
			E('small', { 'class': 'psub', 'data-live': subKey || undefined }, sub || '')
		]);
	}

	var hosts = clientsOf(data);
	var byMac = {};
	var assoc = data.assoc || {};
	var radios = data.radios || {};
	var topo = data.topology || {};
	var fdb = util.fdbMap(topo);
	var ports = util.arr(topo.ports);

	hosts.forEach(function (h) {
		if (h.mac)
			byMac[macKey(h.mac)] = h;
	});

	function signalClass(sig) {
		if (!isFinite(sig))
			return '';
		if (sig >= -60)
			return ' good';
		if (sig >= -75)
			return ' ok';
		return ' weak';
	}

	function isPrivateMac(mac) {
		var first = parseInt(String(mac || '').slice(0, 2), 16);

		if (isNaN(first))
			return false;
		return (first & 0x02) === 0x02;
	}

	/* One box in the graph. Children hang to the right in a flex column, so the
	   fan-out depth is not fixed; the connector curves are drawn over the whole
	   thing afterwards by measuring the boxes, which keeps this markup plain. */
	function gnode(o) {
		var inner = [];
		var txt = E('div', { 'class': 'gtxt' }, [
			E('b', {}, o.title),
			o.l1 ? E('small', { 'class': 'g1' }, o.l1) : '',
			o.l2 ? E('small', { 'class': 'g2' }, o.l2) : ''
		]);

		if (o.badge)
			inner.push(E('b', { 'class': 'ltc-band' + (o.badgeCls || '') }, o.badge));
		if (o.icon)
			inner.push(E('span', { 'class': 'ic' }, util.icon(o.icon)));

		inner.push(txt);

		/* a branch carries its rate as a third line, like the reference; only a
		   leaf wears it as a pill, because a leaf is one line by design */
		if (o.live) {
			var pill = E('small', { 'class': 'grate', 'data-live': o.live }, '–');

			if (o.cls && o.cls.indexOf('leaf') === 0)
				txt.appendChild(pill);
			else
				inner.push(pill);
		}

		if (o.dots)
			inner.push(E('span', { 'class': 'ltc-gdots' }, o.dots.map(function (cls) {
				return E('i', { 'class': cls });
			})));

		var box = E('div', { 'class': 'ltc-grow' });
		box.appendChild(E(o.href ? 'a' : 'div', {
			'class': 'ltc-gnode ' + (o.cls || ''),
			'href': o.href || undefined,
			'title': o.title2 || '',
			'data-gr': o.gr || undefined,
			'data-grkind': o.kind || undefined
		}, inner));

		if (o.kids && o.kids.length) {
			var wrap = E('div', { 'class': 'ltc-gkids' });
			var kids = o.kids;
			var rest = o.cap && kids.length > o.cap ? kids.slice(o.cap) : [];
			var more = null;

			kids.slice(0, o.cap ? o.cap : kids.length).forEach(function (k) {
				wrap.appendChild(gnode(k));
			});

			/* Overflow stays one click away instead of a wall of boxes: a tall
			   graph pushes the summary strip below the fold on a laptop. */
			if (rest.length) {
				more = E('div', { 'class': 'ltc-grow' }, [
					E('div', {
						'class': 'ltc-gnode more',
						'click': function () {
							rest.forEach(function (k) { wrap.appendChild(gnode(k)); });
							if (more.parentNode)
								more.parentNode.removeChild(more);
							drawGraphLinks();
						}
					}, [
						E('span', { 'class': 'ic' }, util.icon('chev')),
						E('div', { 'class': 'gtxt' }, [
							E('b', {}, _('%d more').format(rest.length)),
							E('small', { 'class': 'g1' }, _('expand'))
						])
					])
				]);
				wrap.appendChild(more);
			}

			box.appendChild(wrap);
		}
		return box;
	}

	/* A device box. `seen` records the MAC, so the last branch can tell which
	   hosts neither a radio nor a bridge entry claimed. */
	function deviceLeaf(mac, wired, seen) {
		var h = byMac[macKey(mac)] || {};
		var st = stationOf(assoc, mac) || {};
		var p = wired ? portOfMac(topo, fdb, mac) : null;
		var priv = isPrivateMac(mac);
		var ip = util.arr(h.ips)[0] || '';

		if (seen)
			seen[macKey(mac)] = true;

		/* the leaf earns its line by what it says: a link speed or a signal
		   reading, and only as a last resort the MAC of a named device */
		var bits = [];

		if (p && p.speed)
			bits.push(linkRate(p.speed));
		if (isFinite(st.signal))
			bits.push('%d dBm'.format(st.signal));
		if (!bits.length && !wired && h.name)
			bits.push(mac);

		return {
			cls: 'leaf' + (h.online ? ' up' : '') + (priv ? ' priv' : ''),
			icon: wired ? 'devices' : 'laptop',
			href: L.url('admin/clients'),
			/* one line, like the reference: who it is, how it sounds, how fast
			   it is going. The address belongs to the devices page and the
			   tooltip, not to a box 210 px wide */
			title: h.name || (priv ? _('Private device') : mac),
			l2: bits.join(' · '),
			dots: !wired && isFinite(st.signal) ? [signalClass(st.signal).trim()] : null,
			live: ip ? 'leaf-' + ip.replace(/\./g, '-') : undefined,
			title2: '%s · %s%s'.format(h.name || mac, mac, ip ? ' · ' + ip : '')
		};
	}

	function bandCls(band) {
		return band === '5 GHz' ? ' b5' : (band === '6 GHz' ? ' b6' : ' b24');
	}

	function chLine(info) {
		var chline = [];

		if (info.channel != null)
			chline.push(_('channel %d').format(info.channel));
		if (info.width)
			chline.push('%d MHz'.format(info.width));

		return chline.join(' · ');
	}

	function ssidKids(dev, showRate) {
		var stations = util.arr(assoc[dev]);

		return {
			cls: 'ssid ' + (stations.length ? 'up' : 'down'),
			icon: 'shield',
			title: ssidForNetdev(wifiDump, dev) || dev,
			l1: stations.length ? plural(stations.length, 'client', 'clients') : _('no clients'),
			dots: stations.length ? stations.map(function (s) {
				return signalClass(s && s.signal).trim();
			}) : null,
			/* with one VAP on a radio the radio box already carries that
			   netdev's rate; a second box with the same number is noise */
			gr: showRate ? dev : undefined,
			kind: 'ssid',
			live: showRate ? 'gr-' + dev : undefined,
			cap: 6,
			kids: stations.map(function (s) { return deviceLeaf(s.mac, false, seen); })
		};
	}

	/* The reference gives the radio and the SSID one box each: the radio owns
	   band, generation, channel and width, the SSID owns the key icon, the name
	   and the row of signal dots. A radio with several VAPs lists them all. */
	function radioGroup(key, nets) {
		var dev = nets.filter(function (d) { return radios[d]; })[0] || nets[0];
		var info = radios[dev] || {};
		var count = nets.reduce(function (n, d) { return n + util.arr(assoc[d]).length; }, 0);

		return {
			cls: 'radio up',
			badge: info.band || '',
			badgeCls: bandCls(info.band),
			icon: 'wifi',
			title: info.generation || key,
			l1: chLine(info) || plural(count, 'client', 'clients'),
			gr: dev,
			kind: 'radio',
			live: 'gr-' + dev,
			cap: 4,
			kids: nets.map(function (d) { return ssidKids(d, nets.length > 1); })
		};
	}

	/* Fallback for a build whose wireless dump names no interface: the netdev
	   becomes both boxes at once, so its clients still hang somewhere. */
	function radioBranch(dev) {
		var info = radios[dev] || {};
		var stations = util.arr(assoc[dev]);

		return {
			cls: 'radio up',
			badge: info.band || '',
			badgeCls: bandCls(info.band),
			icon: 'wifi',
			title: dev,
			l1: [stations.length
				? plural(stations.length, 'client', 'clients')
				: _('no clients'), info.generation].filter(Boolean).join(' · '),
			l2: chLine(info),
			gr: dev,
			kind: 'radio',
			live: 'gr-' + dev,
			cap: 6,
			kids: stations.map(function (s) { return deviceLeaf(s.mac, false, seen); })
		};
	}

	function wirelessBranches() {
		var devs = ports.filter(function (p) { return p && p.wireless; }).map(function (p) { return p.device; });
		var claimed = {};
		var groups = [];

		Object.keys(wifiDump || {}).forEach(function (key) {
			var nets = util.arr((wifiDump[key] || {}).interfaces)
				.map(function (i) { return i && (i.ifname || i.section || i['.name']); })
				.filter(function (d) { return d && devs.indexOf(d) >= 0 && !claimed[d]; });

			if (!nets.length)
				return;

			nets.forEach(function (d) { claimed[d] = true; });
			groups.push(radioGroup(key, nets));
		});

		return groups.concat(devs.filter(function (d) { return !claimed[d]; }).map(radioBranch));
	}

	function wiredBranch() {
		var wired = ports.filter(function (p) { return p && !p.wireless; });
		var groups = {};
		var order = [];
		var idle = [];

		wired.forEach(function (p) {
			/* a station that also shows up in the forwarding table is one device,
			   not two — the radios claim it first */
			var macs = Object.keys(fdb).filter(function (m) {
				return fdb[m] === p.device && !seen[m];
			});

			if (!macs.length && p.state !== 'up') {
				idle.push(p.label || p.device);
				return;
			}
			groups[p.label || p.device] = { port: p, macs: macs };
			if (order.indexOf(p.label || p.device) < 0)
				order.push(p.label || p.device);
		});

		var kids = order.map(function (name) {
			var g = groups[name];
			return {
				cls: 'port ' + (g.port.state === 'up' ? 'up' : 'down'),
				icon: 'network',
				title: name,
				l1: plural(g.macs.length, 'device', 'devices'),
				l2: g.port.speed ? linkRate(g.port.speed) : '',
				gr: g.port.device,
				kind: 'port',
				live: 'gr-' + g.port.device,
				cap: 6,
				kids: g.macs.map(function (m) { return deviceLeaf(m, true, seen); })
			};
		});

		var total = kids.reduce(function (n, k) { return n + k.kids.length; }, 0);

		/* A 24-port switch is mostly empty sockets. They belong on one line, not
		   on twenty-four boxes nobody clicks. */
		if (idle.length) {
			kids.push({
				cls: 'other',
				icon: 'network',
				title: plural(idle.length, 'idle port', 'idle ports'),
				l1: idle.slice(0, 8).join(' · ') + (idle.length > 8 ? ' …' : ''),
				kind: 'idle'
			});
		}

		if (!kids.length)
			return null;

		return {
			cls: 'wired up',
			icon: 'network',
			title: _('Wired'),
			l1: plural(total, 'device', 'devices'),
			live: 'gr-wired',
			cap: 8,
			kids: kids
		};
	}

	/* Hosts the bridge and the radios never mentioned — a client behind a
	   switch we don't poll, or a lease that outlived its link. Dropping them
	   would make the count disagree with the devices page. */
	function otherBranch() {
		var orphans = hosts.filter(function (h) { return h.mac && !seen[macKey(h.mac)]; });

		if (!orphans.length)
			return null;

		return {
			cls: 'stray up',
			icon: 'devices',
			title: _('Other devices'),
			l1: plural(orphans.length, 'device', 'devices'),
			cap: 6,
			kids: orphans.map(function (h) { return deviceLeaf(h.mac, false, null); })
		};
	}

	var seen = {};
	var radioKids = wirelessBranches();
	var wired = wiredBranch();
	var other = otherBranch();
	var branches = radioKids.concat(wired ? [wired] : [], other ? [other] : []);

	/* One descriptor tree; gnode() is what turns it into boxes, so nothing
	   here may hand it an already-built element. */
	var rootDesc = {
		cls: 'wan ' + (wan && wan.up ? 'up' : 'down'),
		icon: 'globe',
		href: L.url('admin/status/realtime/traffic'),
		title: _('Internet'),
		l1: wan ? (util.ip4(wan) || _('Connected')) : _('Down'),
		l2: dns.length ? 'DNS ' + dns[0] : '',
		/* filled by the same netdev diff as every other branch, keyed by the
		   device the uplink actually runs over */
		gr: (wan && (wan['l3_device'] || wan.device)) || undefined,
		kind: 'wan',
		live: 'gr-' + ((wan && (wan['l3_device'] || wan.device)) || 'wan'),
		kids: [{
			cls: 'me up',
			icon: 'router',
			href: L.url('admin/status/overview'),
			title: hostname,
			l1: lanIpOf(lan) + (board.model ? ' · ' + board.model : ''),
			l2: util.fmtDuration(info.uptime),
			live: 'path-conn',
			kids: branches
		}]
	};

	var graph = E('div', { 'class': 'ltc-graph' }, [gnode(rootDesc)]);

	return card(_('Network path'), E('span', { 'class': 'ltc-muted ltc-ghint' }, _('Click any node for details')),
		E('div', {}, [
			E('div', { 'class': 'ltc-graphwrap' }, [graph]),
			E('div', { 'class': 'ltc-pathsum' }, [
				psum(_('Clients'), String(connectedCount(data) || hosts.length), 'path-clients',
					clientSplit(data), 'path-clients-sub'),
				psum(_('Current traffic'), '↓ –', 'path-now', '↑ –', 'path-now-sub'),
				psum(_('Connected'), wan && wan.uptime != null ? util.fmtDuration(wan.uptime) : '–',
					'path-conn', wan ? '%s · %s'.format(wan.proto || '', wan.device || '') : '', 'path-conn-sub'),
				psum(_('Busiest network'), '–', 'path-busy', '', 'path-busy-sub'),
				psum(_('Busiest band'), band.busiest ? band.busiest.band : '–', 'path-band',
					band.busiest ? '%d%% %s'.format(band.share, _('of Wi-Fi traffic')) : '', 'path-band-sub'),
				psum(_('Weakest client'), sig.count ? '%d dBm'.format(sig.min) : '–', 'path-sig',
					worstClient(data), 'path-sig-sub')
			])
		]));
}

/* Curves between a node and its children, drawn after layout by measuring
   the boxes. SVG has to be built with createElementNS — E() creates HTML
   namespace elements and the paths would render blank on a real router. */
function drawGraphLinks() {
	var root = document.querySelector('.ltc-graph');
	if (!root)
		return;

	var NS = 'http://www.w3.org/2000/svg';
	var box = root.getBoundingClientRect();
	var svg = root.querySelector('svg.ltc-glinks');

	if (!box.width || !box.height)
		return;

	if (!svg) {
		svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'ltc-glinks');
		svg.setAttribute('aria-hidden', 'true');
		root.insertBefore(svg, root.firstChild);
	}

	svg.setAttribute('viewBox', '0 0 %d %d'.format(box.width, box.height));
	svg.setAttribute('width', box.width);
	svg.setAttribute('height', box.height);
	while (svg.firstChild)
		svg.removeChild(svg.firstChild);

	function own(node, cls) {
		var i, kids = node.children || [];

		for (i = 0; i < kids.length; i++)
			if (kids[i].classList && kids[i].classList.contains(cls))
				return kids[i];
		return null;
	}

	function midY(rect) {
		return rect.top - box.top + rect.height / 2;
	}

	[].slice.call(root.querySelectorAll('.ltc-grow')).forEach(function (row) {
		var parent = own(row, 'ltc-gnode');
		var wrap = own(row, 'ltc-gkids');

		if (!parent || !wrap)
			return;

		var pr = parent.getBoundingClientRect();
		var x1 = pr.right - box.left;
		var y1 = midY(pr);

		[].slice.call(wrap.children).forEach(function (kbox) {
			var child = own(kbox, 'ltc-gnode');
			if (!child)
				return;

			var cr = child.getBoundingClientRect();
			var x2 = cr.left - box.left;
			var y2 = midY(cr);
			var bend = Math.max(12, (x2 - x1) / 2);
			var path = document.createElementNS(NS, 'path');

			if (x2 <= x1)
				return;

			path.setAttribute('d', 'M%d %d C%d %d %d %d %d %d'.format(
				x1, y1, x1 + bend, y1, x2 - bend, y2, x2, y2));
			path.setAttribute('class', 'gl' + (child.classList.contains('down') ? ' down' : ''));
			svg.appendChild(path);
		});
	});
}

/* The station record for a MAC, whichever radio carries it. iwinfo writes
   stations lowercase while the bridge and the leases write them uppercase, so
   every comparison here goes through macKey. */
function macKey(mac) {
	return String(mac || '').toUpperCase();
}

function stationOf(assoc, mac) {
	var want = macKey(mac);
	var found = null;

	Object.keys(assoc || {}).forEach(function (dev) {
		if (found)
			return;
		util.arr(assoc[dev]).forEach(function (s) {
			if (!found && s && macKey(s.mac) === want)
				found = s;
		});
	});

	return found;
}

/* "1 Gbit/s" for gigabit and up, "100 Mbit/s" below it — the reference writes
   it that way and it reads faster than 1000 Mb/s. */
function linkRate(sp) {
	var s = Number(sp) || 0;

	if (!s)
		return '';
	if (s >= 1000)
		return _('%d Gbit/s').format(Math.round(s / 1000));
	return '%d Mbit/s'.format(s);
}

/* "↓ 4.9M ↑ 303K": inside a graph leaf or a summary cell there is no room for
   "MiB/s", and the long form lives on the devices page and the tiles. */
function shortRate(n) {
	n = Number(n) || 0;

	if (n >= 1048576)
		return '%.1fM'.format(n / 1048576);
	if (n >= 1024)
		return '%dK'.format(Math.round(n / 1024));

	return '%dB'.format(Math.round(n));
}

function lanIpOf(lan) {
	var a = util.arr(lan && lan['ipv4-address'])[0];
	if (!a)
		return '–';
	var mask = a.mask != null ? '/' + a.mask : '';
	return a.address + mask;
}

/* the long form, for the talker list where there is room for it */
function rateText(r) {
	if (!r)
		return '–';
	return '↓ %s ↑ %s'.format(util.fmtRate(r.rx_rate), util.fmtRate(r.tx_rate));
}

/* the compact form, for a graph leaf that has to stay one line wide */
function rateShort(r) {
	if (!r)
		return '–';
	return '↓ %s ↑ %s'.format(shortRate(r.rx_rate), shortRate(r.tx_rate));
}

/* netifd only puts `valid` on IPv6 address entries, so a DHCPv4 lease has to be
   derived the way LuCI's own expiry widget does it: the lease time minus where
   the current uptime falls inside that window. Without this the card reads "–"
   on every DHCP router, which is most of them. */
function leaseRemaining(data, wan) {
	var a4 = util.arr(wan && wan['ipv4-address'])[0];
	if (a4 && a4.valid != null)
		return util.fmtDuration(a4.valid);

	var lt = Number(wan && wan.leasetime), up = Number(wan && wan.uptime);
	if (isFinite(lt) && lt > 0 && isFinite(up) && up >= 0)
		return util.fmtDuration(lt - (up % lt));

	/* PPPoE and static WANs have no v4 lease, so fall back to any upstream
	   interface carrying a DHCPv6 binding, preferring the wan* naming. */
	var v6 = data.ifaces.filter(function (i) {
		return i && i.interface !== 'lan';
	}).sort(function (a, b) {
		return (/^wan/.test(b.interface) ? 1 : 0) - (/^wan/.test(a.interface) ? 1 : 0);
	}).map(function (i) {
		var a = util.arr(i['ipv6-address'])[0];
		var p = util.arr(i['ipv6-prefix-assignment'])[0];
		return (a && a.valid != null) ? a.valid : (p && p.valid != null ? p.valid : null);
	}).filter(function (v) {
		return v != null;
	})[0];

	return v6 != null ? util.fmtDuration(v6) + ' (v6)' : '–';
}

/* The wireless netdev behind an SSID differs per build (wlan0, radio0, ath0)
   and the wireless dump carries it under a different key per LuCI version, so
   match on whichever of them happens to line up. */
function ssidForNetdev(wifi, dev) {
	var found = '';

	Object.keys(wifi || {}).forEach(function (k) {
		var ifs = (wifi[k] || {}).interfaces;
		var list;

		if (Array.isArray(ifs))
			list = ifs;
		else
			list = Object.keys(ifs || {}).map(function (n) {
				var v = ifs[n];
				if (v && typeof v === 'object' && !v.ifname)
					v.ifname = n;
				return v;
			});

		list.forEach(function (i) {
			if (!i || !(i.config && i.config.ssid))
				return;
			var names = [i.ifname, i.section, i['.name'], i.config['.name'], k];
			if (names.indexOf(dev) >= 0)
				found = i.config.ssid;
		});
	});

	return found;
}

/* Heaviest talkers right now, straight from the conntrack accounting diff.
   The rows are filled by drawTalkers() so a poll can move them. */
function talkersCard(data) {
	var enabled = data.rates && data.rates.enabled;

	return card(_('Top talkers'),
		E('span', { 'class': 'ltc-badge ' + (enabled ? 'ok' : 'plain'), 'data-live': 'talkers-mode' },
			enabled ? _('live') : _('accounting off')),
		E('div', {}, [
			E('ul', { 'class': 'ltc-talkers', 'data-talkers': '' }),
			E('div', { 'class': 'ltc-muted', 'data-talkers-hint': '' },
				enabled ? '' : _('Enable per-device accounting in Appearance to see which hosts are busy.'))
		]));
}

/* ------------------------------------------------------------------ verdict
   Everything the dashboard can already see, reduced to one sentence, because
   "six green cards" still requires the user to read six cards. Each check
   carries its own wording so the strip can name what is wrong instead of
   showing a red dot with no explanation. */
function signalStats(data) {
	var assoc = data.assoc || {};
	var sigs = [];

	Object.keys(assoc).forEach(function (dev) {
		util.arr(assoc[dev]).forEach(function (s) {
			if (s && isFinite(s.signal))
				sigs.push(s.signal);
		});
	});

	if (!sigs.length)
		return { count: 0, min: null, weak: 0 };

	return {
		count: sigs.length,
		min: Math.min.apply(null, sigs),
		weak: sigs.filter(function (v) { return v < -75; }).length
	};
}

/* Which band is carrying the Wi-Fi traffic, and how many clients sit on each.
   Stations are grouped by the radio netdev, whose iwinfo info gives the band. */
function bandStats(data) {
	var assoc = data.assoc || {};
	var radios = data.radios || {};
	var rates = (data.rates && data.rates.rates) || {};
	var out = [];
	var byBand = {};

	Object.keys(assoc).forEach(function (dev) {
		var info = radios[dev] || {};
		var band = info.band || _('unknown');
		var gen = info.generation || '';
		var ch = info.channel != null ? info.channel : null;
		var width = info.width || null;
		var stations = util.arr(assoc[dev]);
		var traffic = 0;

		stations.forEach(function (s) {
			traffic += (Number(s.rx) || 0) + (Number(s.tx) || 0);
		});

		out.push({ dev: dev, band: band, gen: gen, channel: ch, width: width, clients: stations.length, traffic: traffic });
	});

	out.forEach(function (b) {
		byBand[b.band] = (byBand[b.band] || 0) + b.clients;
	});

	var busiest = out.slice().sort(function (a, b) { return b.traffic - a.traffic; })[0];
	var total = out.reduce(function (n, b) { return n + b.traffic; }, 0);

	return {
		bands: out,
		counts: byBand,
		busiest: busiest && busiest.traffic > 0 ? busiest : null,
		share: busiest && total > 0 ? Math.round(busiest.traffic / total * 100) : null
	};
}

/* "3 on 2.4 GHz · 7 on 5 GHz · 3 wired" — the reference spells the client
   count out by path, because a bare total says nothing about where they are.
   Whatever the bridge and the radios cannot place is named too, so the parts
   always add up to the number above them. */
function clientSplit(data) {
	var assoc = data.assoc || {};
	var b = bandStats(data);
	var placed = {};
	var parts = Object.keys(b.counts).filter(function (name) {
		return b.counts[name] && name !== _('unknown');
	}).sort(function (x, y) {
		return String(x).localeCompare(String(y));
	}).map(function (name) {
		return _('%d on %s').format(b.counts[name], name);
	});

	Object.keys(assoc).forEach(function (dev) {
		util.arr(assoc[dev]).forEach(function (s) {
			if (s && s.mac)
				placed[macKey(s.mac)] = true;
		});
	});

	var wired = Object.keys(util.fdbMap(data.topology || {})).filter(function (m) {
		return !placed[m];
	});

	wired.forEach(function (m) { placed[m] = true; });
	if (wired.length)
		parts.push('%d %s'.format(wired.length, _('wired')));

	var unplaced = clientsOf(data).filter(function (h) {
		return h.mac && !placed[macKey(h.mac)];
	}).length;

	if (unplaced)
		parts.push('%d %s'.format(unplaced, _('unplaced')));

	return parts.join(' · ');
}

/* Clients actually on the wire or in the lease table — everything the graph
   draws a box for. The DHCP table alone undercounts: an unleased station is
   still a client, and the split line under the number has to add up to it. */
function connectedCount(data) {
	var assoc = data.assoc || {};
	var macs = {};

	Object.keys(assoc).forEach(function (dev) {
		util.arr(assoc[dev]).forEach(function (s) {
			if (s && s.mac)
				macs[macKey(s.mac)] = true;
		});
	});

	Object.keys(util.fdbMap(data.topology || {})).forEach(function (m) {
		macs[m] = true;
	});

	clientsOf(data).forEach(function (h) {
		if (h.mac)
			macs[macKey(h.mac)] = true;
	});

	return Object.keys(macs).length;
}

/* Whose reading the weakest signal belongs to: the summary row says the number
   is -83 dBm, this says it is the private MAC in the back bedroom. */
function worstClient(data) {
	var assoc = data.assoc || {};
	var byMac = {};
	var worst = null;

	clientsOf(data).forEach(function (h) {
		if (h.mac)
			byMac[macKey(h.mac)] = h;
	});

	Object.keys(assoc).forEach(function (dev) {
		util.arr(assoc[dev]).forEach(function (s) {
			if (s && isFinite(s.signal) && (!worst || Number(s.signal) < Number(worst.signal)))
				worst = s;
		});
	});

	if (!worst)
		return '';

	return (byMac[macKey(worst.mac)] || {}).name || worst.mac;
}

function healthVerdict(data, wifi, mem, storage, info) {
	var sig = signalStats(data);
	var checks = [];

	checks.push({
		label: _('Uplink'),
		ok: !!(data.ifaces && util.arr(data.ifaces).some(function (i) { return i && i.up && i.interface !== 'loopback' && i.interface !== 'lan'; })),
		bad: _('no working uplink'),
		good: _('connected')
	});
	checks.push({
		label: _('CPU'),
		ok: util.cpu(data.net || {}, data.info) < 90,
		bad: _('CPU saturated'),
		good: _('load normal')
	});
	checks.push({
		label: _('Memory'),
		ok: !(mem && mem.percent >= 90),
		bad: _('more than 90% used'),
		good: _('memory free')
	});
	checks.push({
		label: _('Storage'),
		ok: !(storage && storage.percent >= 90),
		bad: _('root filesystem nearly full'),
		good: _('space available')
	});
	checks.push({
		label: _('Wi-Fi'),
		ok: wifi.total === 0 || wifi.up > 0,
		bad: _('no radio is up'),
		good: wifi.up ? '%d %s'.format(wifi.up, _('radios up')) : ''
	});
	if (sig.count) {
		checks.push({
			label: _('Client signal'),
			ok: sig.weak === 0,
			bad: '%d %s'.format(sig.weak, sig.weak === 1 ? _('client is weak') : _('clients are weak')),
			good: '%d dBm'.format(sig.min)
		});
	}

	return checks;
}

/* The reference puts the verdict in the page headline, not in a card below the
   fold, so the same sentence is computed in one place and used twice. */
function verdictOf(data, wifi, mem, storage, info) {
	var checks = healthVerdict(data, wifi, mem, storage, info);
	var bad = checks.filter(function (c) { return !c.ok; });

	return {
		checks: checks,
		bad: bad,
		state: bad.length > 1 ? 'bad' : (bad.length ? 'warn' : 'ok'),
		text: bad.length
			? (bad.length === 1 ? _('1 thing needs attention') : _('%d things need attention').format(bad.length))
			: _('Everything looks healthy'),
		detail: bad.map(function (c) { return '%s: %s'.format(c.label, c.bad); }).join(' · ')
	};
}

function verdictCard(data, wifi, mem, storage, info) {
	var v = verdictOf(data, wifi, mem, storage, info);

	return E('section', { 'class': 'ltc-card ltc-verdict ' + v.state, 'data-verdict': '' }, [
		E('div', { 'class': 'ltc-verdict-head', 'hidden': !v.bad.length }, [
			E('i', { 'class': 'ltc-verdict-dot' }),
			E('div', {}, [
				E('h3', { 'data-live': 'verdict-text' }, v.text),
				E('p', { 'class': 'ltc-muted', 'data-live': 'verdict-detail' },
					v.detail || _('all checks passed'))
			])
		]),
		E('div', { 'class': 'ltc-verdict-list' }, v.checks.map(function (c, i) {
			return E('span', {
				'class': 'ltc-vchip ' + (c.ok ? 'ok' : 'bad'),
				'data-vchip': String(i),
				'title': (c.ok ? c.good : c.bad) || c.label
			}, [
				E('i', { 'class': 'ltc-tdot ' + (c.ok ? 'good' : 'weak') }),
				c.label
			]);
		}))
	]);
}

/* ---------------------------------------------------------------- timeline
   Our own feature, and deliberately built from nothing but what the dashboard
   already polls: every 10 s we know which clients are online and whether the
   uplink is up, so the transitions themselves are the event log. No kernel
   accounting, no extra daemon — and it answers the question people actually
   ask ("什么时候断的网", "谁刚才掉线了") better than another gauge would. */
function eventsKey() {
	return 'lucent.events.' + dayKey();
}

function loadEvents() {
	try {
		return JSON.parse(localStorage.getItem(eventsKey()) || '[]') || [];
	} catch (e) {
		return [];
	}
}

function pushEvent(kind, text) {
	var list;

	try {
		list = loadEvents();
		list.push({ t: Math.floor(Date.now() / 1000), k: kind, x: text });
		if (list.length > 60)
			list = list.slice(-60);
		localStorage.setItem(eventsKey(), JSON.stringify(list));
		pruneDaily();
	} catch (e) {}
}

/* Called from applyLive with the same snapshot the cards are painted from.
   The first pass only records the baseline — otherwise a page reload would
   look like every device had just connected at once. */
function trackEvents(self, data, wan) {
	var online = {};

	clientsOf(data).forEach(function (h) {
		if (h.online)
			online[h.mac] = h.name || h.mac;
	});

	if (self._seenClients == null) {
		self._seenClients = online;
		self._seenWan = !!(wan && wan.up);
		return;
	}

	var prev = self._seenClients;
	var added = Object.keys(online).filter(function (m) { return !prev[m]; });
	var gone = Object.keys(prev).filter(function (m) { return !online[m]; });

	added.forEach(function (m) { pushEvent('join', '%s %s'.format(online[m], _('came online'))); });
	gone.forEach(function (m) { pushEvent('leave', '%s %s'.format(prev[m], _('went offline'))); });

	var up = !!(wan && wan.up);
	if (up !== self._seenWan) {
		pushEvent(up ? 'up' : 'down', up ? _('the uplink came back') : _('the uplink dropped'));
		self._seenWan = up;
	}

	self._seenClients = online;
}

function timelineCard() {
	var list = loadEvents().slice(-8).reverse();

	return card(_('Today'), E('small', { 'class': 'ltc-muted' }, _('from this browser session history')),
		list.length
			? E('ul', { 'class': 'ltc-timeline' }, list.map(function (e) {
				return E('li', { 'class': 'ltc-tl ' + e.k }, [
					E('i', {}),
					E('time', {}, new Date(e.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
					E('span', {}, e.x)
				]);
			}))
			: E('p', { 'class': 'ltc-muted' }, _('Nothing has changed hands today yet.')));
}

return view.extend({
	load: function () {
		return util.load().then(L.bind(function (d) {
			return this.enrich(d);
		}, this));
	},

	/* Bridge ports and stations are fetched with the view; per-device rates
	   refresh on every poll because that is the part that actually moves. */
	enrich: function (d, keepStructure) {
		var self = this;

		if (keepStructure && this._topo) {
			d.topology = this._topo;
			d.assoc = this._assoc || {};
			d.radios = this._radios || {};
		}
		else {
			d.topology = {};
			d.assoc = {};
			d.radios = {};

			var ports = [];

			return util.topology().then(function (topo) {
				self._topo = topo || {};
				d.topology = self._topo;
				ports = util.arr(self._topo.ports).filter(function (p) { return p && p.wireless; });

				return Promise.all(ports.map(function (p) {
					/* the station list and the radio's channel/width come from
					   two different iwinfo calls; a build without `info` in the
					   ACL just yields null and the branch loses its badges */
					return Promise.all([
						util.assocList(p.device).catch(function () { return []; }),
						util.radioInfo(p.device)
					]).then(function (r) {
						return { dev: p.device, stations: r[0] || [], info: r[1] };
					});
				}));
			}).then(function (list) {
				self._assoc = {};
				self._radios = {};
				(list || []).forEach(function (e) {
					if (!e || !e.dev)
						return;
					self._assoc[e.dev] = e.stations || [];
					self._radios[e.dev] = e.info || null;
				});
				d.assoc = self._assoc;
				d.radios = self._radios;
				return util.hostRates();
			}).then(function (hr) {
				d.rates = hr || {};
				return d;
			});
		}

		return util.hostRates().then(function (hr) {
			d.rates = hr || {};
			return d;
		});
	},

	startPoll: function () {
		if (this._polling)
			return;
		this._polling = true;

		poll.add(L.bind(function () {
			this._round = (this._round || 0) + 1;

			return util.load().then(L.bind(function (d) {
				return this.enrich(d, this._round % 6 !== 1);
			}, this)).then(L.bind(function (d) {
				this.applyLive(d);
			}, this)).catch(function () {});
		}, this), 10);

		/* Prime a second sample shortly after load so the traffic rate appears
		   within a few seconds instead of waiting for the first full poll. */
		setTimeout(L.bind(function () {
			util.load().then(L.bind(function (d) {
				return this.enrich(d);
			}, this)).then(L.bind(this.applyLive, this)).catch(function () {});
		}, this), 3000);
	},

	/* Pull a daily line from the network; cache per day in localStorage.
	   Rendered with textContent so remote strings can never inject markup. */
	fetchGreeting: function () {
		var el = document.querySelector('[data-quote]');
		if (!el)
			return;

		/* the same padded key pruneDaily compares against, or the cache is
		   deleted on the very day it was written */
		var key = 'lucent.quote.' + dayKey();
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

		function set(sel, text) {
			var el = document.querySelector(sel);
			if (!el || el.textContent === text)
				return;
			el.textContent = text;
			el.classList.remove('ltc-flash');
			void el.offsetWidth;
			el.classList.add('ltc-flash');
		}

		function dial(key, percent) {
			var el = document.querySelector('[data-live=dial-' + key + ']');
			if (el)
				el.style.setProperty('--val', String(percent));
		}

		function meter(key, percent) {
			var el = document.querySelector('[data-live=' + key + '-meter]');
			if (el)
				el.style.width = '%d%%'.format(Math.max(2, Math.min(100, Math.round(percent))));
		}

		if (data.info.localtime)
			set('[data-live=sys-time]', new Date(data.info.localtime * 1000).toLocaleString());
		/* the reference tile counts what is still free, not what has been eaten */
		var availPct = util.pct(mem.avail, mem.total);
		setNum('[data-live=memory]', availPct, '%');
		set('[data-live=memory-sub]', '%s / %s'.format(util.fmtBytes(mem.avail), util.fmtBytes(mem.total)));
		meter('memory', availPct);
		/* wan and wan-sub belong to the counter diff below — writing them here
		   as well made the tile flip format between rounds */

		var netInfo = data.net || {};
		var cpuPct = util.cpu(netInfo, data.info);
		var sigLive = signalStats(data);
		var wifiLive = wifiState(data.wifi);
		var bandLive = bandStats(data);

		setNum('[data-live=cpu]', cpuPct, '%');
		set('[data-live=cpu-sub]', netInfo.temp_c != null
			? '%s °C · %s'.format(netInfo.temp_c, _('%d cores').format(Number(netInfo.cores) || 0))
			: _('load %s').format(loads.length ? loads[0].toFixed(2) : '–'));
		meter('cpu', cpuPct);
		kstate('cpu', cpuPct < 90);
		kstate('memory', availPct > 10);
		kstate('storage', !(storage && storage.percent >= 90));
		kstate('kpi-wifi', wifiLive.total === 0 || wifiLive.up > 0);
		kstate('kpi-signal', !sigLive.weak);
		set('[data-live=kpi-wifi]', plural(wifiLive.up, 'radio on', 'radios on'));
		set('[data-live=kpi-wifi-sub]', plural(wifiLive.ssids.length,
			'SSID broadcasting', 'SSIDs broadcasting'));
		set('[data-live=kpi-signal]', sigLive.count
			? (sigLive.weak ? plural(sigLive.weak, 'weak link', 'weak links') : _('all strong')) : '–');
		set('[data-live=kpi-signal-sub]', sigLive.count
			? (sigLive.weak ? _('weakest %d dBm').format(sigLive.min) : _('all above %d dBm').format(-75))
			: _('no stations'));

		/* the summary row under the graph moves with the same poll */
		set('[data-live=path-clients-sub]', clientSplit(data));
		set('[data-live=path-band]', bandLive.busiest ? bandLive.busiest.band : '–');
		set('[data-live=path-band-sub]', bandLive.busiest
			? '%d%% %s'.format(bandLive.share, _('of Wi-Fi traffic')) : '');
		set('[data-live=path-sig]', sigLive.count ? '%d dBm'.format(sigLive.min) : '–');
		set('[data-live=path-sig-sub]', worstClient(data));

		var gwv = wan ? util.gateway(wan) : '';
		var dnsv = wan ? util.dns(wan) : [];
		var storage = util.storage(data.storage);
		set('[data-live=gateway]', gwv || '–');
		set('[data-live=dns]', dnsv.length ? dnsv.slice(0, 2).join('  ') : '–');
		if (wan && wan.uptime != null)
			set('[data-live=wan-up]', util.fmtDuration(wan.uptime));
		var liveLease = leaseRemaining(data, wan);
		if (liveLease !== '–')
			set('[data-live=lease]', liveLease);
		if (storage) {
			setNum('[data-live=storage]', storage.percent, '%');
			meter('storage', storage.percent);
		}
		set('[data-live=storage-sub]', storage
			? '%s %s'.format(_('free'), util.fmtBytes(storage.free)) : '–');

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
				set('[data-live=wan]', '↓ ' + util.fmtRate(rx));
				kstate('wan', !!wan.up);
				/* the reference writes the uplink tile as rate · port · link,
				   which is the three things worth knowing about a WAN */
				var wport = util.arr((data.topology || {}).ports).filter(function (p) {
					return p && p.device === devName;
				})[0];
				set('[data-live=wan-sub]', ['↑ ' + util.fmtRate(tx), devName || wan.proto || '',
					wport && wport.speed >= 1000 ? _('gigabit link')
						: (wport && wport.speed >= 100 ? _('fast ethernet link') : '')]
					.filter(Boolean).join(' · '));
				set('[data-live=path-now]', '↓ ' + util.fmtRate(rx));
				set('[data-live=path-now-sub]', '↑ %s · %s %s'.format(
					util.fmtRate(tx), _('via'), devName || wan.proto || ''));
				this._hist.push({ t: now, rx: rx, tx: tx });
				if (this._hist.length > 120)
					this._hist = this._hist.slice(-120);
				saveHist(this._hist);
				this.drawSpark();
			}
			set('[data-live=traffic-total]', '↓ ' + util.fmtBytes(Number(stats.rx_bytes) || 0) +
				'  ↑ ' + util.fmtBytes(Number(stats.tx_bytes) || 0));
			this._lastStats = { t: now, rx: Number(stats.rx_bytes) || 0, tx: Number(stats.tx_bytes) || 0 };
		}

		var lanDevName = lan && (lan['l3_device'] || lan.device);
		var lanDev = lanDevName && data.devices && data.devices[lanDevName];
		var lanStats = lanDev && (lanDev.stats || lanDev.statistics);
		if (lanStats) {
			var lnow = Date.now();
			if (this._lastLan) {
				var ldt = Math.max(1, (lnow - this._lastLan.t) / 1000);
				var lrx = Math.max(0, (Number(lanStats.rx_bytes) - this._lastLan.rx) / ldt);
				var ltx = Math.max(0, (Number(lanStats.tx_bytes) - this._lastLan.tx) / ldt);
				set('[data-live=path-lan-down]', '↓ ' + util.fmtRate(lrx));
				set('[data-live=path-lan-up]', '↑ ' + util.fmtRate(ltx));
			}
			this._lastLan = { t: lnow, rx: Number(lanStats.rx_bytes) || 0, tx: Number(lanStats.tx_bytes) || 0 };
		}

		if (wan && wan.uptime != null)
			set('[data-live=path-conn]', util.fmtDuration(wan.uptime));

		var cpus = net.cpus;
		if (Array.isArray(cpus) && cpus.length) {
			var cbox = document.querySelector('[data-live=cpubars]');
			if (cbox) {
				cbox.textContent = '';
				cpus.forEach(function (v) {
					cbox.appendChild(E('i', {
						'style': 'height:' + Math.max(4, Math.min(100, v)) + '%',
						'title': '%s %d%%'.format(_('core'), v)
					}));
				});
			}
		}

		if (mem.total > 0) {
			var seg = function (sel, w) {
				var el = document.querySelector(sel);
				if (el)
					el.style.width = w.toFixed(1) + '%';
			};
			seg('[data-live=mem-used]', (mem.used / mem.total) * 100);
			seg('[data-live=mem-cache]', (mem.cache / mem.total) * 100);
			seg('[data-live=mem-free]', Math.max(0, 100 - (mem.used / mem.total) * 100 - (mem.cache / mem.total) * 100));
		}
		set('[data-live=ring-mem]', mem.percent + '%');
		set('[data-live=ring-swap]', mem.swapPercent + '%');
		set('[data-live=ring-load]', (loads[0] || 0).toFixed(2));
		dial('mem', mem.percent);
		dial('swap', mem.swapPercent);
		dial('load', Math.min(100, Math.round((loads[0] || 0) * 100)));

		/* the hero answers "is this page current?" without a click: every live
		   line in it is rewritten here, and the dot says what it means */
		/* the headline is the verdict, the line under it is identity, and the
		   pill says how old the numbers on screen are */
		var boardLive = data.board || {};
		var relLive = (boardLive.release && (boardLive.release.description || boardLive.release.revision))
			|| boardLive.description || '';
		var vLive = verdictOf(data, wifiState(data.wifi), mem, storage, data.info);

		set('[data-live=hero-verdict]', vLive.text);
		set('[data-live=verdict-text]', vLive.text);
		set('[data-live=verdict-detail]', vLive.detail || _('all checks passed'));
		set('[data-live=hero-chain]', heroChain(boardLive.model || boardLive.system || '', relLive,
			data.info.localtime ? new Date(data.info.localtime * 1000).toLocaleString() : '', clients.length));

		this._since = Date.now();
		tickSince(this);

		var heroDot = document.querySelector('[data-live=hero-dot]');
		if (heroDot)
			heroDot.className = 'ltc-dot ' + vLive.state;

		var vcard = document.querySelector('[data-verdict]');
		if (vcard) {
			vcard.className = 'ltc-card ltc-verdict ' + vLive.state;
			var vhead = vcard.querySelector('.ltc-verdict-head');
			if (vhead)
				vhead.hidden = !vLive.bad.length;
		}

		[].slice.call(document.querySelectorAll('[data-vchip]')).forEach(function (el) {
			var c = vLive.checks[Number(el.getAttribute('data-vchip'))];

			if (!c)
				return;

			el.className = 'ltc-vchip ' + (c.ok ? 'ok' : 'bad');
			el.title = (c.ok ? c.good : c.bad) || c.label;

			var d = el.querySelector('.ltc-tdot');
			if (d)
				d.className = 'ltc-tdot ' + (c.ok ? 'good' : 'weak');
		});

		this.updateRates(data.rates);
		this.drawTalkers(data);

		/* branch throughput, keyed by the netdev each node declares */
		var nrates = netdevRates(this, data);

		function put(el, text) {
			if (!el || el.textContent === text)
				return;
			el.textContent = text;
			el.classList.remove('ltc-flash');
			void el.offsetWidth;
			el.classList.add('ltc-flash');
		}

		var wrx = 0, wtx = 0;

		[].slice.call(document.querySelectorAll('[data-gr]')).forEach(function (n) {
			var r = nrates[n.getAttribute('data-gr')];

			/* the wired aggregate is the sum of the physical ports only, not of
			   the radios that share the bridge */
			if (r && n.getAttribute('data-grkind') === 'port') {
				wrx += r.rx;
				wtx += r.tx;
			}
			var pill = n.querySelector('.grate');

			if (pill)
				pill.classList.toggle('idle', !r);
			put(pill, r ? '↓ %s ↑ %s'.format(util.fmtRate(r.rx), util.fmtRate(r.tx)) : '–');
		});

		var wiredOut = document.querySelector('[data-live=gr-wired]');
		if (wiredOut)
			put(wiredOut, wrx + wtx > 0 ? '↓ %s ↑ %s'.format(util.fmtRate(wrx), util.fmtRate(wtx)) : '–');

		set('[data-live=path-clients]', String(connectedCount(data) || clients.length));

		/* the Internet box shows the downlink, the router box the uptime, and
		   the busiest interface gets its own box — all three were being
		   computed and thrown away */
		var busy = busiestIface(this, data);
		var busyNode = document.querySelector('[data-live=path-busy]');

		if (busyNode && busy)
			busyNode.textContent = '%s ↓ %s ↑ %s'.format(
				busy.name, shortRate(busy.rx), shortRate(busy.tx));

		/* the curves follow the boxes, and the boxes move when rates appear */
		drawGraphLinks();

		/* after the paint, so a device that flapped is logged once with the
		   same snapshot the cards show */
		try {
			trackEvents(this, data, wan);
		} catch (e) {}
	},

	updateRates: function (rates) {
		var hosts = (rates && rates.rates) || {};

		function paint(el, text) {
			if (!el || el.textContent === text)
				return;

			el.textContent = text;
			el.classList.remove('ltc-flash');
			void el.offsetWidth;
			el.classList.add('ltc-flash');
		}

		Object.keys(hosts).forEach(function (ip) {
			paint(document.querySelector('[data-live=leaf-' + ip.replace(/\./g, '-') + ']'),
				rateShort(hosts[ip]));
		});
	},

	drawTalkers: function (data) {
		var box = document.querySelector('[data-talkers]');
		var hint = document.querySelector('[data-talkers-hint]');
		var rates = (data.rates && data.rates.rates) || {};
		var hosts = util.hosts(data.hints, data.leases);
		var byIp = {};

		if (!box)
			return;

		hosts.forEach(function (h) {
			(h.ips || []).forEach(function (ip) { byIp[ip] = h; });
		});

		var list = Object.keys(rates).map(function (ip) {
			return { ip: ip, r: rates[ip] || {} };
		}).sort(function (a, b) {
			return (b.r.rx_rate + b.r.tx_rate) - (a.r.rx_rate + a.r.tx_rate);
		}).slice(0, 6);

		var peak = list.length ? Math.max(list[0].r.rx_rate + list[0].r.tx_rate, 1) : 1;

		box.textContent = '';

		list.forEach(function (e) {
			var h = byIp[e.ip] || {};
			var name = h.name || e.ip;
			var total = e.r.rx_rate + e.r.tx_rate;
			var meta = [];

			/* every row gets its second line, or the card reads as a list with
			   random gaps; a named host shows its address, an unnamed one has
			   nothing left to say but how long it has been quiet */
			if (h.name)
				meta.push(e.ip);

			if (e.r.age > 20)
				meta.push(_('%ds ago').format(e.r.age));

			box.appendChild(E('li', { 'class': 'ltc-talker', 'title': '%s · %s'.format(name, e.ip) }, [
				E('span', { 'class': 'who' }, name),
				E('i', { 'class': 'bar' }, E('u', { 'style': 'width:%d%%'.format(Math.min(100, Math.round(total * 100 / peak))) })),
				E('b', { 'class': 'val' }, rateText(e.r)),
				E('small', { 'class': 'age' }, meta.length ? meta.join(' · ') : _('active now'))
			]));
		});

		if (hint)
			hint.textContent = list.length ? ''
				: (data.rates && !data.rates.enabled
					? _('Enable per-device accounting in Appearance to see which hosts are busy.')
					: _('No traffic has been counted yet.'));
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
			if (!el || el.textContent === text)
				return;
			el.textContent = text;
			el.classList.remove('ltc-flash');
			void el.offsetWidth;
			el.classList.add('ltc-flash');
		}
		set('[data-live=spark-now]', '↓ ' + util.fmtRate(last.rx) + '  ↑ ' + util.fmtRate(last.tx));
		set('[data-live=peak-rx]', util.fmtRate(peakRx));
		set('[data-live=peak-tx]', util.fmtRate(peakTx));
		set('[data-live=spark-samples]', String(h.length));

		var t0 = h[0].t || 0, tN = last.t || 0;
		function rel(ms) {
			if (!ms || !tN)
				return '';
			var s = Math.max(0, Math.round((tN - ms) / 1000));
			if (s < 5)
				return _('now');
			if (s < 90)
				return '%ds'.format(s);
			if (s < 5400)
				return '%dm'.format(Math.round(s / 60));
			return '%dh'.format(Math.round(s / 3600));
		}
		var labels = [
			rel(t0),
			rel(t0 + (tN - t0) / 3),
			rel(t0 + (tN - t0) * 2 / 3),
			_('now')
		];

		/* A history only seconds old rounds every tick to the same word, and an
		   axis reading "now now now now" looks broken rather than young — so
		   keep the rightmost copy of a repeated label and blank the rest. */
		for (var ti = 0; ti < labels.length - 1; ti++) {
			if (labels[ti] && labels[ti] === labels[ti + 1])
				labels[ti] = '';
		}

		set('[data-live=tick-0]', labels[0]);
		set('[data-live=tick-1]', labels[1]);
		set('[data-live=tick-2]', labels[2]);
		set('[data-live=tick-3]', labels[3]);

		/* Persist the daily maximum beyond the in-tab history window. */
		var dkey = 'lucent.peak.' + dayKey();
		var dp = {};
		try { dp = JSON.parse(localStorage.getItem(dkey) || '{}'); } catch (e) { dp = {}; }
		if (!(dp.rx >= peakRx)) dp.rx = peakRx;
		if (!(dp.tx >= peakTx)) dp.tx = peakTx;
		try { localStorage.setItem(dkey, JSON.stringify(dp)); } catch (e) {}
		set('[data-live=day-peak]', '↓ ' + util.fmtRate(dp.rx) + ' ↑ ' + util.fmtRate(dp.tx));
	},

	bindSpark: function () {
		var wrap = document.querySelector('.ltc-sparkwrap');
		var tip = document.querySelector('.ltc-spark-tip');
		if (!wrap || !tip || wrap._bound)
			return;
		wrap._bound = true;
		var self = this;
		wrap.addEventListener('mousemove', function (ev) {
			var h = self._hist || [];
			if (h.length < 2)
				return;
			var r = wrap.getBoundingClientRect();
			var ratio = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
			var s = h[Math.round(ratio * (h.length - 1))];
			tip.style.display = '';
			tip.style.left = Math.min(72, Math.max(2, ratio * 100 - 14)) + '%';
			tip.textContent = (s.t ? new Date(s.t).toLocaleTimeString() + ' · ' : '') +
				'↓ ' + util.fmtRate(s.rx) + '  ↑ ' + util.fmtRate(s.tx);
		});
		wrap.addEventListener('mouseleave', function () {
			tip.style.display = 'none';
		});
	},

	updateCard: function (data) {
		var self = this;
		var net = (data && data.net) || {};
		var verLabel = E('b', {}, net.version || '—');
		var status = E('div', { 'class': 'ltc-help' },
			_('Checking for updates automatically…'));
		var checkBtn = E('button', { 'type': 'button', 'class': 'ltc-btn sm' }, _('Check for updates'));
		var updBtn = E('button', { 'type': 'button', 'class': 'ltc-btn sm primary', 'style': 'display:none' }, _('Update'));
		var pkgTag = E('span', { 'class': 'ltc-tag', 'style': 'display:none' });
		var progBar = E('div', { 'class': 'ltc-progress', 'style': 'display:none' }, E('i'));
		var progText = E('small', { 'class': 'ltc-muted', 'style': 'display:none' });

		function setBusy(b) {
			checkBtn.disabled = b;
			updBtn.disabled = b;
		}
		function note(text, cls) {
			status.className = 'ltc-help' + (cls ? ' ' + cls : '');
			status.textContent = text;
		}
		function progress(mode) {
			if (mode === 'run') {
				progBar.style.display = '';
				progBar.classList.add('run');
				progText.style.display = '';
			}
			else if (mode === 'done') {
				progBar.classList.remove('run');
				progBar.classList.add('done');
				progText.textContent = _('Update finished. Reloading…');
			}
			else if (mode === 'fail') {
				progBar.classList.remove('run');
				progBar.classList.add('fail');
			}
			else {
				progBar.style.display = 'none';
				progBar.className = 'ltc-progress';
				progText.style.display = 'none';
			}
		}

		function showPkgCount() {
			var tries = 0;
			function once() {
				util.pkgUpdates().then(function (r) {
					if (r && r.checking && tries++ < 20) {
						setTimeout(once, 3000);
						return;
					}
					if (r && r.count > 0) {
						pkgTag.style.display = '';
						pkgTag.textContent = '%d %s'.format(r.count, _('system packages upgradable'));
					}
				}).catch(function () {});
			}
			once();
		}

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
					note((res && res.error) || _('Unable to reach the update source. Check the network, or enable China mirrors in Appearance.'), 'err');
					return;
				}
				if (!res.current)
					verLabel.textContent = _('not installed');
				if (!res.available) {
					note(_('You are on the latest version (%s).').format(res.latest), 'ok');
					updBtn.style.display = 'none';
					showPkgCount();
				}
				else {
					note(_('A new version %s is available (current %s).').format(res.latest, res.current || '—'));
					updBtn.textContent = _('Update to %s').format(res.latest);
					updBtn.style.display = '';
					showPkgCount();
				}
			}).catch(function () {
				setBusy(false);
				note(_('The update check failed.'), 'err');
			});
		}

		function pollStatus() {
			var tries = 0;

			if (self._upTimer)
				clearInterval(self._upTimer);
			self._upSeen = false;
			self._upTimer = setInterval(function () {
				util.updateStatus().then(function (st) {
					if (!st)
						return;
					if (st.running) {
						self._upSeen = true;
						progress('run');
						progText.textContent = (st.log || _('Updating…')).slice(-160);
						return;
					}
					/* The detached job may not have registered yet; keep polling
					 * until we either see it running or get a real exit code, but
					 * give up rather than ticking every 2s forever if rpcd died
					 * mid-update and no status will ever come back. */
					if (!self._upSeen && (st.code == null || st.code < 0)) {
						if (++tries > 60) {
							clearInterval(self._upTimer);
							self._upTimer = null;
							setBusy(false);
							note(_('The update check failed.'), 'err');
						}
						return;
					}
					clearInterval(self._upTimer);
					self._upTimer = null;
					if (st.code === 0) {
						progress('done');
						core.toast(_('Theme updated. Reloading…'), 'ok');
						setTimeout(function () { location.href = L.url('admin/home'); }, 1200);
					}
					else {
						progress('fail');
						note(_('Update failed. %s').format(st.log ? String(st.log).slice(-200) : ''), 'err');
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
			progress('run');
			progText.textContent = _('Starting the update…');
			progText.style.display = '';
			return util.startUpdate().then(function (res) {
				if (!res || !res.ok)
					throw new Error((res && res.error) || _('The update could not be started'));
				pollStatus();
			}).catch(function (err) {
				progress('fail');
				setBusy(false);
				note(_('Update error: %s').format(err && err.message || String(err)), 'err');
			});
		}

		checkBtn.addEventListener('click', function () { doCheck(); });
		updBtn.addEventListener('click', doUpdate);

		/* Auto-check shortly after the page settles; cached server-side,
		   so this is cheap on repeat visits. */
		setTimeout(function () { doCheck(); }, 800);

		return card(_('Updates'), null, E('div', { 'class': 'ltc-update' }, [
			E('div', { 'class': 'ltc-row', 'style': 'gap:10px;flex-wrap:wrap;align-items:center' }, [
				E('div', { 'class': 'ltc-hero-line' }, [E('small', {}, _('Installed version')), verLabel, util.menuMark()]),
				pkgTag,
				E('div', { 'class': 'grow' }),
				checkBtn, updBtn
			]),
			status,
			E('div', { 'class': 'ltc-row' }, [progBar, progText])
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

		/* The reference row, card for card: what the uplink is, how busy the
		   CPU is, how much memory is still free (not how much is gone), how
		   many clients the radios carry, the weakest signal among them and how
		   full the storage is. Devices, traffic and uptime did not disappear —
		   they moved to the hero line, the trend badge and the path summary. */
		var cpu = util.cpu(net, info);
		var availPct = util.pct(mem.avail, mem.total);
		var sig = signalStats(data);
		var chain = heroChain(board.model || board.system || hostname, release,
			info.localtime ? new Date(info.localtime * 1000).toLocaleString() : '', clients.length);

		var verdict = verdictOf(data, wifi, mem, storage, info);

		var hero = E('section', { 'class': 'ltc-hero ltc-card' }, [
			E('div', { 'class': 'ltc-hero-main' }, [
				E('div', { 'class': 'ltc-hero-top' }, [
					E('i', { 'class': 'ltc-dot ' + verdict.state, 'data-live': 'hero-dot' }),
					E('h1', { 'data-live': 'hero-verdict' }, verdict.text)
				]),
				E('p', { 'class': 'ltc-hero-sub', 'data-live': 'hero-chain' }, chain),
				greetingOn ? E('p', { 'class': 'ltc-hero-quote', 'data-quote': '' },
					'%s, %s — %s'.format(greeting, hostname, dailyFallback())) : '',
				E('div', { 'class': 'ltc-hero-actions' }, [
					E('a', { 'class': 'ltc-btn primary', 'href': L.url('admin/clients') }, _('View devices')),
					E('a', { 'class': 'ltc-btn', 'href': L.url('admin/system/appearance') }, _('Appearance')),
					E('a', { 'class': 'ltc-btn ghost', 'href': L.url('admin/status/overview') }, _('System status'))
				])
			]),
			E('div', { 'class': 'ltc-hero-side' }, [
				E('div', { 'class': 'ltc-hero-live' }, [
					E('span', {}, _('Live')),
					E('b', { 'data-live': 'hero-since' }, _('just now'))
				]),
				E('a', { 'class': 'ltc-hero-custom', 'href': L.url('admin/system/appearance') }, [
					E('span', { 'class': 'ic' }, util.icon('sliders')),
					_('Customize')
				])
			])
		]);

		var kpis = E('div', { 'class': 'ltc-kpis' }, [
			kpi(_('Uplink'), '↓ –', '↑ –', 'wan', null, '', !!(wan && wan.up)),
			kpi(_('CPU'), '%d%%'.format(cpu), net.temp_c != null
				? '%s °C · %s'.format(net.temp_c, _('%d cores').format(Number(net.cores) || 0))
				: _('load %s').format(loads.length ? loads[0].toFixed(2) : '–'), 'cpu', cpu, '', cpu < 90),
			kpi(_('Memory'), '%d%%'.format(availPct),
				'%s / %s'.format(util.fmtBytes(mem.avail), util.fmtBytes(mem.total)), 'memory', availPct,
				_('available'), availPct > 10),
			kpi(_('Wi-Fi'), plural(wifi.up, 'radio on', 'radios on'),
				plural(wifi.ssids.length, 'SSID broadcasting', 'SSIDs broadcasting'), 'kpi-wifi', null, '',
				wifi.total === 0 || wifi.up > 0),
			kpi(_('Signal'), sig.count ? (sig.weak ? plural(sig.weak, 'weak link', 'weak links') : _('all strong')) : '–',
				sig.count ? (sig.weak ? _('weakest %d dBm').format(sig.min) : _('all above %d dBm').format(-75))
					: _('no stations'), 'kpi-signal', null, '', !sig.weak),
			kpi(_('Storage'), storage ? storage.percent + '%' : '–', storage
				? '%s %s'.format(_('free'), util.fmtBytes(storage.free)) : '–', 'storage',
				storage ? storage.percent : null, _('used'), !(storage && storage.percent >= 90))
		]);

		var leaseRem = leaseRemaining(data, wan);
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
			E([facts]));

		var health = E('div', { 'class': 'ltc-rings' }, [
			ring(_('Memory'), mem.percent + '%', mem.percent, 'mem'),
			ring(_('Swap'), mem.swapPercent + '%', mem.swapPercent, 'swap'),
			ring(_('Load'), (loads[0] || 0).toFixed(2), Math.min(100, Math.round((loads[0] || 0) * 100)), 'load')
		]);

		var healthCard = card(_('System health'), null, E([
			health,
			E('div', { 'class': 'ltc-membar', 'title': '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total)) }, [
				E('i', { 'class': 'used', 'data-live': 'mem-used', 'style': 'width:' + util.pct(mem.used, mem.total) + '%' }),
				E('i', { 'class': 'cache', 'data-live': 'mem-cache', 'style': 'width:' + util.pct(mem.cache, mem.total) + '%' }),
				E('i', { 'class': 'free', 'data-live': 'mem-free', 'style': 'width:' + Math.max(0, 100 - util.pct(mem.used, mem.total) - util.pct(mem.cache, mem.total)) + '%' })
			]),
			E('div', { 'class': 'ltc-legend' }, [
				E('span', {}, [E('b', {}, util.fmtBytes(mem.used)), ' ', _('used')]),
				E('span', {}, [E('b', {}, util.fmtBytes(mem.cache)), ' ', _('cache')]),
				E('span', {}, [E('b', {}, util.fmtBytes(Math.max(0, mem.total - mem.used - mem.cache))), ' ', _('free')])
			]),
			E('div', { 'class': 'ltc-cpubox' }, [
				E('small', {}, _('CPU per core')),
				E('div', { 'class': 'ltc-cpubars', 'data-live': 'cpubars' })
			]),
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
		Promise.resolve().then(L.bind(this.bindSpark, this));

		var ds = document.documentElement.dataset;
		var stack = [hero];
		if (ds.updates !== '0')
			stack.push(this.updateCard(data));
		stack.push(kpis);
		stack.push(verdictCard(data, wifi, mem, storage, wan));
		if (ds.topo !== '0') {
			stack.push(pathCard(data, wan, lan, data.wifi, hostname));
			/* the curves are measured from laid-out boxes, so a resize — or the
			   sidebar collapsing under the width rule — leaves them pointing at
			   where the boxes used to be. One listener, replaced each render. */
			if (window._lucentGraphResize)
				window.removeEventListener('resize', window._lucentGraphResize);
			window._lucentGraphResize = function () {
				clearTimeout(window._lucentGraphTimer);
				window._lucentGraphTimer = setTimeout(drawGraphLinks, 250);
			};
			window.addEventListener('resize', window._lucentGraphResize);
		}

		/* one ticker for the age pill, replaced rather than stacked on every
		   render so navigating home twice cannot double-tick */
		var sinceView = this;
		if (window._lucentSinceTimer)
			clearInterval(window._lucentSinceTimer);
		window._lucentSinceTimer = setInterval(function () {
			tickSince(sinceView);
		}, 1000);
		if (data.rates && Number(data.rates.enabled) === 1)
			stack.push(talkersCard(data));
		if (ds.trend !== '0')
			stack.push(sparkCard());
		stack.push(
			E('div', { 'class': 'ltc-grid' }, [networkCard, healthCard]),
			E('div', { 'class': 'ltc-grid' }, [clientsCard, actionsCard]),
			E('div', { 'class': 'ltc-grid' }, [systemCard, timelineCard()])
		);
		return E('div', { 'class': 'ltc-stack' }, stack);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
