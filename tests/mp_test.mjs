// A multiplayer szerver próbája három szimulált játékossal, helyben futó Workeren.
// Indítás (két terminálban):
//   npx wrangler dev --var MP_FAST:1 --var MP_DEV:1      (MP_FAST: minden időzítés a tizenötödére rövidül)
//   node tests/mp_test.mjs [http://127.0.0.1:8787]
// A motort a build/engine.js-ből veszi (a wrangler dev legenerálja): a kliens ugyanazokkal a függvényekkel
// dönt, amelyeket a felület is használ, így az is kiderül, hogy a szerver nézete használható-e a motorral.
import * as E from '../build/engine.js';
import http from 'node:http';

const BASE = process.argv[2] || 'http://127.0.0.1:8787', WSB = BASE.replace(/^http/, 'ws');
const R = {};
const ok = (name, cond, info = '') => { const r = (R[name] ??= { ok: 0, bad: 0, ex: [] }); if (cond) r.ok++; else { r.bad++; if (r.ex.length < 2) r.ex.push(info); } };
const sleep = ms => new Promise(f => setTimeout(f, ms));
const until = async (cond, ms, what) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('Időtúllépés: ' + what); await sleep(25); } };

class Player {
  constructor(name) { this.name = name; this.auto = true; this.errors = []; this.state = null; this.done = new Set(); this.emotes = []; this.nState = 0; }
  open(path) {
    this.ws = new WebSocket(WSB + path, { headers: { Origin: BASE } });
    this.ws.onmessage = e => this.onMsg(JSON.parse(e.data));
    this.ws.onclose = e => { if (e.code >= 4000 && e.code !== 4001 && e.code !== 4002) this.errors.push({ t: 'error', msg: 'kapcsolat bontva: ' + e.code + ' ' + e.reason }); };
    return new Promise(res => { this.ready = res; });
  }
  join(code) { return this.open(`/ws/room/${code}?name=${encodeURIComponent(this.name)}${this.token ? '&token=' + this.token : ''}`); }
  send(m) { this.ws.send(JSON.stringify(m)); }
  onMsg(m) {
    if (m.t === 'welcome') { this.token = m.token; this.code = m.code; }
    if (m.t === 'error') { this.errors.push(m); if (m.fatal) this.ready(m); }
    if (m.t === 'emote') this.emotes.push(m);
    if (m.t !== 'state') return;
    this.nState++; this.state = m; this.ready(m);
    this.check(m);
    if (this.auto) this.play(m);
  }
  // Rejtett információ: más lapja, a talon és a botok terve nem látszhat a leosztás vége előtt.
  check(m) {
    const G = m.G;
    ok('saját ülés a 0.', m.players[0] && m.players[0].name.startsWith(this.name), JSON.stringify(m.players));
    if (!G) return;
    ok('nincs botterv, eredeti osztás és felmutathatóság a nézetben', !('collect' in G) && !('deal' in G) && !('claimAt' in G));
    if (G.phase === 'result' && this.claimed === m.deals && !this.done.has('cl' + m.deals)) {
      this.done.add('cl' + m.deals);
      ok('felmutatás után vége a leosztásnak (jó vagy hibás)', !!G.claimShow !== !!G.result.badClaim, JSON.stringify(G.result));
      if (G.result.badClaim) ok('hibás felmutatás: a felvevő veszít', G.result.badClaim === 'decl' || G.result.badClaim === 'betli' ? G.result.change[0] < 0 : false, JSON.stringify(G.result));
    }
    if (G.phase !== 'result') {
      for (const q of [1, 2]) if (!(G.revealed && G.decl === q)) ok('mások lapja rejtve', G.hands[q].every(x => x === null), this.name + ' ' + q);
      ok('a saját lap látszik', G.hands[0].every(x => x && Number.isInteger(x.id)));
      if (G.talonBy !== 0) ok('a talon rejtve, ha nem te tetted le', G.talon.every(x => x === null) && !('talonPts' in G));
      // ütés elején a gép felmutathat (gépi felvevő vagy két gépi védő): ilyenkor a szerver nem ad határidőt, hanem a felmutatásra vár
      const bc = q => m.players[q].bot || !m.players[q].online || m.players[q].away;
      const botClaim = G.phase === 'play' && !G.trick.length && (bc(G.decl) || [0, 1, 2].filter(q => q !== G.decl).every(bc));
      if (G.turn === 0 && ['bid', 'trump', 'kontra', 'play'].includes(G.phase) && !(G.phase === 'play' && G.trick.length === 3) && m.players[0].online && !m.players[0].away && !botClaim)
        ok('lépési határidő a soron lévő játékosnak', typeof m.deadline === 'number', JSON.stringify([G.phase, G.decl, G.trickNo, G.trick.length, m.players.map(x => x.bot)]));
    }
  }
  // Egyszerű, de mindig szabályos játék a motor saját függvényeivel.
  play(m) {
    const G = m.G;
    if (!G || m.status !== 'playing') return;
    if (G.phase === 'result') { if (!m.ready[0] && !this.done.has('next' + m.deals)) { this.done.add('next' + m.deals); this.send({ t: 'next' }); } return; }
    if (G.turn !== 0) return;
    const key = [G.phase, G.trickNo, G.trick.length, G.passes, G.kidx, G.hands[0].length, G.bid && G.bid.ci].join(':');
    if (this.done.has(key)) return;
    this.done.add(key);
    E.setG(G);
    // felmutatás saját döntésre (a nézetben nincs jel, hogy biztos-e): felvevőként a 6. ütés elején
    if (G.phase === 'play' && !G.trick.length && G.decl === 0 && G.trickNo === 5) { this.claimed = m.deals + 1; return this.send({ t: 'claim' }); }
    if (G.phase === 'bid') {
      if (!E.holding12(0)) return this.send({ t: E.canPickUp(0) && Math.random() < 0.15 ? 'pickup' : 'pass' });
      const h = G.hands[0];
      for (let ci = E.minBidIndex(); ci < E.CONTRACTS.length; ci++) {
        const c = E.CONTRACTS[ci], suit = !E.isTrumpC(c) ? -1 : c.red ? 0 : -2;
        for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++)
          if (!E.validateBid(0, [h[i], h[j]], ci, suit)) return this.send({ t: 'bid', ci, disc: [h[i].id, h[j].id] });
      }
    }
    if (G.phase === 'trump') return this.send({ t: 'trump', s: [1, 2, 3].find(s => !E.checkReq(G.hands[0], G.bid.ci, s)) });
    if (G.phase === 'kontra') return this.send({ t: 'kontra', keys: [] });
    if (G.phase === 'play' && G.trick.length < 3) return this.send({ t: 'play', id: E.legalCards(0)[0].id });
  }
}

const rawStatus = origin => new Promise(res => {
  const req = http.request(BASE + '/ws/new', { headers: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: origin, 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
  req.on('response', r => res(r.statusCode)); req.on('upgrade', () => res(101)); req.on('error', () => res(0)); req.end();
});

try {
  ok('idegen webhelyről nem lehet csatlakozni', (await rawStatus('https://gonosz.example')) === 403);

  const A = new Player('Anna'), B = new Player('Béla'), C = new Player('Cili');
  globalThis.PL = [A, B, C];
  await A.open('/ws/new?name=Anna');
  ok('szoba létrejön, kóddal', /^[A-HJ-NP-Z2-9]{6}$/.test(A.code || ''), A.code);
  await B.join(A.code); await C.join(A.code);
  const D = new Player('Dani'); await D.join(A.code);
  ok('a negyedik nem fér be', D.errors.some(e => e.fatal && /megtelt/.test(e.msg)));
  ok('vendég nem indíthat', await (async () => { B.send({ t: 'start' }); await sleep(150); return B.errors.some(e => /házigazda/.test(e.msg)); })());

  // emót (a váróban is): mindenki megkapja a küldő helyével a saját szemszögéből; nem jár állapotküldéssel; a spamet a szerver eldobja
  const nameOf = (p, e) => (p.state.players[e.from] || {}).name || '';
  const ns = B.nState;
  A.send({ t: 'emote', id: 'szep' }); A.send({ t: 'emote', id: 'jaj' });
  await until(() => [A, B, C].every(p => p.emotes.length), 2000, 'emót érkezése').catch(() => {});
  await sleep(100);
  ok('az emót mindenkihez megérkezik, a küldő helyével', [A, B, C].every(p => p.emotes.length === 1 && p.emotes[0].id === 'szep' && nameOf(p, p.emotes[0]) === 'Anna'), JSON.stringify([A, B, C].map(p => p.emotes)));
  ok('túl gyors második emót eldobva', B.emotes.length === 1);
  ok('az emót nem küld állapotot (nem ment semmit)', B.nState === ns);
  C.send({ t: 'emote', id: 'hu' });
  await until(() => B.emotes.length === 2, 2000, 'Cili emótja').catch(() => {});
  ok('más játékos emótját nem fogja a korlát', B.emotes[1] && B.emotes[1].id === 'hu' && nameOf(B, B.emotes[1]) === 'Cili', JSON.stringify(B.emotes));
  for (let i = 0; i < 5; i++) { await sleep(250); A.send({ t: 'emote', id: 'taps' }); }
  await sleep(200);
  ok('30 s (itt 2 s) alatt legfeljebb 5 emót', B.emotes.filter(e => nameOf(B, e) === 'Anna').length === 5, JSON.stringify(B.emotes));
  A.send({ t: 'emote', id: '<b>csúnya szó</b>' });
  await until(() => A.errors.some(e => /emót/.test(e.msg)), 2000, 'hibás emót').catch(() => {});
  ok('ismeretlen formájú emót elutasítva', A.errors.some(e => /Ismeretlen emót/.test(e.msg)) && B.emotes.length === 6);

  A.send({ t: 'start' });
  await until(() => A.state && A.state.G, 3000, 'indulás');
  // nem soron lévő játékos lépése: hiba, az állapot nem változik
  // akinél a soron lévő a következő ülés (1.), annak még két lépést kell várnia: így nem jön sorra, mire az üzenete odaér
  const idle = [A, B, C].find(p => p.state.G.turn === 1 && p.state.G.hands[0].length) || [A, B, C].find(p => p.state.G.turn !== 0 && p.state.G.hands[0].length);
  idle.auto = false;
  const before = JSON.stringify(idle.state.G.hands[0]);
  idle.errors = [];
  idle.send({ t: 'play', id: idle.state.G.hands[0][0].id });
  await until(() => idle.errors.length, 3000, 'hibaüzenet').catch(() => {});
  ok('nem soron lévő lépés elutasítva', idle.errors.some(e => /nem te/.test(e.msg)), JSON.stringify(idle.errors));
  ok('elutasított lépés után a lapok változatlanok', JSON.stringify(idle.state.G.hands[0]) === before);
  idle.auto = true; idle.play(idle.state);

  await until(() => A.state.deals >= 1, 120e3, 'első leosztás vége');
  ok('pontok kiegyenlítődnek', A.state.players.reduce((s, p) => s + p.score, 0) === 0, JSON.stringify(A.state.players));
  ok('mindenki ugyanazt az eredményt látja', [B, C].every(p => p.state.players.reduce((s, x) => s + x.score, 0) === 0));

  // kiesés és visszatérés: közben a gép játszik a helyén
  await until(() => B.state.G && B.state.G.phase !== 'result', 30e3, 'második leosztás');
  B.ws.close();
  await until(() => A.state.players.some(p => p && p.name === 'Béla' && !p.online), 3000, 'kiesés látszik');
  ok('a kiesés a többieknél látszik', true);
  const deals0 = A.state.deals;
  await until(() => A.state.deals > deals0 || (A.state.G && A.state.G.phase === 'play' && A.state.G.trickNo >= 2), 60e3, 'a játék megy tovább Béla nélkül');
  ok('Béla nélkül is megy a játék (gép lép helyette)', true);
  const tok = B.token;
  await B.join(A.code);
  ok('visszacsatlakozás ugyanarra a helyre', B.token === tok && B.state.players[0].name === 'Béla');
  await until(() => A.state.players.every(p => p.online), 3000, 'visszatérés látszik');
  ok('a visszatérés a többieknél látszik', true);

  // lejárt idő: Cili nem lép, a gép lép helyette, Cili a helyén marad
  C.auto = false;
  await until(() => C.state.G && C.state.G.turn === 0 && ['bid', 'kontra', 'play'].includes(C.state.G.phase) && !(C.state.G.phase === 'play' && C.state.G.trick.length === 3), 60e3, 'Cili köre');
  const snap = JSON.stringify([C.state.G.phase, C.state.G.trickNo, C.state.G.trick.length, C.state.G.passes, C.state.G.kidx]);
  await until(() => JSON.stringify([C.state.G.phase, C.state.G.trickNo, C.state.G.trick.length, C.state.G.passes, C.state.G.kidx]) !== snap, 10e3, 'lépés Cili helyett');
  ok('lejárt időnél a gép lép', true);
  ok('lejárt idő után a játékos a helyén marad', C.state.players[0].name === 'Cili' && !C.state.players[0].bot);
  C.auto = true; C.play(C.state);

  const late = new Player('Ede'); await late.join(A.code);
  ok('indulás után új játékos nem léphet be', late.errors.some(e => e.fatal && /elindult/.test(e.msg)));

  await until(() => A.state.deals >= 4, 240e3, 'négy leosztás');
  ok('négy leosztás után is kiegyenlített a pontszám', A.state.players.reduce((s, p) => s + p.score, 0) === 0);
  ok('nincs váratlan hiba a lépéseknél', [A, B, C].every(p => !p.errors.some(e => !/nem te|házigazda|Még tart|Ismeretlen emót/.test(e.msg))), JSON.stringify([A, B, C].flatMap(p => p.errors)));
  for (const p of [A, B, C, D, late]) p.ws.close();

  // egyedül indított szoba: két bot tölti fel; aki nem jön vissza időben, annak helyén a gép marad; az üres szoba bezárul
  const H = new Player('Hugó'), G2 = new Player('Gabi');
  globalThis.PL = [H, G2];
  await H.open('/ws/new?name=Hugó');
  await G2.join(H.code);
  H.send({ t: 'start' });
  await until(() => H.state.G, 3000, 'indulás botokkal');
  ok('üres helyre bot ül', H.state.players.filter(p => p.bot).length === 1 && H.state.players.some(p => /Gellért \(gép\)/.test(p.name)), JSON.stringify(H.state.players));
  await until(() => H.state.deals >= 2, 120e3, 'két leosztás botokkal');
  ok('botokkal is végigmegy a játék', H.state.players.reduce((s, p) => s + p.score, 0) === 0);
  const gTok = G2.token;
  G2.ws.close();
  await until(() => H.state.players.some(p => p.name === 'Gabi (gép)' && p.bot), 30e3, 'Gabi helyére gép ül');
  ok('3 perc (itt 12 s) után a kiesett helyére végleg gép ül', true);
  G2.token = gTok; G2.errors = [];
  await G2.join(H.code);
  ok('a lejárt helyre a régi tokennel sem lehet visszaülni', G2.errors.some(e => e.fatal));
  const code2 = H.code;
  H.ws.close();
  await sleep(14e3);
  const X = new Player('Xénia');
  await X.join(code2);
  ok('az üres szoba bezárul', X.errors.some(e => e.fatal && /Nincs ilyen/.test(e.msg)), JSON.stringify(X.errors));
} catch (e) {
  ok('a próba végigfutott', false, e.message);
  for (const p of globalThis.PL || []) { const m = p.state, G = m && m.G; console.log('DIAG', p.name, JSON.stringify({ st: m && m.status, G: G && [G.phase, G.turn, G.trickNo, G.trick.length, G.kidx, G.passes, G.hands[0].length], dl: m && m.deadline && m.deadline - Date.now(), pl: m && m.players.map(x => x && [x.name, x.online, x.away]), err: p.errors.slice(-3) })); }
}

let bad = 0;
for (const [k, r] of Object.entries(R)) { bad += r.bad; console.log(`${r.bad ? 'HIBA' : 'OK  '} ${k.padEnd(52)} ${r.ok} jó, ${r.bad} rossz${r.bad ? '  ' + r.ex.join(' | ') : ''}`); }
process.exit(bad ? 1 : 0);
