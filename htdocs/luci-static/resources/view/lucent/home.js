'use strict';
'require view';
'require poll';
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

function fact(label, value) {
	return E('div', {}, [
		E('small', {}, label),
		E('b', {}, value || '–')
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

function memoryOf(info) {
	var mem = info.memory || {};
	var swap = info.swap || {};
	var used = (mem.total || 0) - (mem.free || 0);
	var swapUsed = (swap.total || 0) - (swap.free || 0);

	return {
		total: mem.total || 0,
		used: Math.max(0, used),
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
	var ssid = '';

	keys.forEach(function (k) {
		util.arr((wifi[k] || {}).interfaces).forEach(function (iface) {
			var cfg = (iface && iface.config) || {};
			if (!ssid && cfg.ssid)
				ssid = cfg.ssid;
		});
	});

	return { total: keys.length, up: up.length, ssid: ssid };
}

function clientsOf(data) {
	return util.hosts(data.hints, data.leases);
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
		set('[data-live=memory]', mem.percent + '%');
		set('[data-live=memory-sub]', '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total)));
		set('[data-live=wan]', wan ? (util.ip4(wan) || _('Connected')) : _('Down'));
		set('[data-live=wan-sub]', wan ? (wan.proto || wan.device || '') : _('No default route'));
		set('[data-live=devices]', String(clients.length));
		set('[data-live=devices-sub]', _('%d active').format(online));

		var stats = wan && wan.statistics;
		if (stats) {
			var now = Date.now();
			if (this._lastStats) {
				var dt = Math.max(1, (now - this._lastStats.t) / 1000);
				var rx = Math.max(0, (Number(stats.rx_bytes) - this._lastStats.rx) / dt);
				var tx = Math.max(0, (Number(stats.tx_bytes) - this._lastStats.tx) / dt);
				set('[data-live=traffic]', '↓ ' + util.fmtRate(rx) + '  ↑ ' + util.fmtRate(tx));
				set('[data-live=traffic-sub]', wan.device || wan.proto || '');
			}
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
			kpi(_('Memory'), mem.percent + '%', '%s / %s'.format(util.fmtBytes(mem.used), util.fmtBytes(mem.total)), 'memory')
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

		var facts = E('div', { 'class': 'ltc-facts' }, [
			fact(_('Firmware'), release),
			fact(_('Kernel'), board.kernel || '–'),
			fact(_('Architecture'), board.system || '–'),
			fact(_('LAN address'), lanIp || '–'),
			fact(_('WiFi'), wifi.ssid || (wifi.up + ' / ' + wifi.total + ' ' + _('radios'))),
			fact(_('WAN protocol'), wan ? (wan.proto || '–') : '–'),
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
				mem.swapTotal ? E('span', { 'class': 'ltc-tag' }, [E('b', {}, util.fmtBytes(mem.swapUsed)), ' / ', util.fmtBytes(mem.swapTotal), ' swap']) : '',
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

		this.startPoll();

		return E('div', { 'class': 'ltc-stack' }, [
			hero,
			kpis,
			E('div', { 'class': 'ltc-grid' }, [networkCard, healthCard]),
			E('div', { 'class': 'ltc-grid' }, [clientsCard, actionsCard])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
