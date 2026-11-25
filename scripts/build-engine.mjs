// Kivágja a játékmotort az ulti.html-ből ES-modulnak a Worker számára (ugyanúgy, mint a tests/run_audit.py).
// A Worker telepítésekor fut (wrangler.jsonc: build.command), így a szerver mindig a repó aktuális motorjával játszik.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const s = readFileSync(new URL('../ulti.html', import.meta.url), 'utf8');
const a = s.indexOf('// ===== ENGINE START'), b = s.indexOf('// ===== ENGINE END');
if (a < 0 || b < a) throw new Error('Az ulti.html-ből hiányzik az ENGINE START / ENGINE END jelölő.');

mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
writeFileSync(new URL('../build/engine.js', import.meta.url), s.slice(a, b) + `
export { newDeal, botBidAction, doBid, doPass, doPickUp, doConcede };
// A motor egyetlen közös állapottal (G) dolgozik; a szerver asztalonként ezt cseréli be és ki.
export const getG = () => G, setG = x => { G = x; };
`);
