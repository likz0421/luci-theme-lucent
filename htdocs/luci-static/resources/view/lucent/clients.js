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
   column stays empty and the card explains how to turn it on. */
function rateCell(r) {
	if (!r)
		return E('div', { 'class': 'ltc-rate none' }, '–');

	var total = Math.max(r.rx_rate + r.tx_rate, 1);

	return E('div', { 'class': 'ltc-rate' }, [
		E('span', {}, '↓ ' + util.fmtRate(r.rx_rate)),
		E('span', {}, '↑ ' + util.fmtRate(r.tx_rate)),
		E('i', { 'class': 'ltc-ratebar' }, E('u', { 'style': 'width:' + Math.min(100, Math.round(total / 1024 / 1024 * 10)) + '%' }))
	]);
}

function ageText(r) {
	if (!r || r.age < 0)
		return '';
	if (r.age <= 2)
		return _('now');
	if (r.age < 90)
		return _('%ds ago').format(r.age);
	if (r.age < 5400)
		return _('%dm ago').format(Math.round(r.age / 60));
	return _('%dh ago').format(Math.round(r.age / 3600));
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

var SORTS = {
	name: function (a, b) { return String(a.name).toLowerCase() < String(b.name).toLowerCase() ? -1 : 1; },
	ip: function (a, b) { return (Number(a.ip.split('.').reduce(function (p, o) { return p * 256 + Number(o); }, 0)) || 0) - ((Number(b.ip.split('.').reduce(function (p, o) { return p * 256 + Number(o); }, 0)) || 0)); },
	conns: function (a, b) { return a.conns - b.conns; },
	status: function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0); },
	rate: function (a, b) { return (b.rate ? b.rate.rx_rate + b.rate.tx_rate : 0) - (a.rate ? a.rate.rx_rate + a.rate.tx_rate : 0); }
};

return view.extend({
	load: function () {
		return this.refresh();
	},

	refresh: function () {
		var self = this;

		return Promise.all([util.load(), util.hostRates()]).then(function (r) {
			self._hr = r[1] || {};
			return r[0];
		});
	},

	render: function (data) {
		var self = this;

		this.sortKey = 'status';
		this.sortDir = 1;

		this.sumBox = E('div', { 'class': 'ltc-kpis' });
		this.empty = E('div', { 'class': 'ltc-empty' },
			_('No devices have been seen yet. Connect a device or check the DHCP leases.'));

		this.filter = E('input', {
			'type': 'search',
			'placeholder': _('Filter by name, IP or MAC address'),
			'autocomplete': 'off',
			'spellcheck': 'false'
		});
		this.filter.addEventListener('input', function () { self.applyFilter(); });

		this.table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				this.th(_('Device'), 'name'),
				this.th(_('IPv4 address'), 'ip'),
				E('th', { 'class': 'th' }, _('IPv6 address')),
				E('th', { 'class': 'th' }, _('MAC address')),
				this.th(_('Connections'), 'conns'),
				this.th(_('Rate'), 'rate'),
				this.th(_('Status'), 'status')
			])
		]);

		this.fill(data);

		var head = E('div', { 'class': 'ltc-card-h' }, [
			E('div', {}, [
				E('h3', {}, _('Devices')),
				E('p', { 'class': 'ltc-muted' }, _('Every host known to DHCP, ARP and the local neighbour table.'))
			]),
			E('div', { 'class': 'ltc-row' }, [
				E('a', { 'class': 'ltc-btn sm', 'href': L.url('admin/network/dhcp') }, _('Static leases')),
				E('a', { 'class': 'ltc-btn sm', 'href': L.url('admin/network/wireless') }, _('Wireless'))
			])
		]);

		var acctOn = data.rates && Number(data.rates.enabled) === 1;
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
			E('div', { 'class': 'ltc-field-row', 'style': 'margin:6px 0 12px' }, [
				util.icon('search'),
				this.filter
			]),
			this.table,
			this.empty
		]);

		poll.add(L.bind(function () {
			return this.refresh().then(L.bind(this.fill, this));
		}, this), 15);

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

		window.__lastClientsData = data;

		var rows = hosts.map(function (h) {
			var ip = h.ips[0] || '';

			return {
				h: h,
				name: h.name || h.mac,
				ip: ip,
				rate: ip ? rates[ip] : null,
				conns: h.ips.reduce(function (p, ip2) { return p + util.connCount(data.conns, ip2); }, 0),
				online: h.online
			};
		});

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

		rows.forEach(function (r) {
			var h = r.h;
			var kind = kindOf(h.name || h.mac);
			var search = [r.name, h.mac, h.ips.join(' '), h.v6.join(' '), kind.label].join(' ').toLowerCase();

			var row = E('tr', { 'class': 'tr', 'data-search': search }, [
				E('td', { 'class': 'td' }, [
					E('div', { 'class': 'ltc-row' }, [
						E('span', { 'class': 'ltc-kico ' + kind.cls, 'title': kind.label }, util.icon(kind.icon)),
						E('div', { 'class': 'grow', 'style': 'min-width:0' }, [
							E('b', {}, r.name),
							E('small', { 'class': 'ltc-muted', 'style': 'display:block' }, kind.label + (h.online ? ' · ' + _('Active') : ''))
						])
					])
				]),
				E('td', { 'class': 'td' }, r.ip || '–'),
				E('td', { 'class': 'td' }, h.v6[0] || '–'),
				E('td', { 'class': 'td' }, E('code', {}, h.mac)),
				E('td', { 'class': 'td' }, r.conns > 0 ? String(r.conns) : '–'),
				E('td', { 'class': 'td' }, [
					rateCell(r.rate),
					r.rate ? E('small', { 'class': 'ltc-muted' }, ageText(r.rate)) : ''
				]),
				E('td', { 'class': 'td' }, [
					E('span', { 'class': 'ltc-badge ' + (h.online ? 'ok' : 'plain') },
						h.online ? _('Active') : _('Known')),
					h.lease ? E('small', { 'class': 'ltc-muted', 'style': 'display:block;margin-top:3px' }, h.lease) : ''
				])
			]);

			self.table.appendChild(row);
		});

		this.applyFilter();
	},

	applyFilter: function () {
		var q = this.filter.value.trim().toLowerCase();
		var shown = 0;

		Array.prototype.forEach.call(this.table.rows, function (row, i) {
			if (i === 0)
				return;
			var match = !q || row.getAttribute('data-search').indexOf(q) !== -1;
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
