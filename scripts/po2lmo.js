#!/usr/bin/env node
'use strict';
/*
 * po2lmo — compile a gettext .po catalog into the binary .lmo format used by
 * LuCI (modules/luci-base/src/template_lmo.*), reproducing upstream po2lmo.c:
 *   - string extraction unescapes \" and \\ but leaves other escape sequences
 *     (e.g. \n) as the two literal characters they are in the po file;
 *   - the Plural-Forms header line is stored as the entry with key id 0;
 *   - every value block is padded with NUL bytes to a multiple of 4;
 *   - the index is a key_id-sorted array of BE uint32 {key_id, val_id,
 *     offset, length}, followed by one trailing uint32 holding the data size.
 *
 * usage:
 *   node scripts/po2lmo.js <in.po> <out.lmo>
 *   node scripts/po2lmo.js --dump <in.lmo>
 *   node scripts/po2lmo.js --lookup <in.lmo> <msgid>
 */

const fs = require('fs');

function sfhHash(buf) {
	if (!buf.length)
		return 0;

	let hash = buf.length >>> 0, tmp;
	let rem = buf.length & 3, len = buf.length >> 2, p = 0;
	const get16 = (i) => (buf[i] | (buf[i + 1] << 8)) >>> 0;
	const s8 = (i) => ((buf[i] << 24) >> 24) | 0;

	while (len-- > 0) {
		hash = (hash + get16(p)) >>> 0;
		tmp = ((get16(p + 2) << 11) >>> 0) ^ hash;
		hash = (((hash << 16) >>> 0) ^ tmp) >>> 0;
		p += 4;
		hash = (hash + (hash >>> 11)) >>> 0;
	}

	if (rem === 3) {
		hash = (hash + get16(p)) >>> 0;
		hash = (hash ^ ((hash << 16) >>> 0)) >>> 0;
		hash = (hash ^ ((s8(p + 2) << 18) >>> 0)) >>> 0;
		hash = (hash + (hash >>> 11)) >>> 0;
	}
	else if (rem === 2) {
		hash = (hash + get16(p)) >>> 0;
		hash = (hash ^ ((hash << 11) >>> 0)) >>> 0;
		hash = (hash + (hash >>> 17)) >>> 0;
	}
	else if (rem === 1) {
		hash = (hash + s8(p)) >>> 0;
		hash = (hash ^ ((hash << 10) >>> 0)) >>> 0;
		hash = (hash + (hash >>> 1)) >>> 0;
	}

	hash = (hash ^ ((hash << 3) >>> 0)) >>> 0;
	hash = (hash + (hash >>> 5)) >>> 0;
	hash = (hash ^ ((hash << 4) >>> 0)) >>> 0;
	hash = (hash + (hash >>> 17)) >>> 0;
	hash = (hash ^ ((hash << 25) >>> 0)) >>> 0;
	hash = (hash + (hash >>> 6)) >>> 0;

	return hash >>> 0;
}

function unquote(line) {
	const m = /"((?:[^"\\]|\\.)*)"/.exec(line);
	if (m === null)
		return null;
	return m[1].replace(/\\(["\\])/g, '$1');
}

function parsePo(text) {
	const entries = [];
	let cur = null, field = null;

	function flush() {
		if (cur && cur.val != null && (cur.id != null))
			entries.push({ id: cur.id, val: cur.val });
		cur = null;
		field = null;
	}

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/\r$/, '');
		const s = line.trim();

		if (s.startsWith('#') || s === '')
			continue;

		let m;
		if ((m = /^msgid_plural\s+"/.exec(s))) {
			/* not supported: this catalog has no plural entries */
			throw new Error('msgid_plural found; po2lmo.js needs plural support');
		}
		else if ((m = /^msgid\s+"(.*)$/.exec(s)) || /^msgid\s*$/.test(s)) {
			if (cur && cur.val != null)
				flush();
			cur = { id: /^msgid\s*$/.test(s) ? '' : unquote(s), val: null };
			field = 'id';
		}
		else if ((m = /^msgstr\s+"(.*)$/.exec(s)) || /^msgstr\s*$/.test(s)) {
			if (!cur)
				throw new Error('msgstr without msgid');
			cur.val = /^msgstr\s*$/.test(s) ? '' : unquote(s);
			field = 'val';
		}
		else if (s.startsWith('"')) {
			const part = unquote(s);
			if (cur && field && cur[field] != null && part !== null)
				cur[field] += part;
		}
	}

	flush();
	return entries;
}

function compile(entries) {
	const blocks = [];
	const index = [];
	let offset = 0;

	function addBlock(buf, keyId, valId) {
		blocks.push(buf);
		index.push({ key_id: keyId, val_id: valId, offset, length: buf.length });
		offset += buf.length + ((4 - (buf.length % 4)) % 4);
		const pad = (4 - (buf.length % 4)) % 4;
		if (pad)
			blocks.push(Buffer.alloc(pad));
	}

	for (const e of entries) {
		if (e.id === '') {
			for (const part of e.val.split('\\n')) {
				if (part.toLowerCase().startsWith('plural-forms: ')) {
					addBlock(Buffer.from(part.slice(14), 'utf8'), 0, 0);
					break;
				}
			}
			continue;
		}

		if (!e.val || !e.id)
			continue;

		const keyBuf = Buffer.from(e.id, 'utf8');
		const valBuf = Buffer.from(e.val, 'utf8');
		const keyId = sfhHash(keyBuf);
		if (keyId === sfhHash(valBuf))
			continue;
		addBlock(valBuf, keyId, 1);
	}

	index.sort((a, b) => a.key_id - b.key_id);

	const out = [];
	for (const blk of blocks)
		out.push(blk);
	for (const ent of index) {
		const rec = Buffer.alloc(16);
		rec.writeUInt32BE(ent.key_id, 0);
		rec.writeUInt32BE(ent.val_id, 4);
		rec.writeUInt32BE(ent.offset, 8);
		rec.writeUInt32BE(ent.length, 12);
		out.push(rec);
	}
	const tail = Buffer.alloc(4);
	tail.writeUInt32BE(offset, 0);
	out.push(tail);

	return Buffer.concat(out);
}

function decode(file) {
	const buf = fs.readFileSync(file);
	const dataLen = buf.readUInt32BE(buf.length - 4);
	const n = (buf.length - dataLen - 4) / 16;
	const map = new Map();
	for (let i = 0; i < n; i++) {
		const rec = dataLen + i * 16;
		const keyId = buf.readUInt32BE(rec);
		const off = buf.readUInt32BE(rec + 8);
		const len = buf.readUInt32BE(rec + 12);
		map.set(keyId, buf.subarray(off, off + len).toString('utf8'));
	}
	return { map, count: n };
}

const args = process.argv.slice(2);

if (args[0] === '--dump') {
	const { map } = decode(args[1]);
	for (const [k, v] of map)
		console.log(k.toString(16).padStart(8, '0'), JSON.stringify(v));
}
else if (args[0] === '--lookup') {
	const { map } = decode(args[1]);
	console.log(map.get(sfhHash(Buffer.from(args[2], 'utf8'))));
}
else if (args.length === 2) {
	fs.writeFileSync(args[1], compile(parsePo(fs.readFileSync(args[0], 'utf8'))));
	console.log('wrote ' + args[1]);
}
else {
	console.error('usage: po2lmo.js <in.po> <out.lmo> | --dump <lmo> | --lookup <lmo> <msgid>');
	process.exit(1);
}
