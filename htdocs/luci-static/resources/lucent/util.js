'use strict';
'require baseclass';
'require rpc';

/*
 * Shared data helpers for the Lucent views.
 *
 * Everything here is read-only.  The RPC objects used are the standard
 * ubus ones exposed by LuCI (system, network.interface, luci-rpc) plus the
 * small allow-listed helper that ships with this theme.
 */

var callBoard = rpc.declare({ object: 'system', method: 'board' });
var callInfo = rpc.declare({ object: 'system', method: 'info' });
var callIfaces = rpc.declare({ object: 'network.interface', method: 'dump' });
var callHosts = rpc.declare({ object: 'luci-rpc', method: 'getHostHints' });
var callLeases = rpc.declare({ object: 'luci-rpc', method: 'getDHCPLeases' });
var callWifi = rpc.declare({ object: 'luci-rpc', method: 'getWirelessDevices' });
var callDevices = rpc.declare({ object: 'luci-rpc', method: 'getNetworkDevices' });
var callStorage = rpc.declare({ object: 'luci.lucent', method: 'storage' });
var callOverview = rpc.declare({ object: 'luci.lucent', method: 'overview' });
var callThemeCheck = rpc.declare({ object: 'luci.lucent', method: 'theme_check' });
var callThemeUpdate = rpc.declare({ object: 'luci.lucent', method: 'theme_update' });
var callThemeStatus = rpc.declare({ object: 'luci.lucent', method: 'theme_status' });

function arr(v) {
	if (v == null)
		return [];
	return Array.isArray(v) ? v : [v];
}

function pushUnique(list, value) {
	if (value != null && value !== '' && list.indexOf(value) === -1)
		list.push(value);
}

function ip4(iface) {
	var a = arr(iface && iface['ipv4-address'])[0];
	return a && a.address ? a.address : '';
}

function ip6(iface) {
	var a = arr(iface && iface['ipv6-address'])[0];
	return a && a.address ? a.address : '';
}

function hasDefaultRoute(iface) {
	return arr(iface && iface.route).some(isDefaultRoute);
}

function findWan(ifaces) {
	var list = arr(ifaces).filter(function (i) {
		return i && i.interface !== 'loopback';
	});

	return list.filter(function (i) { return i.up && hasDefaultRoute(i); })[0] ||
		list.filter(function (i) { return i.up && /^(wan|wwan|pppoe|wwan6)/.test(i.interface || ''); })[0] ||
		list.filter(function (i) { return i.up && ip4(i); })[0] ||
		null;
}

function findLan(ifaces, wan) {
	var list = arr(ifaces);

	return list.filter(function (i) { return i.interface === 'lan'; })[0] ||
		list.filter(function (i) { return i !== wan && i.up && ip4(i); })[0] ||
		null;
}

/* netifd >= 22.03 dumps routes as { target, mask:int, nexthop }; older
   builds used { target, mask:"0.0.0.0", gateway }. Normalise both shapes. */
function routeTarget(r) {
	return String((r && r.target) || '').split('/')[0];
}

function isDefaultRoute(r) {
	if (!r)
		return false;

	var t = routeTarget(r);
	if (t !== '0.0.0.0' && t !== '::')
		return false;

	if (r.mask == null)
		return true;
	if (typeof r.mask === 'string')
		return r.mask === '0.0.0.0' || r.mask === '::' || Number(r.mask) === 0;
	return Number(r.mask) === 0;
}

function routeGateway(r) {
	return (r && (r.gateway || r.nexthop)) || '';
}

function gatewayOf(iface) {
	var routes = arr(iface && iface.route);
	var v4 = routes.filter(function (r) {
		return isDefaultRoute(r) && routeTarget(r) === '0.0.0.0' && routeGateway(r);
	})[0];
	var v6 = routes.filter(function (r) {
		return isDefaultRoute(r) && routeTarget(r) === '::' && routeGateway(r);
	})[0];
	return routeGateway(v4) || routeGateway(v6) || '';
}

/* Current netifd exports the list under "dns-server"; "dns-dnsservers" holds
   objects in some builds, older ones used "dnsserver". Accept all shapes. */
function dnsOf(iface) {
	var out = [];
	var lists = [
		iface && iface['dns-server'],
		iface && iface['dns-dnsservers'],
		iface && iface['dns-servers'],
		iface && iface['dnsserver'],
		iface && iface.dns
	];

	lists.forEach(function (list) {
		arr(list).forEach(function (s) {
			pushUnique(out, typeof s === 'string' ? s : (s && (s.address || s.server)));
		});
	});

	return out;
}

function storageOf(storage) {
	var root = storage && (storage.overlay || storage['/']);
	if (!root)
		root = Object.keys(storage || {}).map(function (k) { return storage[k]; })
			.filter(function (v) { return v && v.total != null; })[0];
	if (!root)
		return null;
	var total = Number(root.total) || 0, free = Number(root.free) || 0;
	return { total: total, free: free, used: Math.max(0, total - free), percent: pct(total - free, total) };
}

function fmtBytes(n) {
	n = Number(n);
	if (!isFinite(n))
		return '–';
	if (n < 1024)
		return Math.round(n) + ' B';

	var units = ['KiB', 'MiB', 'GiB', 'TiB'];
	var i = -1;
	do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
	return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + ' ' + units[i];
}

function fmtRate(bytes) {
	var n = Number(bytes);
	if (!isFinite(n) || n < 0)
		n = 0;
	return fmtBytes(n) + '/s';
}

function fmtDuration(sec) {
	sec = Math.max(0, Math.floor(Number(sec) || 0));
	var d = Math.floor(sec / 86400);
	var h = Math.floor((sec % 86400) / 3600);
	var m = Math.floor((sec % 3600) / 60);
	var s = sec % 60;

	if (d)
		return d + 'd ' + h + 'h';
	if (h)
		return h + 'h ' + m + 'm';
	if (m)
		return m + 'm ' + s + 's';
	return s + 's';
}

function pct(part, total) {
	part = Number(part) || 0;
	total = Number(total) || 0;
	if (total <= 0)
		return 0;
	return Math.max(0, Math.min(100, Math.round(part * 100 / total)));
}

function hostsFrom(hints, leases) {
	var map = {}, list = [];

	function get(mac) {
		mac = String(mac || '').toUpperCase();
		if (!mac)
			return null;
		if (!map[mac]) {
			map[mac] = { mac: mac, name: '', ips: [], v6: [], online: false, lease: null };
			list.push(map[mac]);
		}
		return map[mac];
	}

	Object.keys(hints || {}).forEach(function (key) {
		var h = hints[key] || {};
		var rec = get(h.mac || key);
		if (!rec)
			return;
		if (h.name)
			rec.name = h.name;
		arr(h.ipaddrs || h.ipv4).forEach(function (ip) { pushUnique(rec.ips, ip); });
		arr(h.ip6addrs || h.ipv6).forEach(function (ip) { pushUnique(rec.v6, ip); });
	});

	function applyLease(l) {
		if (!l)
			return;
		var rec = get(l.macaddr || l.mac);
		if (!rec)
			return;
		if (l.hostname)
			rec.name = rec.name || l.hostname;
		if (l.ipaddr)
			pushUnique(rec.ips, l.ipaddr);
		arr(l.ip6addrs || l.ip6addr).forEach(function (ip) { pushUnique(rec.v6, ip); });

		/* dnsmasq/odhcpd report `expires` as an absolute epoch; false means
		   a permanent (static) lease. */
		if (l.expires === false) {
			rec.online = true;
			rec.lease = '∞';
		}
		else if (typeof l.expires === 'number') {
			var remaining = l.expires - Math.floor(Date.now() / 1000);
			if (remaining > 0) {
				rec.online = true;
				rec.lease = fmtDuration(remaining);
			}
			else if (rec.lease == null) {
				rec.lease = 'expired';
			}
		}
	}

	var l4 = (leases && (leases.dhcp_leases || leases.leases)) || [];
	var l6 = (leases && leases.dhcp6_leases) || [];
	arr(l4).forEach(applyLease);
	arr(l6).forEach(applyLease);

	list.sort(function (a, b) {
		if (a.online !== b.online)
			return a.online ? -1 : 1;
		var an = (a.name || a.mac).toLowerCase();
		var bn = (b.name || b.mac).toLowerCase();
		return an < bn ? -1 : (an > bn ? 1 : 0);
	});

	return list;
}

var PATHS = {
	globe: [
		'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17',
		'M3.5 12h17',
		'M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z'
	],
	network: [
		'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17',
		'M3.5 12h17',
		'M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z'
	],
	router: [
		'M4.5 4.5h15v6h-15z',
		'M4.5 13.5h15v6h-15z',
		'M7 7.5h.01',
		'M7 16.5h.01'
	],
	laptop: [
		'M4.5 5.5h15v10h-15z',
		'M2 19h20'
	],
	wifi: [
		'M2.5 8.5a14 14 0 0 1 19 0',
		'M5.5 12a9.5 9.5 0 0 1 13 0',
		'M8.5 15.5a5 5 0 0 1 7 0',
		'M12 19h.01'
	],
	shield: [
		'M12 3.5 19 6v5.5c0 4.3-3 8-7 9.5-4-1.5-7-5.2-7-9.5V6z'
	],
	sliders: [
		'M4 7h10',
		'M18 7h2',
		'M4 17h2',
		'M10 17h10',
		'M4 12h6',
		'M14 12h6',
		'M16 5v4',
		'M8 10v4',
		'M12 15v4'
	],
	refresh: [
		'M20 12a8 8 0 1 1-2.3-5.7',
		'M20 4v5h-5'
	],
	download: [
		'M12 4v11',
		'M7.5 11 12 15.5 16.5 11',
		'M4 19h16'
	],
	upload: [
		'M12 20V9',
		'M7.5 13.5 12 9l4.5 4.5',
		'M4 4h16'
	],
	trash: [
		'M4 7h16',
		'M9 7V4.5h6V7',
		'M6.5 7l1 13h9l1-13',
		'M10 11v5',
		'M14 11v5'
	],
	image: [
		'M3.5 5h17v14h-17z',
		'M3.5 16l5-5 4.5 4.5L16 12l4.5 4.5',
		'M8.5 9.5h.01'
	],
	video: [
		'M3.5 6h11v12h-11z',
		'M14.5 10l6-3v10l-6-3z'
	],
	check: [
		'M5 12.5 9.5 17 19 7.5'
	],
	x: [
		'M6 6l12 12',
		'M18 6 6 18'
	],
	sun: [
		'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
		'M12 2.5v2',
		'M12 19.5v2',
		'M2.5 12h2',
		'M19.5 12h2',
		'M5.3 5.3l1.4 1.4',
		'M17.3 17.3l1.4 1.4',
		'M18.7 5.3l-1.4 1.4',
		'M6.7 17.3l-1.4 1.4'
	],
	moon: [
		'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'
	],
	search: [
		'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13',
		'M15.5 15.5 21 21'
	],
	info: [
		'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17',
		'M12 10.5V17',
		'M12 7.5h.01'
	],
	link: [
		'M9.5 14.5 14.5 9.5',
		'M8 16l-1.5 1.5a3.5 3.5 0 0 1-5-5L5 9a3.5 3.5 0 0 1 5 0',
		'M16 8l1.5-1.5a3.5 3.5 0 0 1 5 5L19 15a3.5 3.5 0 0 1-5 0'
	],
	home: [
		'M3.5 10.5 12 3.8l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.4v-5.7H9.4v5.7H5A1.5 1.5 0 0 1 3.5 19z'
	],
	devices: [
		'M4 6.5h11v8H4z',
		'M2.5 18.5h14',
		'M17.5 9.5h4v9h-4z'
	],
	chev: [
		'M14.5 6.5 8.5 12l6 5.5'
	]
};

function icon(name, cls) {
	var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	if (cls)
		svg.setAttribute('class', cls);

	(PATHS[name] || PATHS.info).forEach(function (d) {
		var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		svg.appendChild(path);
	});

	return svg;
}

return baseclass.extend({
	load: function () {
		return Promise.all([
			L.resolveDefault(callBoard(), {}),
			L.resolveDefault(callInfo(), {}),
			L.resolveDefault(callIfaces(), { interface: [] }),
			L.resolveDefault(callHosts(), {}),
			L.resolveDefault(callLeases(), {}),
			L.resolveDefault(callWifi(), {}),
			L.resolveDefault(callStorage(), {}),
			L.resolveDefault(callDevices(), {}),
			L.resolveDefault(callOverview(), {})
		]).then(function (r) {
			return {
				board: r[0] || {},
				info: r[1] || {},
				ifaces: arr(r[2] && r[2]['interface']),
				hints: r[3] || {},
				leases: r[4] || {},
				wifi: r[5] || {},
				storage: r[6] || {},
				devices: r[7] || {},
				net: r[8] || {}
			};
		});
	},

	hosts: function (hints, leases) { return hostsFrom(hints, leases); },
	wan: function (ifaces) { return findWan(ifaces); },
	lan: function (ifaces, wan) { return findLan(ifaces, wan); },
	gateway: gatewayOf,
	dns: dnsOf,
	storage: storageOf,
	checkUpdate: function () { return callThemeCheck(); },
	startUpdate: function () { return callThemeUpdate(); },
	updateStatus: function () { return callThemeStatus(); },
	overview: function () { return callOverview(); },
	ip4: ip4,
	ip6: ip6,
	hasDefaultRoute: hasDefaultRoute,
	fmtBytes: fmtBytes,
	fmtRate: fmtRate,
	fmtDuration: fmtDuration,
	pct: pct,
	icon: icon,
	arr: arr
});
