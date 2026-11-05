'use strict';
'require view';
'require poll';
'require lucent.core as core';
'require lucent.util as util';

/* A tile with one number in it is a tile the eye slides past; the second line
   says what the number is a share of. */
function summary(value, label, sub, percent) {
	return E('div', { 'class': 'ltc-kpi' }, [
		E('small', {}, label),
		E('b', {}, value),
		E('span', {}, sub || ''),
		percent != null ? E('i', { 'class': 'ltc-kmeter' }, E('u', {
			'style': 'width:%d%%'.format(Math.max(2, Math.min(100, Math.round(percent))))
		})) : ''
	]);
}

/* Per-host throughput comes from the conntrack accounting diff; without it the
   column stays empty and the card explains how to turn it on. The reference
   leads with the total, then the bar, then the split — the total is what the
   eye is looking for. */
function kfmt(n) {
	n = Number(n) || 0;
	if (n >= 1048576)
		return '%.1fM'.format(n / 1048576);
	if (n >= 1024)
		return '%dK'.format(Math.round(n / 1024));
	return '%dB'.format(Math.round(n));
}

function rateCell(r, max) {
	if (!r)
		return E('div', { 'class': 'ltc-rate none' }, '—');

	var rx = Number(r.rx_rate) || 0, tx = Number(r.tx_rate) || 0;
	var total = rx + tx;
	var width = max > 0 ? Math.min(100, Math.round(total * 100 / max)) : 0;

	return E('div', { 'class': 'ltc-rate' }, [
		E('span', { 'class': 'tot' }, util.fmtRate(total)),
		E('i', { 'class': 'ltc-ratebar' }, E('u', { 'style': 'width:%d%%'.format(Math.max(total > 0 ? 3 : 0, width)) })),
		E('span', { 'class': 'du' }, '↓ %s ↑ %s'.format(kfmt(rx), kfmt(tx)))
	]);
}

function ageText(r) {
	var age = r ? Number(r.age) : NaN;

	if (!isFinite(age) || age < 0)
		return '';
	if (age <= 2)
		return _('now');
	if (age < 90)
		return _('%ds ago').format(age);
	if (age < 5400)
		return _('%dm ago').format(Math.round(age / 60));
	return _('%dh ago').format(Math.round(age / 3600));
}

/* Lightweight device-class guess from the advertised name. */
function kindOf(name) {
	var n = String(name || '').toLowerCase();

	if (/iphone|ipad|pixel|galaxy|redmi|xiaomi|huawei|oneplus|honor|oppo|vivo|realme|nubia|phone|note ?[0-9]|mi ?[0-9]/.test(n))
		return { icon: 'devices', cls: 'ph', label: _('Phone') };
	if (/tv|televis|bravia|mi_tv|tvbox|tv box|roku|apple ?tv|tmall|magicbox|projector/.test(n))
		return { icon: 'video', cls: 'tv', label: _('TV / Box') };
	if (/camera|cam-|cam$|ipc|sgt|sl[0-9]|imou|ezviz|reolink|tp-link.*cam|\btp[cl][0-9]/.test(n))
		return { icon: 'video', cls: 'cam', label: _('Camera') };
	if (/macbook|imac|mac ?mini|windows|desktop|thinkpad|notebook|yoga|matebook|laptop|pc-|-pc\b|^pc\b/.test(n))
		return { icon: 'laptop', cls: 'pc', label: _('Computer') };
	if (/printer|print|laserjet|deskjet|cf[0-9]|mfp/.test(n))
		return { icon: 'sliders', cls: 'prn', label: _('Printer') };
	if (/watch|band|watch[0-9]|gt[0-9]/.test(n))
		return { icon: 'refresh', cls: 'wear', label: _('Wearable') };
	if (/esp|tuya|smart|plug|bulb|sensor|switch|socket|feeder|scale|speaker|sound|audio|box$/.test(n))
		return { icon: 'wifi', cls: 'iot', label: _('Smart device') };
	if (/router|gateway|switch|ap[0-9]?|mesh|repeater| ONU|xpon|ont/.test(n))
		return { icon: 'router', cls: 'net', label: _('Network device') };
	return { icon: 'globe', cls: 'unk', label: _('Device') };
}

/* How a host reaches the router: the bridge port and its link speed for
   cable, the radio and the signal reading for Wi-Fi. The dashboard graph uses
   the same two sources, so the pages cannot disagree about a client. */
function macKey(mac) {
	return String(mac || '').toUpperCase();
}

/* The wireless config knows which SSID and which network zone a VAP netdev
   belongs to; the dump carries both next to the interface name. */
function vapOf(wifi, netdev) {
	var out = { ssid: '', network: '' };

	Object.keys(wifi || {}).forEach(function (k) {
		util.arr((wifi[k] || {}).interfaces).forEach(function (i) {
			if (!i || (i.ifname || i.section || i['.name']) !== netdev)
				return;
			out.ssid = (i.config && i.config.ssid) || out.ssid;
			out.network = (i.config && i.config.network) || out.network;
		});
	});

	return out;
}

/* The LuCI interface a bridge port sits on, so the table can say "lan" rather
   than making the reader match netdev names by hand. `bridge` is the L2 name
   the interfaces carry; lan_ifname is the tagged L3 device and often matches
   nothing in the port list. */
function netOf(self, device) {
	var topo = self._topo || {};
	var bridge = topo.bridge || topo.lan_device || topo.lan_ifname;

	return util.arr(self._ifaces).filter(function (i) {
		if (!i)
			return false;
		var devs = [i['l3_device'], i.device];

		return devs.indexOf(bridge) >= 0 || (device && devs.indexOf(device) >= 0);
	}).map(function (i) { return i.interface; })[0] || '';
}

function linkOf(self, mac) {
	var want = macKey(mac);
	var topo = self._topo || {};
	var fdb = util.fdbMap(topo);
	var dev = fdb[want];

	if (dev) {
		var p = util.arr(topo.ports).filter(function (x) { return x && x.device === dev; })[0]
			|| { device: dev };

		return {
			wired: true,
			dev: p.label || dev,
			speed: Number(p.speed) || null,
			shared: Object.keys(fdb).filter(function (m) { return fdb[m] === dev; }).length,
			network: netOf(self, dev)
		};
	}

	var found = null;

	Object.keys(self._assoc || {}).some(function (d) {
		return util.arr(self._assoc[d]).some(function (s) {
			if (!s || macKey(s.mac) !== want)
				return false;
			found = { dev: d, signal: Number(s.signal) };
			return true;
		});
	});

	if (!found)
		return null;

	var vap = vapOf(self._wifi, found.dev);

	return {
		wired: false,
		dev: found.dev,
		signal: found.signal,
		ssid: vap.ssid,
		network: vap.network || netOf(self, found.dev),
		shared: 1
	};
}

function linkCell(l) {
	if (!l)
		return E('div', { 'class': 'ltc-linkcell' }, E('small', { 'class': 'ltc-muted' }, _('unknown')));

	/* ten hosts behind one trunk: the port is the fact worth telling, the
	   negotiated speed of a shared uplink tells nothing about this host */
	if (l.wired && l.shared > 1)
		return E('div', { 'class': 'ltc-linkcell' }, [
			E('b', {}, _('Shared port')),
			E('small', {}, '%s · %d %s'.format(l.dev, l.shared, _('devices')))
		]);

	if (l.wired)
		return E('div', { 'class': 'ltc-linkcell' }, [
			E('b', {}, l.speed
				? (l.speed >= 1000 ? _('%d Gbit/s').format(Math.round(l.speed / 1000)) : '%d Mbit/s'.format(l.speed))
				: _('Port')),
			E('small', {}, l.dev)
		]);

	return E('div', { 'class': 'ltc-linkcell' }, [
		E('b', {}, l.ssid || l.dev),
		E('small', {}, isFinite(l.signal) ? '%d dBm'.format(l.signal) : '')
	]);
}

function netCell(l, conns) {
	return E('div', { 'class': 'ltc-netcell' }, [
		E('b', {}, (l && l.network) || '–'),
		conns > 0 ? E('small', {}, '%d %s'.format(conns, _('connections'))) : ''
	]);
}

/* One line per device, like the reference: the name, and under it where the
   name came from — a DNS/lease record or nothing but the MAC. */
function devCell(h, kind) {
	var named = !!h.name;
	var ip = h.ips[0] || h.v6[0] || '';

	return E('div', { 'class': 'ltc-row' }, [
		E('span', {
			'class': 'ltc-kico ' + kind.cls + (h.online ? '' : ' off'),
			'title': kind.label
		}, util.icon(kind.icon)),
		E('div', { 'class': 'grow', 'style': 'min-width:0' }, [
			E('b', {}, named ? h.name : _('Device') + ' · …' + String(h.mac || '').slice(-8)),
			E('small', { 'class': 'ltc-muted' }, '%s %s'.format(named ? 'DNS' : 'MAC', ip || h.mac))
		])
	]);
}

var SORTS = {
	name: function (a, b) { return String(a.name).toLowerCase() < String(b.name).toLowerCase() ? -1 : 1; },
	last: function (a, b) {
		return (a.rate && a.rate.age != null ? a.rate.age : 1e12) - (b.rate && b.rate.age != null ? b.rate.age : 1e12);
	},
	ip: function (a, b) { return (Number(a.ip.split('.').reduce(function (p, o) { return p * 256 + Number(o); }, 0)) || 0) - ((Number(b.ip.split('.').reduce(function (p, o) { return p * 256 + Number(o); }, 0)) || 0)); },
	conns: function (a, b) { return a.conns - b.conns; },
	link: function (a, b) {
		var x = a.link ? (a.link.wired ? 'w' : 'r') + String(a.link.dev) : '~';
		var y = b.link ? (b.link.wired ? 'w' : 'r') + String(b.link.dev) : '~';
		return x < y ? -1 : (x > y ? 1 : 0);
	},
	network: function (a, b) {
		var x = String((a.link && a.link.network) || '~').toLowerCase();
		var y = String((b.link && b.link.network) || '~').toLowerCase();
		return x < y ? -1 : (x > y ? 1 : 0);
	},
	status: function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0); },
	rate: function (a, b) { return (b.rate ? b.rate.rx_rate + b.rate.tx_rate : 0) - (a.rate ? a.rate.rx_rate + a.rate.tx_rate : 0); }
};

return view.extend({
	load: function () {
		return this.refresh();
	},

	refresh: function () {
		var self = this;

		/* the link column needs more than the host table: which radio or port a
		   MAC was learned on, and with what signal. Same two calls the dashboard
		   graph makes, so the two pages cannot disagree about a client. */
		return Promise.all([
			util.load(),
			util.hostRates(),
			util.topology().catch(function () { return {}; })
		]).then(function (r) {
			self._hr = r[1] || {};
			self._topo = r[2] || {};

			var devs = util.arr(self._topo.ports)
				.filter(function (p) { return p && p.wireless; })
				.map(function (p) { return p.device; });

			return Promise.all(devs.map(function (dev) {
				return util.assocList(dev).catch(function () { return []; })
					.then(function (st) { return { dev: dev, stations: util.arr(st) }; });
			})).then(function (list) {
				var assoc = {};

				list.forEach(function (e) { assoc[e.dev] = e.stations; });
				self._assoc = assoc;
				return r[0];
			});
		});
	},

	render: function (data) {
		var self = this;

		/* the reference opens on the hosts it last saw, which is the order a
		   person actually reads a client table */
		this.sortKey = 'last';
		this.sortDir = 1;

		this.sumBox = E('div', { 'class': 'ltc-kpis' });
		this.countEl = E('b', { 'class': 'ltc-count' }, '–');
		this.empty = E('div', { 'class': 'ltc-empty' },
			_('No devices have been seen yet. Connect a device or check the DHCP leases.'));

		this.filter = E('input', {
			'type': 'search',
			'placeholder': _('Filter by name, address, port…'),
			'autocomplete': 'off',
			'spellcheck': 'false'
		});
		this.filter.addEventListener('input', function () { self.applyFilter(); });

		/* The reference gives the search box a key chip and a filter toggle:
			F focuses it, and the toggle hides hosts that carry no traffic at all,
			which on a 150-host flat network is the difference between a table and
			a wall. */
		this.onlyActive = false;
		try {
			this.onlyActive = localStorage.getItem('lucent.clients.active') === '1';
		} catch (e) {}

		var keychip = E('kbd', { 'class': 'ltc-keychip' }, 'F');
		var funnel = E('button', {
			'type': 'button',
			'class': 'ltc-btn ghost sm ltc-funnel',
			'title': _('Show only hosts with traffic')
		}, util.icon('sliders'));

		funnel.classList.toggle('on', this.onlyActive);
		funnel.addEventListener('click', function () {
			self.onlyActive = !self.onlyActive;
			funnel.classList.toggle('on', self.onlyActive);
			try {
				localStorage.setItem('lucent.clients.active', self.onlyActive ? '1' : '0');
			} catch (e) {}
			self.applyFilter();
		});
		this.filter.addEventListener('focus', function () { keychip.classList.add('on'); });
		this.filter.addEventListener('blur', function () { keychip.classList.remove('on'); });

		/* the chip promises a key, so the key has to work: F focuses the box
		   unless the user is already typing somewhere */
		if (window._lucentClientKey)
			document.removeEventListener('keydown', window._lucentClientKey);
		window._lucentClientKey = function (ev) {
			var t = ev.target;

			/* a window-scoped handler outlives the page it was added from:
			   only act while this view's own search box is still on screen */
			if (!self.filter || !document.contains(self.filter))
				return;
			if (ev.key !== 'f' && ev.key !== 'F')
				return;
			if (ev.ctrlKey || ev.metaKey || ev.altKey)
				return;
			if (t && /input|textarea|select/i.test(t.tagName))
				return;

			ev.preventDefault();
			self.filter.focus();
		};
		document.addEventListener('keydown', window._lucentClientKey);

		this.table = E('table', { 'class': 'table ltc-clients' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				this.th(_('Device'), 'name'),
				this.th(_('Link'), 'link'),
				this.th(_('Network'), 'network'),
				this.th(_('Live'), 'rate'),
				this.th(_('Last activity'), 'last')
			])
		]);

		this.fill(data);

		var head = E('div', { 'class': 'ltc-card-h' }, [
			E('div', {}, [
				E('h3', {}, _('Clients')),
				E('p', { 'class': 'ltc-muted' }, _('Every host known to DHCP, ARP and the local neighbour table.'))
			]),
			E('div', { 'class': 'ltc-row' }, [
				this.countEl,
				E('a', { 'class': 'ltc-btn sm', 'href': L.url('admin/network/dhcp') }, _('Static leases')),
				E('a', { 'class': 'ltc-btn sm', 'href': L.url('admin/network/wireless') }, _('Wireless'))
			])
		]);

		/* util.load() has never carried the rates object — it arrives from
		   hostRates() and lives on the view, so reading only data.rates made
		   this note claim accounting was off on every router that had it on */
		var hr = data.rates || this._hr || {};
		var acctOn = Number(hr.enabled) === 1;
		var acctNote = E('div', { 'class': 'ltc-acctnote' + (acctOn ? ' on' : '') }, [
			E('span', {}, acctOn
				? _('Per-device traffic is being counted from the connection tracking table.')
				: _('Per-device rates are off: they need conntrack accounting, which costs a little CPU per flow.')),
			acctOn ? '' : E('button', {
				'type': 'button', 'class': 'ltc-btn primary sm', 'click': function (ev) {
					var btn = ev.currentTarget;
					btn.disabled = true;
					btn.textContent = _('Turning on…');
					core.save('acct', '1').then(function () {
						core.toast(_('Per-device accounting enabled'), 'ok');
						setTimeout(function () { location.reload(); }, 700);
					}).catch(function () {
						btn.disabled = false;
						btn.textContent = _('Enable');
						core.toast(_('The router refused the change'), 'err');
					});
				}
			}, _('Enable'))
		]);

		var body = E('section', { 'class': 'ltc-card' }, [
			head,
			this.sumBox,
			acctNote,
			E('div', { 'class': 'ltc-searchrow' }, [
				util.icon('search'),
				E('span', { 'class': 'ltc-searchbox' }, [this.filter, keychip]),
				funnel
			]),
			this.table,
			this.empty
		]);

		/* poll.add is global and survives leaving the page: without this guard
		   every visit to /admin/clients stacks another 15 s sampler */
		if (!this._polling) {
			this._polling = true;
			poll.add(L.bind(function () {
				return this.refresh().then(L.bind(this.fill, this)).catch(function () {});
			}, this), 15);
		}

		return E('div', { 'class': 'ltc-stack' }, [body]);
	},

	th: function (label, key) {
		var self = this;
		var th = E('th', { 'class': 'th ltc-sortable' }, [label, E('i', { 'class': 'ltc-sortarr' })]);
		th._key = key;
		th.addEventListener('click', function () {
			if (self.sortKey === key)
				self.sortDir = -self.sortDir;
			else {
				self.sortKey = key;
				self.sortDir = 1;
			}
			self.fill(window.__lastClientsData || { hints: {}, leases: {}, ifaces: [], conns: {} }, true);
		});
		return th;
	},

	fill: function (data, keepScroll) {
		var self = this;
		var hosts = util.hosts(data.hints, data.leases);
		var rates = (data.rates && data.rates.rates) || (this._hr && this._hr.rates) || {};
		var online = hosts.filter(function (h) { return h.online; }).length;
		var v6 = hosts.filter(function (h) { return h.v6 && h.v6.length; }).length;
		var named = hosts.filter(function (h) { return h.name; }).length;

		if (data.rates)
			this._hr = data.rates;

		/* the link and network cells read these; refresh() keeps them on the
		   view because util.load() has never returned them */
		self._wifi = data.wifi || self._wifi || {};
		self._ifaces = util.arr(data.ifaces);

		window.__lastClientsData = data;

		var rows = hosts.map(function (h) {
			var ip = h.ips[0] || '';
			var r = ip ? rates[ip] : null;

			return {
				h: h,
				name: h.name || h.mac,
				ip: ip,
				rate: r,
				total: r ? (Number(r.rx_rate) || 0) + (Number(r.tx_rate) || 0) : 0,
				link: linkOf(self, h.mac),
				conns: h.ips.reduce(function (p, ip2) { return p + util.connCount(data.conns, ip2); }, 0),
				online: h.online
			};
		});

		/* bars that are each scaled to themselves compare as nothing; scale the
		   row to the busiest host on the page */
		var peak = rows.reduce(function (m, r) { return Math.max(m, r.total); }, 0);

		var cmp = SORTS[this.sortKey] || SORTS.status;
		rows.sort(function (a, b) { return cmp(a, b) * self.sortDir; });

		var titles = this.table.querySelector('.table-titles');
		if (titles)
			Array.prototype.forEach.call(titles.children, function (th) {
				if (th._key) {
					th.classList.toggle('on', th._key === self.sortKey);
					th.classList.toggle('desc', th._key === self.sortKey && self.sortDir < 0);
				}
			});

		while (this.table.rows.length > 1)
			this.table.deleteRow(1);

		this.sumBox.textContent = '';
		[
			summary(String(hosts.length), _('Known devices'),
				'%d · %s'.format(online, _('online')),
				hosts.length ? online * 100 / hosts.length : null),
			summary(String(online), _('Active leases'),
				'%d · %s'.format(named, _('named'))),
			summary(String(named), _('Named hosts'),
				'%d · %s'.format(Math.max(0, hosts.length - named), _('unnamed'))),
			summary(String(v6), _('IPv6 capable'),
				'%d · %s'.format(Math.max(0, hosts.length - v6), _('IPv4 only')))
		].forEach(function (s) { self.sumBox.appendChild(s); });

		this.countEl.textContent = '%d %s'.format(hosts.length, _('devices'));

		rows.forEach(function (r) {
			var h = r.h;
			var kind = kindOf(h.name || h.mac);
			var search = [r.name, h.mac, h.ips.join(' '), h.v6.join(' '), kind.label,
				r.link ? [r.link.dev, r.link.ssid, r.link.network].join(' ') : ''].join(' ').toLowerCase();

			var row = E('tr', {
				'class': 'tr',
				'data-search': search,
				'data-act': r.total > 0 ? '1' : '0'
			}, [
				E('td', { 'class': 'td' }, devCell(h, kind)),
				E('td', { 'class': 'td' }, linkCell(r.link)),
				E('td', { 'class': 'td' }, netCell(r.link, r.conns)),
				E('td', { 'class': 'td' }, rateCell(r.rate, peak)),
				E('td', { 'class': 'td' }, r.rate ? (ageText(r.rate) || '–') : '–')
			]);

			self.table.appendChild(row);
		});

		this.applyFilter();
	},

	applyFilter: function () {
		var q = this.filter.value.trim().toLowerCase();
		var only = this.onlyActive;
		var shown = 0;

		Array.prototype.forEach.call(this.table.rows, function (row, i) {
			if (i === 0)
				return;
			var match = (!q || row.getAttribute('data-search').indexOf(q) !== -1) &&
				(!only || row.getAttribute('data-act') === '1');
			row.hidden = !match;
			if (match)
				shown++;
		});

		this.empty.hidden = shown !== 0;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
