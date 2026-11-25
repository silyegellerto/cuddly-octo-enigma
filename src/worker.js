// Rablóulti multiplayer szerver: privát szoba vendégeknek. Az üzenetek leírása: docs/MULTIPLAYER.md
import { DurableObject } from 'cloudflare:workers';
import * as E from '../build/engine.js';

// A motor keverése Math.random-ot használ; a szerveren kriptográfiai véletlen ossza a lapot.
Math.random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

const ORIGIN = 'https://ulti.silyegellert.cc';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // nincs 0/O, 1/I: könnyű bediktálni
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
// Időzítések (ms). Helyi tesztnél (MP_FAST) mind a tizenötödére rövidül.
const T = { bid: 45e3, play: 30e3, reconnect: 180e3, empty: 180e3, next: 30e3, bot: 850, botForHuman: 2500, collect: 1000, claim: 900 };
const BOT_NAMES = ['Gellért', 'Samu'];
const MAX_MSG = 1024, RATE_N = 20, RATE_MS = 10e3;
const NOT_TURN = 'Most nem te következel.';

const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % 32]).join('');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const cleanName = n => String(n || '').replace(/[\u0000-\u001f\u007f<>&"']/g, '').trim().slice(0, 16) || 'Vendég';
// Gép játszik az ülésen: valódi bot, vagy kiesett / többször lejárt idejű játékos helyett.
const botCtl = s => s.bot || !s.online || s.away;

export class Table extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map();
    ctx.blockConcurrencyWhile(async () => { this.room = (await ctx.storage.get('room')) ?? null; });
  }

  t(k) { return this.env.MP_FAST ? Math.ceil(T[k] / 15) : T[k]; }

  // A motor egyetlen közös állapottal (G) dolgozik: a hívás idejére az asztalét tesszük be.
  withG(fn) {
    E.setG(this.room.G);
    E.NAME.splice(0, 3, ...this.room.seats.map(s => (s ? s.name : '')));
    try { return fn(E.getG()); } finally { this.room.G = E.getG(); }
  }

  async fetch(req) {
    const url = new URL(req.url), code = req.headers.get('X-Room');
    const [client, ws] = Object.values(new WebSocketPair());
    const fail = msg => { ws.accept(); ws.send(JSON.stringify({ t: 'error', fatal: true, msg })); ws.close(4001, 'refused'); return new Response(null, { status: 101, webSocket: client }); };
    let r = this.room;
    if (url.pathname === '/ws/new') {
      // shortcut: ütköző véletlen kód esetén nincs újrapróbálás (32^6 kódból), ha sok szoba lesz, a Worker próbáljon újat.
      if (r) return fail('Próbáld újra.');
      r = this.room = { code, status: 'lobby', seats: [null, null, null], score: [0, 0, 0], deals: 0, ready: [false, false, false], G: null, at: {}, turnKey: null, emptySince: null };
    } else if (!r) return fail('Nincs ilyen szoba.');
    const token = url.searchParams.get('token');
    let seat = token ? r.seats.findIndex(s => s && !s.bot && s.token === token) : -1;
    if (seat < 0) {
      if (r.status !== 'lobby') return fail('A játék már elindult ebben a szobában.');
      seat = r.seats.indexOf(null);
      if (seat < 0) return fail('A szoba megtelt.');
      let name = cleanName(url.searchParams.get('name'));
      while (r.seats.some(s => s && s.name === name)) name = name.slice(0, 14) + (seat + 1);
      r.seats[seat] = { name, token: randomToken(), bot: false, online: true, away: false, misses: 0, droppedAt: null };
    } else {
      for (const old of this.ctx.getWebSockets(String(seat))) old.close(4002, 'Másik kapcsolat vette át.');
    }
    const s = r.seats[seat];
    Object.assign(s, { online: true, away: false, misses: 0, droppedAt: null });
    this.ctx.acceptWebSocket(ws, [String(seat)]);
    ws.serializeAttachment({ seat, token: s.token });
    ws.send(JSON.stringify({ t: 'welcome', code: r.code, token: s.token }));
    await this.commit();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const { seat, token } = ws.deserializeAttachment() || {};
    const r = this.room, s = r && r.seats[seat];
    if (!s || s.bot || s.token !== token) return ws.close(4003, 'gone');
    const now = Date.now(), hits = (this.rate.get(ws) || []).filter(x => now - x < RATE_MS);
    hits.push(now); this.rate.set(ws, hits);
    if (hits.length > RATE_N * (this.env.MP_FAST ? 15 : 1) || typeof data !== 'string' || data.length > MAX_MSG) return ws.close(4008, 'Túl sok vagy túl nagy üzenet.');
    let m;
    try { m = JSON.parse(data); } catch { m = null; }
    const err = m && typeof m === 'object' ? this.act(seat, m) : 'Hibás üzenet.';
    if (err) ws.send(JSON.stringify({ t: 'error', msg: err }));
    s.misses = 0; s.away = false;
    await this.commit();
  }

  async webSocketClose(ws) { await this.dropped(ws); }
  async webSocketError(ws) { await this.dropped(ws); }

  async dropped(ws) {
    const { seat } = ws.deserializeAttachment() || {}, r = this.room, s = r && r.seats[seat];
    this.rate.delete(ws);
    if (!s || s.bot) return;
    if (this.ctx.getWebSockets(String(seat)).some(w => w !== ws && w.readyState === 1)) return;
    s.online = false; s.droppedAt = Date.now();
    await this.commit();
  }

  async alarm() {
    if (!this.room) return;
    this.tick();
    await this.commit();
  }

  // Egy játékos üzenete. Hibaszöveggel tér vissza, ha nem hajtható végre (ilyenkor az állapot nem változik).
  act(seat, m) {
    const r = this.room;
    if (m.t === 'start') {
      if (seat !== 0 || r.status !== 'lobby') return 'Csak a házigazda indíthatja, egyszer.';
      let b = 0;
      for (let i = 0; i < 3; i++) if (!r.seats[i]) r.seats[i] = { name: BOT_NAMES[b++] + ' (gép)', bot: true, token: null, online: true, away: false };
      r.status = 'playing';
      this.deal(Math.floor(Math.random() * 3));
      return null;
    }
    if (m.t === 'next') {
      if (r.status !== 'playing' || !r.G || r.G.phase !== 'result') return 'Még tart a leosztás.';
      r.ready[seat] = true;
      if (r.seats.every((x, i) => r.ready[i] || botCtl(x))) this.deal(E.nxt(r.G.dealer));
      return null;
    }
    if (r.status !== 'playing') return 'A játék még nem indult.';
    return this.withG(G => this.move(G, seat, m));
  }

  move(G, p, m) {
    switch (m.t) {
      case 'bid': {
        if (G.phase !== 'bid' || G.turn !== p || !E.holding12(p)) return NOT_TURN;
        const ids = Array.isArray(m.disc) ? m.disc : [];
        if (ids.length !== 2 || ids[0] === ids[1]) return 'Jelölj ki pontosan 2 lapot a talonba.';
        const disc = ids.map(id => G.hands[p].find(x => x.id === id));
        if (disc.some(x => !x)) return 'Ez a lap nincs nálad.';
        const c = Number.isInteger(m.ci) ? E.CONTRACTS[m.ci] : null;
        if (!c) return 'Válassz játékot.';
        const suit = !E.isTrumpC(c) ? -1 : c.red ? 0 : -2; // nem piros adus játéknál az adut a licit végén kell bemondani
        const e = E.validateBid(p, disc, m.ci, suit);
        if (e) return e;
        E.doBid(p, disc, m.ci, suit);
        return null;
      }
      case 'pickup':
        if (!E.canPickUp(p)) return NOT_TURN;
        E.doPickUp(p);
        return null;
      case 'pass':
        if (G.phase !== 'bid' || G.turn !== p || E.holding12(p) || !G.bid) return NOT_TURN;
        E.doPass(p);
        return null;
      case 'concede': {
        const ok = (G.phase === 'bid' && G.turn === p && !E.holding12(p) && G.bid && G.bid.seat === p) ||
          (G.phase === 'trump' && G.turn === p) || (G.phase === 'play' && G.decl === p);
        if (!ok) return 'Most nem dobhatod be.';
        E.doConcede(p);
        return null;
      }
      case 'trump':
        if (G.phase !== 'trump' || G.turn !== p) return NOT_TURN;
        if (![1, 2, 3].includes(m.s) || E.checkReq(G.hands[p], G.bid.ci, m.s)) return 'Ezt az adut nem választhatod.';
        E.pickTrump(m.s);
        return null;
      case 'kontra': {
        if (G.phase !== 'kontra' || G.turn !== p) return NOT_TURN;
        const opts = E.kontraOptions(p), keys = Array.isArray(m.keys) ? m.keys : [];
        if (keys.some(k => !opts.some(o => o.k === k))) return 'Erre most nem mondhatsz kontrát.';
        E.doKontra(p, opts.filter(o => keys.includes(o.k)));
        return null;
      }
      case 'play': {
        if (G.phase !== 'play' || G.turn !== p || G.trick.length >= 3) return NOT_TURN;
        const card = E.legalCards(p).find(x => x.id === m.id);
        if (!card) return 'Ezt a lapot most nem teheted.';
        E.playCard(p, card);
        return null;
      }
      case 'claim': {
        const side = G.phase === 'play' && !G.trick.length && G.claimAt && G.claimAt.n === G.trickNo && G.claimAt.side;
        if (!side || !E.claimers(side).includes(p)) return 'Most nem mutathatsz fel.';
        E.resolveClaim(side);
        return null;
      }
    }
    return 'Ismeretlen lépés.';
  }

  // A gép lép a soron következő ülés helyett (bot, kiesett vagy lejárt idejű játékos).
  botMove(G) {
    const p = G.turn;
    if (G.phase === 'bid') {
      const a = E.botBidAction(p);
      if (a.type === 'bid') E.doBid(p, a.disc, a.ci, a.suit);
      else if (a.type === 'pickup') E.doPickUp(p);
      else if (a.type === 'concede') E.doConcede(p);
      else E.doPass(p);
    } else if (G.phase === 'trump') {
      const best = E.chooseTrump(G.hands[p], G.talon, G.bid.ci)[0];
      E.pickTrump(best ? best.suit : [1, 2, 3].find(s => !E.checkReq(G.hands[p], G.bid.ci, s)));
    } else if (G.phase === 'kontra') E.doKontra(p, E.botKontra(p));
    else if (G.phase === 'play') E.playCard(p, E.botChoose(p));
  }

  deal(dealer) {
    const r = this.room;
    r.ready = [false, false, false];
    r.turnKey = null;
    r.at = {};
    this.withG(() => E.newDeal(dealer));
  }

  // Megnézi, mi következik, és beállítja az időzítőket (lépési idő, gépi lépés, ütés begyűjtése, következő osztás).
  drive() {
    const r = this.room, at = r.at, now = Date.now();
    if (r.status !== 'playing') return;
    this.withG(G => {
      if (G.phase === 'result') {
        if (!G.scored) {
          G.scored = true; r.deals++;
          G.result.change.forEach((v, i) => { r.score[i] += v; });
          r.ready = r.seats.map(botCtl);
        }
        r.at = { next: at.next ?? now + this.t('next') };
        return;
      }
      if (G.phase === 'play' && G.trick.length === 3) { r.at = { collect: at.collect ?? now + this.t('collect') }; return; }
      if (G.phase === 'play' && !G.trick.length) {
        const side = E.claimCheck();
        if (side && E.claimers(side).every(q => botCtl(r.seats[q]))) { r.at = { claim: at.claim ?? now + this.t('claim') }; return; }
      }
      const p = G.turn, s = r.seats[p];
      const key = [G.phase, p, G.trickNo, G.trick.length, G.passes, G.kidx, G.bid ? G.bid.ci : -1, G.hands[p].length].join(':');
      if (key !== r.turnKey) { r.turnKey = key; r.at = {}; }
      r.at = botCtl(s)
        ? { bot: r.at.bot ?? now + this.t(s.bot ? 'bot' : 'botForHuman') }
        : { deadline: r.at.deadline ?? now + this.t(G.phase === 'play' ? 'play' : 'bid') };
    });
  }

  // Végrehajtja a lejárt időzítőket.
  tick() {
    const r = this.room, now = Date.now();
    for (const s of r.seats) {
      if (s && !s.bot && !s.online && s.droppedAt && now >= s.droppedAt + this.t('reconnect')) {
        Object.assign(s, { bot: true, token: null, name: s.name + ' (gép)' }); // nem jött vissza: a gép játszik a helyén
      }
    }
    if (r.seats.some(s => s && !s.bot && s.online)) r.emptySince = null;
    else if ((r.emptySince ??= now) + this.t('empty') <= now) return this.close();
    for (let guard = 0; guard < 60 && r.status === 'playing'; guard++) {
      this.drive();
      const [k, when] = Object.entries(r.at).find(([, v]) => v != null) || [];
      if (!k || when > now + 5) break; // az ébresztő ezredmásodpercekkel korábban is jöhet
      if (k === 'next') { this.deal(E.nxt(r.G.dealer)); continue; }
      this.withG(G => {
        if (k === 'collect') E.collectTrick();
        else if (k === 'claim') E.resolveClaim(G.claimAt.side);
        else {
          if (k === 'deadline') { const s = r.seats[G.turn]; if (++s.misses >= 3) s.away = true; }
          this.botMove(G);
        }
      });
      r.at = {};
    }
  }

  close() {
    for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'A szoba bezárult.');
    this.room = null;
    this.ctx.storage.deleteAll();
    this.ctx.storage.deleteAlarm();
  }

  async commit() {
    const r = this.room;
    if (!r) return;
    this.drive();
    const times = [...Object.values(r.at), ...r.seats.map(s => s && !s.bot && s.droppedAt && s.droppedAt + this.t('reconnect')),
      r.seats.some(s => s && !s.bot && s.online) ? null : (r.emptySince ?? Date.now()) + this.t('empty')].filter(Boolean);
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    await this.ctx.storage.put('room', r);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) try { ws.send(JSON.stringify(this.view(a.seat))); } catch {}
    }
  }

  // Az állapot egy játékos szemszögéből: ő a 0. ülés (mint az egyjátékos módban), a mások lapjai rejtve (null).
  view(me) {
    const r = this.room, rot = p => (p < 0 ? p : (p - me + 3) % 3), perm = a => [0, 1, 2].map(i => a[(i + me) % 3]);
    const players = perm(r.seats.map((s, i) => s && { name: s.name, bot: !!s.bot, online: !!(s.bot || s.online), away: !!s.away, score: r.score[i] }));
    let G = null;
    if (r.G) {
      G = structuredClone(r.G);
      const end = G.phase === 'result';
      delete G.collect; delete G.deal; // a botok terve és az eredeti osztás titok
      for (let q = 0; q < 3; q++) if (q !== me && !end && !(G.revealed && q === G.decl)) G.hands[q] = G.hands[q].map(() => null);
      if (!end && G.talonBy !== me) { G.talon = G.talon.map(() => null); delete G.talonPts; }
      for (const k of ['hands', 'won', 'tcount', 'marr', 'lastAction', 'kmult']) if (G[k]) G[k] = perm(G[k]);
      for (const k of ['dealer', 'fh', 'turn', 'decl', 'leader', 'lastWinner', 'talonBy']) if (typeof G[k] === 'number') G[k] = rot(G[k]);
      if (G.bid) G.bid.seat = rot(G.bid.seat);
      if (G.kseq) G.kseq = G.kseq.map(rot);
      const seen = new Set(); // az ütések bejegyzései több listában is ugyanazok az objektumok: mindegyiket egyszer forgatjuk
      for (const list of [G.trick, G.lastTrick, ...(G.hist || [])]) for (const x of list || []) if (!seen.has(x)) { seen.add(x); x.p = rot(x.p); }
      if (G.result) G.result.change = perm(G.result.change);
      if (G.claimShow) { G.claimShow.rest = perm(G.claimShow.rest); G.claimShow.who = G.claimShow.who.map(rot); }
    }
    return { t: 'state', code: r.code, status: r.status, host: rot(0), players, deals: r.deals, ready: perm(r.ready), deadline: r.at.deadline ?? null, G };
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const isNew = url.pathname === '/ws/new', m = url.pathname.match(/^\/ws\/room\/([A-Za-z0-9]{6})$/);
    if (!isNew && !m) return new Response('Not found', { status: 404 });
    const origin = req.headers.get('Origin');
    // helyi fejlesztésnél (MP_DEV) a wrangler dev a saját címét az útvonal hostjára írja át
    if (origin !== ORIGIN && !(env.MP_DEV && /^http:\/\/(127\.0\.0\.1|localhost|ulti\.silyegellert\.cc)(:\d+)?$/.test(origin || ''))) return new Response('Forbidden', { status: 403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const code = isNew ? randomCode() : m[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response('Not found', { status: 404 });
    const fwd = new Request(req);
    fwd.headers.set('X-Room', code);
    return env.TABLE.get(env.TABLE.idFromName(code)).fetch(fwd);
  },
};
