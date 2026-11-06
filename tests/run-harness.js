/* Run tests/harness.html in headless Edge across every scenario and print the
   assertion report, so "verified in a browser" is one command instead of a
   remembered incantation. Exits non-zero if any line says FAIL or THREW.
   usage: node tests/run-harness.js [--shot] [#scenario ...]  */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
	? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
	: 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.lmo': 'application/octet-stream'
};

const ALL = ['#base', '#dhcpwan', '#menu-reject', '#menu-empty', '#menu-noclass', '#menu-throw',
	'#menu-noload', '#menu-nomatch', '#menu-hang', '#menu-cache', '#menu-nostore', '#manyports',
	'#tree-noisy', '#rail', '#rail-auto', '#drawer', '#phone', '#phone-open', '#phone-tall',
	'#phone-clients', '#generic', '#phone-generic', '#settings', '#phone-settings'];

const wantShot = process.argv.includes('--shot');
/* --width=900 runs every scenario inside a frame of that exact CSS width, so
   the breakpoint band between the phone and the desktop can be swept instead
   of guessed at. */
const forced = (process.argv.find(a => a.startsWith('--width=')) || '').split('=')[1];
const forcedWidth = forced ? parseInt(forced, 10) : 0;
const only = process.argv.slice(2).filter(a => !a.startsWith('--') && a !== '');
const scenarios = only.length ? only.map(a => (a.startsWith('#') ? a : '#' + a)) : ALL;

const server = http.createServer((req, res) => {
	const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));

	fs.readFile(file, (err, buf) => {
		if (err) {
			res.writeHead(404);
			res.end('not found');
			return;
		}
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
		res.end(buf);
	});
});

function report(dom) {
	const m = /id="report"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);

	if (!m)
		return null;

	return m[1]
		.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
		.split('\n').filter(l => l.trim());
}

/* Edge's renderer children inherit whatever pipe we hand them and outlive the
   main process, so waiting for the pipe — which execFileSync does — hangs.
   Send output to a file and resolve when the main process exits. */
function drive(url, opt, out) {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-harness-'));
	const fd = fs.openSync(out, 'w');
	/* --window-size is in PHYSICAL pixels. On a display at 125% or 150%
	   scaling a "390px" phone window becomes 480 or 585 CSS pixels wide, so
	   every mobile scenario silently ran as a tablet and mobile overflow bugs
	   could not be seen at all. Ask Edge for the device pixels. */
	const scale = parseFloat(process.env.LUCENT_FORCE_DEVICE_SCALE || '1');
	const args = [
		'--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
		'--force-device-scale-factor=' + scale,
		'--user-data-dir=' + profile, '--virtual-time-budget=' + opt.budget,
		'--window-size=' + Math.round(opt.width * scale) + ',' + Math.round(opt.height * scale),
		opt.shot ? '--screenshot=' + opt.shot : '--dump-dom',
		url
	];

	return new Promise((resolve) => {
		const p = spawn(EDGE, args, { stdio: ['ignore', fd, fd] });
		const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 120000);

		function done() {
			clearTimeout(kill);
			try { fs.closeSync(fd); } catch (e) {}
			fs.rmSync(profile, { recursive: true, force: true });
			resolve();
		}

		p.on('exit', done);
		p.on('error', done);
	});
}

async function run(port) {
	const tmp = path.join(os.tmpdir(), 'lucent-harness-dom.html');
	const shots = path.join(__dirname, 'shots');
	let bad = 0;

	if (wantShot)
		fs.mkdirSync(shots, { recursive: true });

	for (const flag of scenarios) {
		/* #tall is a viewport choice rather than a scenario: the same page, tall
		   enough to photograph the whole dashboard in one picture */
		const base = (flag === '#base' || flag === '#tall') ? '' : flag;
		const tall = /-tall$/.test(flag) || flag === '#tall';
		/* the same photographing aid at phone width: the whole dashboard in one
		   tall picture, because a 844px window hides everything below the tiles */
		const phoneTall = flag === '#phone-tall';
		const graph = flag === '#graph';
		const narrow = /^#(drawer|phone)/.test(base);
		/* a laptop window: wide enough for the desktop shell, narrow enough
		   that the width rule is supposed to collapse the sidebar by itself */
		const laptop = base === '#rail-auto';
		const opt = {
			/* #menu-noload waits 19 s for the core.js watchdog and the other menu
			   scenarios wait out the 8 s source deadlines — that is virtual time,
			   not wall clock. Framed runs pay for the parent's poll loop too. */
			budget: base === '#menu-noload' ? 34000
				: (/^#menu-/.test(base) ? 24000 : (narrow ? 17000 : 13000)),
			width: forcedWidth || (narrow ? (Number(process.env.LUCENT_PHONE_WIDTH) || 390) : (laptop ? 1100 : 1500)),
			height: narrow ? (phoneTall ? 2600 : 844) : (tall ? 2700 : (graph ? 1400 : 900))
		};

		/* Phone scenarios are loaded inside a frame of exact CSS pixels: the
		   window itself cannot be made that narrow, so this is the only way the
		   page sees a real 390px viewport. --width frames everything. */
		const framed = narrow || forcedWidth;
		let url;

		if (framed) {
			url = 'http://127.0.0.1:' + port + '/tests/frame.html?w=' + opt.width +
				'&h=' + opt.height + '&src=' + encodeURIComponent('/tests/harness.html' + base);
			/* the outer window only has to be wide enough not to be clamped */
			opt.width += 90;
			opt.height += 40;
		}
		else {
			url = 'http://127.0.0.1:' + port + '/tests/harness.html' + base;
		}

		if (wantShot) {
			/* --screenshot and --dump-dom cannot share one run */
			opt.shot = path.join(shots, 'shot-' + flag.slice(1) + '.png');
			await drive(url, opt, tmp);
			delete opt.shot;
		}

		await drive(url, opt, tmp);

		const dom = fs.readFileSync(tmp, 'utf8');
		const lines = report(dom);

		if (!lines) {
			console.log('%s  NO REPORT — dom starts: %s', flag.padEnd(15), JSON.stringify(dom.slice(0, 120)));
			bad++;
			continue;
		}

		/* an empty report is not a clean one: the runner printing "0 failed"
		   over a page that never reported anything is how a broken scenario
		   looks like a passing one */
		if (!lines.length) {
			console.log('%s  EMPTY REPORT — page produced no assertions', flag.padEnd(15));
			bad++;
			continue;
		}

		const fails = lines.filter(l => !/^PASS/.test(l));

		console.log('%s  %d checks, %d failed', flag.padEnd(15), lines.length, fails.length);
		/* LUCENT_VERBOSE prints the PASS lines too, so a scenario that quietly
		   lost assertions looks different from one that passed them */
		(process.env.LUCENT_VERBOSE ? lines : fails).forEach(l => console.log('    ' + l));
		bad += fails.length;
	}

	server.close();
	console.log(bad ? '\nFAILED: %d assertion(s)' : '\nall scenarios clean', bad);
	process.exit(bad ? 1 : 0);
}

server.listen(0, '127.0.0.1', () => run(server.address().port));
