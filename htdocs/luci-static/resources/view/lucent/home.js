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
		cache: Math.min(mem.total || 0, cache),
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
	var from = Number(el._num);
	if (isNaN(from))
		from = 0;
	if (from === value) {
		el.textContent = value + suffix;
		return;
	}
	el._num = value;
	var t0 = performance.now();
	function step(t) {
		var k = Math.min(1, (t - t0) / 450);
		var e = 1 - Math.pow(1 - k, 3);
		el.textContent = Math.round(from + (value - from) * e) + suffix;
		if (k < 1)
			requestAnimationFrame(step);
	}
	requestAnimationFrame(step);
}

function pathCard(data, wan, lan, wifi, hostname) {
	var info = data.info || {};
	var board = data.board || {};
	var dns = wan ? util.dns(wan) : [];
	var lanMask = util.arr(lan && lan['ipv4-address'])[0];
	var mem = memoryOf(info);

	function node(href, iconName, title, l1, l2, cls) {
		return E('a', { 'class': 'ltc-pnode' + (cls ? ' ' + cls : ''), 'href': href, 'title': title }, [
			E('span', { 'class': 'ic' }, util.icon(iconName)),
			E('b', {}, title),
			E('small', {}, l1 || '–'),
			l2 ? E('small', { 'class': 'ltc-muted' }, l2) : ''
		]);
	}

	function link(downKey, upKey, mid) {
		return E('div', { 'class': 'ltc-wirebox' }, [
			E('span', { 'data-live': downKey }, '↓ –'),
			E('div', { 'class': 'ltc-wire' + (mid === false ? ' down' : '') }, E('i')),
			E('span', { 'data-live': upKey }, '↑ –')
		]);
	}

	function psum(label, value, key) {
		return E('div', { 'class': 'ltc-psum' }, [
			E('small', {}, label),
			E('b', key ? { 'data-live': key } : {}, value)
		]);
	}

	var upIf = util.arr(data.ifaces).filter(function (i) {
		return i && i.up && i.interface !== 'loopback';
	}).length;

	return card(_('Network path'), E('a', { 'class': 'ltc-link', 'href': L.url('admin/network/network') }, _('Manage') + ' →'),
		E('div', {}, [
			E('div', { 'class': 'ltc-path' }, [
			node(L.url('admin/status/realtime/traffic'), 'globe', _('Internet'),
				wan ? (util.ip4(wan) || _('Connected')) : _('Down'),
				dns.length ? 'DNS ' + dns[0] : ''),
			link('path-down', 'path-up', !!wan),
			node(L.url('admin/status/overview'), 'router', hostname,
				lanIpOf(lan) + (board.model ? ' · ' + board.model : ''),
				util.fmtDuration(info.uptime) + ' · ' + mem.percent + '% ' + _('memory'), 'me'),
			link('path-lan-down', 'path-lan-up', !!lan),
			node(L.url('admin/network/wireless'), 'wifi', _('LAN / WiFi'),
				wifi.ssids.length ? wifi.ssids[0] : '%d / %d %s'.format(wifi.up, wifi.total, _('radios')),
				'%d %s'.format(clientsOf(data).length, _('devices')))
			]),
			treeSection(data, data.wifi),
			E('div', { 'class': 'ltc-pathsum' }, [
				psum(_('Current traffic'), '↓ –  ↑ –', 'path-now'),
				psum(_('Connected'), wan && wan.uptime != null ? util.fmtDuration(wan.uptime) : '–', 'path-conn'),
				psum(_('Networks'), '%d · %s'.format(upIf, _('active')), 'path-nets'),
				psum(_('Busiest network'), '–', 'path-busy')
			])
		]));
}

function lanIpOf(lan) {
	var a = util.arr(lan && lan['ipv4-address'])[0];
	if (!a)
		return '–';
	var mask = a.mask != null ? '/' + a.mask : '';
	return a.address + mask;
}

function rateText(r) {
	if (!r)
		return '–';
	return '↓ %s ↑ %s'.format(util.fmtRate(r.rx_rate), util.fmtRate(r.tx_rate));
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

/* Branching LAN view: bridge → physical ports → the hosts learned on each.
   Wired ports come from the bridge FDB, wireless ones from the driver's
   association list, so a device lands under the radio it actually uses. */
function treeSection(data, wifi) {
	var topo = data.topology || {};
	var rates = (data.rates && data.rates.rates) || {};
	var assoc = data.assoc || {};
	var fdb = util.fdbMap(topo);
	var hosts = util.hosts(data.hints, data.leases);
	var byMac = {};
	var placed = {};

	hosts.forEach(function (h) {
		if (h.mac)
			byMac[h.mac] = h;
	});

	function leaf(mac) {
		var h = byMac[mac] || {};
		var ip = (h.ips && h.ips[0]) || '';
		var key = 'hr-' + String(ip || mac).replace(/[.:]/g, '-');

		placed[mac] = true;

		return E('li', {}, E('a', {
			'class': 'ltc-tnode leaf' + (h.online ? ' up' : ''),
			'href': L.url('admin/clients'),
			'title': '%s · %s'.format(h.name || mac, mac)
		}, [
			E('span', { 'class': 'ic' }, util.icon('devices')),
			E('span', { 'class': 'tname' }, h.name || mac),
			E('small', { 'class': 'tmeta' }, ip || _('no address')),
			E('b', { 'class': 'trate', 'data-live': key }, ip ? rateText(rates[ip]) : '–')
		]));
	}

	function portNode(p) {
		var stations = p.wireless ? (assoc[p.device] || []) : [];
		var macs = p.wireless
			? stations.map(function (s) { return s.mac; })
			: Object.keys(fdb).filter(function (mac) { return fdb[mac] === p.device; });

		macs = macs.filter(function (m, i) { return macs.indexOf(m) === i && !placed[m]; });

		var meta = [];
		if (p.wireless) {
			var ssid = ssidForNetdev(wifi, p.device);
			if (ssid)
				meta.push(ssid);
		}
		if (p.speed)
			meta.push('%d Mb/s'.format(p.speed));
		if (p.state && p.state !== 'up' && p.state !== 'unknown')
			meta.push(p.state);

		return E('li', {}, [
			E('div', {
				'class': 'ltc-tnode port ' + (p.state === 'up' ? 'up' : 'down') + (p.wireless ? ' wifi' : ''),
				'title': '%s · %s'.format(p.label || p.device, meta.join(' · ') || p.state || '–')
			}, [
				E('span', { 'class': 'ic' }, util.icon(p.wireless ? 'wifi' : 'network')),
				E('span', { 'class': 'tname' }, p.label || p.device),
				E('small', { 'class': 'tmeta' }, meta.join(' · ') || (p.wireless ? _('radio') : _('idle'))),
				macs.length ? E('b', { 'class': 'tcount' }, String(macs.length)) : ''
			]),
			macs.length ? E('ul', { 'class': 'ltc-tkids' }, macs.map(leaf)) : ''
		]);
	}

	var ports = util.arr(topo.ports);
	if (!ports.length)
		return E('div', { 'class': 'ltc-muted ltc-tree-empty' }, _('No bridge ports were reported.'));

	/* leaf() records what it placed, so the catch-all has to be computed after
	   the port branches exist, not before */
	var kids = ports.map(portNode);

	/* ONUs and DSA boards can expose dozens of bridge members; show the first
	   screenful and let the user open the rest */
	var LIMIT = 12;
	var hidden = [];

	if (kids.length > LIMIT) {
		hidden = kids.slice(LIMIT);
		kids = kids.slice(0, LIMIT);
	}

	var stray = hosts.filter(function (h) { return h.mac && !placed[h.mac]; });

	var branch = E('ul', { 'class': 'ltc-tkids' });

	kids.forEach(function (n) { branch.appendChild(n); });

	if (stray.length) {
		branch.appendChild(E('li', {}, [
			E('div', { 'class': 'ltc-tnode other', 'title': _('Hosts the bridge forwarding table could not place') }, [
				E('span', { 'class': 'ic' }, util.icon('info')),
				E('span', { 'class': 'tname' }, _('Other links')),
				E('small', { 'class': 'tmeta' }, _('port unknown')),
				E('b', { 'class': 'tcount' }, String(stray.length))
			]),
			E('ul', { 'class': 'ltc-tkids' }, stray.map(function (h) { return leaf(h.mac); }))
		]));
	}

	if (hidden.length) {
		var more = E('li', {}, E('div', { 'class': 'ltc-tnode more', 'role': 'button', 'tabindex': '0' }, [
			E('span', { 'class': 'ic' }, util.icon('chev')),
			E('span', { 'class': 'tname' }, '%d %s'.format(hidden.length, _('more ports')))
		]));

		more.firstChild.addEventListener('click', function () {
			hidden.forEach(function (n) { branch.insertBefore(n, more); });
			more.remove();
		});

		branch.appendChild(more);
	}

	return E('ul', { 'class': 'ltc-tree' }, [
		E('li', {}, [
			E('div', { 'class': 'ltc-tnode root' }, [
				E('span', { 'class': 'ic' }, util.icon('router')),
				E('span', { 'class': 'tname' }, topo.bridge || _('Bridge')),
				E('small', { 'class': 'tmeta' }, '%d · %d %s'.format(ports.length, hosts.length, _('devices')))
			]),
			branch
		])
	]);
}

/* Heaviest talkers right now, straight from the conntrack accounting diff.
   The rows are filled by drawTalkers() so a poll can move them. */
function talkersCard(data) {
	var enabled = data.rates && data.rates.enabled;

	return card(_('Top talkers'),
		E('span', { 'class': 'ltc-badge ' + (enabled ? 'ok' : 'plain'), 'data-live': 'talkers-mode' },
			enabled ? _('live') : _('accounting off')),
		E('ul', { 'class': 'ltc-talkers', 'data-talkers': '' }),
		E('div', { 'class': 'ltc-muted', 'data-talkers-hint': '' },
			enabled ? '' : _('Enable per-device accounting in Appearance to see which hosts are busy.')));
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
		}
		else {
			d.topology = {};
			d.assoc = {};

			var ports = [];

			return util.topology().then(function (topo) {
				self._topo = topo || {};
				d.topology = self._topo;
				ports = util.arr(self._topo.ports).filter(function (p) { return p && p.wireless; });

				return Promise.all(ports.map(function (p) {
					return util.assocList(p.device)
						.then(function (stations) { return { dev: p.device, stations: stations || [] }; })
						.catch(function () { return { dev: p.device, stations: [] }; });
				}));
			}).then(function (list) {
				self._assoc = {};
				(list || []).forEach(function (e) {
					if (e && e.dev)
						self._assoc[e.dev] = e.stations || [];
				});
				d.assoc = self._assoc;
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
			}, this));
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

		set('[data-live=uptime]', util.fmtDuration(data.info.uptime));
		set('[data-live=uptime-sub]', _('%s since boot').format(util.fmtDuration(data.info.uptime)));
		if (data.info.localtime)
			set('[data-live=sys-time]', new Date(data.info.localtime * 1000).toLocaleString());
		setNum('[data-live=memory]', mem.percent, '%');
		set('[data-live=memory-sub]', '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total)));
		set('[data-live=wan]', wan ? (util.ip4(wan) || _('Connected')) : _('Down'));
		set('[data-live=wan-sub]', wan ? (wan.proto || wan.device || '') : _('No default route'));
		setNum('[data-live=devices]', clients.length, '');
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
		setNum('[data-live=storage]', storage ? storage.percent : 0, '%');
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
				set('[data-live=path-down]', '↓ ' + util.fmtRate(rx));
				set('[data-live=path-up]', '↑ ' + util.fmtRate(tx));
				set('[data-live=path-now]', '↓ ' + util.fmtRate(rx) + '  ↑ ' + util.fmtRate(tx));
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

		/* busiest network = interface with the highest combined rate */
		var self = this;
		var bn = '', brx = 0, btx = 0, bv = -1;
		this._lastDev = this._lastDev || {};
		var dnow = Date.now();
		data.ifaces.forEach(function (i) {
			if (!i || !i.up || i.interface === 'loopback')
				return;
			var dn = i['l3_device'] || i.device;
			var dd = dn && data.devices && data.devices[dn];
			var ds = dd && (dd.stats || dd.statistics);
			if (!ds)
				return;
			var p = self._lastDev[i.interface];
			if (p) {
				var pdt = Math.max(1, (dnow - p.t) / 1000);
				var prx = Math.max(0, (Number(ds.rx_bytes) - p.rx) / pdt);
				var ptx = Math.max(0, (Number(ds.tx_bytes) - p.tx) / pdt);
				if (prx + ptx > bv) {
					bv = prx + ptx;
					bn = i.interface;
					brx = prx;
					btx = ptx;
				}
			}
			self._lastDev[i.interface] = { t: dnow, rx: Number(ds.rx_bytes) || 0, tx: Number(ds.tx_bytes) || 0 };
		});
		if (bn)
			set('[data-live=path-busy]', '%s ↓ %s ↑ %s'.format(bn, util.fmtRate(brx), util.fmtRate(btx)));
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

		var hero = document.querySelector('[data-live=hero-uptime]');
		if (hero)
			hero.textContent = util.fmtDuration(data.info.uptime);

		var lanNode = document.querySelector('[data-live=hero-lan]');
		if (lanNode)
			lanNode.textContent = lan ? util.ip4(lan) : '–';

		this.updateRates(data.rates);
		this.drawTalkers(data);
	},

	updateRates: function (rates) {
		var hosts = (rates && rates.rates) || {};

		Object.keys(hosts).forEach(function (ip) {
			var el = document.querySelector('[data-live=hr-' + ip.replace(/\./g, '-') + ']');
			var text = rateText(hosts[ip]);

			if (!el || el.textContent === text)
				return;

			el.textContent = text;
			el.classList.remove('ltc-flash');
			void el.offsetWidth;
			el.classList.add('ltc-flash');
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

			box.appendChild(E('li', { 'class': 'ltc-talker', 'title': '%s · %s'.format(name, e.ip) }, [
				E('span', { 'class': 'who' }, name),
				E('i', { 'class': 'bar' }, E('u', { 'style': 'width:%d%%'.format(Math.min(100, Math.round(total * 100 / peak))) })),
				E('b', { 'class': 'val' }, rateText(e.r)),
				e.r.age > 20 ? E('small', { 'class': 'age' }, _('%ds ago').format(e.r.age)) : ''
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
		set('[data-live=tick-0]', rel(t0));
		set('[data-live=tick-1]', rel(t0 + (tN - t0) / 3));
		set('[data-live=tick-2]', rel(t0 + (tN - t0) * 2 / 3));

		/* Persist the daily maximum beyond the in-tab history window. */
		var dkey = 'lucent.peak.' + new Date().toISOString().slice(0, 10);
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
					 * until we either see it running or get a real exit code. */
					if (!self._upSeen && (st.code == null || st.code < 0))
						return;
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
				E('div', { 'class': 'ltc-hero-line' }, [E('small', {}, _('Installed version')), verLabel]),
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
		if (ds.topo !== '0')
			stack.push(pathCard(data, wan, lan, wifi, hostname));
		if (data.rates && Number(data.rates.enabled) === 1)
			stack.push(talkersCard(data));
		if (ds.trend !== '0')
			stack.push(sparkCard());
		stack.push(
			E('div', { 'class': 'ltc-grid' }, [networkCard, healthCard]),
			E('div', { 'class': 'ltc-grid' }, [clientsCard, actionsCard]),
			E('div', { 'class': 'ltc-grid' }, [systemCard])
		);
		return E('div', { 'class': 'ltc-stack' }, stack);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
