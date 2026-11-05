/* One-off: list every _() string used by the theme that po/zh_Hans/lucent.po
   does not translate yet. Run with: node tests/po-gap.js */
const fs = require('fs');
const path = require('path');

const srcFiles = [];
(function walk(dir) {
	fs.readdirSync(dir).forEach(function (n) {
		const p = path.join(dir, n);
		const st = fs.statSync(p);
		if (st.isDirectory())
			return walk(p);
		if (/\.(js|ut|lua|ucode)$/.test(n))
			srcFiles.push(p);
	});
})('htdocs');
srcFiles.push('root/usr/libexec/rpcd/luci.lucent');

const used = new Set();
srcFiles.forEach(function (f) {
	const s = fs.readFileSync(f, 'utf8');
	/* _("...") with no newline inside, single or double quotes */
	/_\(\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?:\s*\+\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))*)\s*\)/g
		.lastIndex = 0;
	let m;
	const re = /_\(\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?:\s*\+\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))*)\s*\)/g;
	while ((m = re.exec(s))) {
		const parts = m[1].split(/\s*\+\s*/).map(function (x) { return x.slice(1, -1); });
		parts.forEach(function (p) {
			p = p.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
			if (p.trim() && !/^\s*$/.test(p) && !/^[\d.]+$/.test(p))
				/* the po file stores the msgid the way gettext writes it: double
				   quoted with the inner double quotes escaped */
				used.add(JSON.stringify(p).slice(1, -1));
		});
	}
});

const po = fs.readFileSync('po/zh_Hans/lucent.po', 'utf8');
const have = new Set();
const untranslated = new Set();
const re = /^msgid "((?:[^"\\]|\\.)*)"$\nmsgstr "((?:[^"\\]|\\.)*)"/gm;
let m;
while ((m = re.exec(po))) {
	if (m[2])
		have.add(m[1]);
	else
		untranslated.add(m[1]);
}

const missing = [...used].filter(function (s) { return !have.has(s); }).sort();

console.log('used %d, translated %d, to add %d', used.size, have.size, missing.length);
missing.forEach(function (s) { console.log(s); });
