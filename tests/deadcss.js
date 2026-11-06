/* Report the rules in theme.css whose class the theme never emits.
   Styles that outlive the markup that used them are the reason "mobile
   adaptation" can look configured and do nothing: the phone media queries
   were full of rules for a tree and a path card that no longer exist.
   Report only — deleting is a human decision, because a class can also be
   spelled by concatenation, which this cannot see.
   usage: node tests/deadcss.js  */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'htdocs/luci-static/lucent/theme.css');

/* every file the theme ships that can put a class on an element */
const SOURCES = [];

(function walk(dir) {
	fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
		const p = path.join(dir, e.name);

		if (e.isDirectory()) {
			if (!/(node_modules|\.git|shots)/.test(e.name))
				walk(p);
		}
		else if (/\.(js|html|ut|lua|tpl)$/.test(e.name))
			SOURCES.push(p);
	});
})(path.join(ROOT, 'htdocs'));

['ucode', 'root'].forEach(function (dir) {
	const abs = path.join(ROOT, dir);

	if (fs.existsSync(abs))
		(function walk(d) {
			fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
				const p = path.join(d, e.name);

				if (e.isDirectory())
					walk(p);
				else if (/\.(ut|lua|tpl|html)$/.test(e.name))
					SOURCES.push(p);
			});
		})(abs);
});

SOURCES.push(path.join(ROOT, 'tests/harness.html'));

/* every ltc-* name the sources mention, as a whole token */
const emitted = new Set();

SOURCES.forEach(function (f) {
	fs.readFileSync(f, 'utf8').replace(/\bltc-[a-z0-9_-]+/g, function (m) {
		emitted.add(m);
		return m;
	});
});

function used(name) {
	return emitted.has(name);
}

const lines = fs.readFileSync(CSS, 'utf8').split(/\r?\n/);
const dead = [];

lines.forEach(function (line, i) {
	const t = line.trim();
	const brace = t.indexOf('{');

	if (brace <= 0 || t.indexOf('@') === 0)
		return;

	const selPart = t.slice(0, brace);

	if (selPart.indexOf(';') >= 0 || selPart.indexOf(':') >= 0)
		return;

	const names = selPart.split(',').map(function (s) {
		var m = /\.(ltc-[a-z0-9_-]+)/.exec(s.trim());
		return m && m[1];
	}).filter(Boolean);

	if (!names.length)
		return;

	/* a rule is dead only when every selector it offers names a class the
	   theme never writes */
	if (names.every(function (n) { return !used(n); }))
		dead.push((i + 1) + '  ' + selPart.trim().slice(0, 70) + '   [' + names.join(' ') + ']');
});

console.log('theme.css rules whose class is never emitted: ' + dead.length);
dead.forEach(function (d) { console.log('    ' + d); });
