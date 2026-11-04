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

const ALL = ['#base', '#menu-reject', '#menu-empty', '#menu-noclass', '#menu-throw',
	'#menu-noload', '#menu-nomatch', '#menu-hang', '#menu-cache', '#menu-nostore', '#manyports',
	'#tree-noisy', '#rail', '#drawer'];

const wantShot = process.argv.includes('--shot');
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
	const args = [
		'--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
		'--user-data-dir=' + profile, '--virtual-time-budget=' + opt.budget,
		'--window-size=' + opt.width + ',' + opt.height,
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
		const base = flag === '#base' ? '' : flag;
		const narrow = base === '#drawer';
		const opt = {
			/* #menu-noload waits 19 s for the core.js watchdog and the other menu
			   scenarios wait out the 8 s source deadlines — that is virtual time,
			   not wall clock */
			budget: base === '#menu-noload' ? 34000 : (/^#menu-/.test(base) ? 24000 : 13000),
			width: narrow ? 390 : 1500,
			height: narrow ? 844 : 900
		};

		const url = 'http://127.0.0.1:' + port + '/tests/harness.html' + base;

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

		const fails = lines.filter(l => !/^PASS/.test(l));

		console.log('%s  %d checks, %d failed', flag.padEnd(15), lines.length, fails.length);
		fails.forEach(l => console.log('    ' + l));
		bad += fails.length;
	}

	server.close();
	console.log(bad ? '\nFAILED: %d assertion(s)' : '\nall scenarios clean', bad);
	process.exit(bad ? 1 : 0);
}

server.listen(0, '127.0.0.1', () => run(server.address().port));
