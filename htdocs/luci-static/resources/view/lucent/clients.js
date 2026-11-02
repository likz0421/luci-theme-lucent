'use strict';
'require view';
'require poll';
'require lucent.util as util';

function summary(value, label) {
	return E('div', { 'class': 'ltc-kpi' }, [
		E('small', {}, label),
		E('b', {}, value)
	]);
}

function ifaceName(ifaces, ip) {
	var found = util.arr(ifaces).filter(function (i) {
		return util.arr(i['ipv4-address']).some(function (a) { return a && a.address === ip; });
	})[0];

	return found ? found.interface : '';
}

return view.extend({
	load: function () {
		return util.load();
	},

	render: function (data) {
		var self = this;

		this.sumBox = E('div', { 'class': 'ltc-kpis' });

		this.table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Device')),
				E('th', { 'class': 'th' }, _('IPv4 address')),
				E('th', { 'class': 'th' }, _('IPv6 address')),
				E('th', { 'class': 'th' }, _('MAC address')),
				E('th', { 'class': 'th' }, _('Status'))
			])
		]);

		this.empty = E('div', { 'class': 'ltc-empty' },
			_('No devices have been seen yet. Connect a device or check the DHCP leases.'));

		this.filter = E('input', {
			'type': 'search',
			'placeholder': _('Filter by name, IP or MAC address'),
			'autocomplete': 'off',
			'spellcheck': 'false'
		});
		this.filter.addEventListener('input', function () { self.applyFilter(); });

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

		var body = E('section', { 'class': 'ltc-card' }, [
			head,
			this.sumBox,
			E('div', { 'class': 'ltc-field-row', 'style': 'margin:6px 0 12px' }, [
				util.icon('search'),
				this.filter
			]),
			this.table,
			this.empty
		]);

		poll.add(L.bind(function () {
			return util.load().then(L.bind(this.fill, this));
		}, this), 15);

		return E('div', { 'class': 'ltc-stack' }, [body]);
	},

	fill: function (data) {
		var self = this;
		var hosts = util.hosts(data.hints, data.leases);
		var online = hosts.filter(function (h) { return h.online; }).length;
		var v6 = hosts.filter(function (h) { return h.v6 && h.v6.length; }).length;
		var named = hosts.filter(function (h) { return h.name; }).length;

		while (this.table.rows.length > 1)
			this.table.deleteRow(1);

		this.sumBox.textContent = '';
		[
			summary(String(hosts.length), _('Known devices')),
			summary(String(online), _('Active leases')),
			summary(String(named), _('Named hosts')),
			summary(String(v6), _('IPv6 capable'))
		].forEach(function (s) { self.sumBox.appendChild(s); });

		hosts.forEach(function (h) {
			var name = h.name || h.mac;
			var ip = h.ips[0] || '';
			var v6a = h.v6[0] || '';
			var net = ifaceName(data.ifaces, ip);
			var search = [name, h.mac, h.ips.join(' '), h.v6.join(' '), net].join(' ').toLowerCase();

			var row = E('tr', { 'class': 'tr', 'data-search': search }, [
				E('td', { 'class': 'td' }, [
					E('div', { 'class': 'ltc-row' }, [
						E('span', { 'class': 'ltc-dot' + (h.online ? '' : ' off') }),
						E('div', { 'class': 'grow', 'style': 'min-width:0' }, [
							E('b', {}, name),
							net ? E('small', { 'class': 'ltc-muted', 'style': 'display:block' }, net) : ''
						])
					])
				]),
				E('td', { 'class': 'td' }, ip || '–'),
				E('td', { 'class': 'td' }, v6a || '–'),
				E('td', { 'class': 'td' }, E('code', {}, h.mac)),
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
