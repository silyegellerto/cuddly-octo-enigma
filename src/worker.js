import { DurableObject } from 'cloudflare:workers';
import * as E from '../build/engine.js';

// shortcut: rejtett mérőpont a bot processzoridejének kiderítésére az ingyenes csomagban; a mérés után törlendő.
const BENCH = '/api/_bench/k7q2x9';

// n darab botlicit-döntés friss leosztásokon, ahogy a játékban követik egymást.
function bidDecisions(n) {
  let done = 0, deal = 0;
  while (done < n) {
    E.newDeal(deal++ % 3);
    while (E.getG().phase === 'bid' && done < n) {
      const p = E.getG().turn, a = E.botBidAction(p);
      done++;
      if (a.type === 'bid') E.doBid(p, a.disc, a.ci, a.suit);
      else if (a.type === 'pickup') E.doPickUp(p);
      else if (a.type === 'concede') E.doConcede(p);
      else E.doPass(p);
    }
  }
  return done;
}

const count = url => Math.min(50, Math.max(1, +url.searchParams.get('n') || 1));

// Asztal: a következő szakaszban itt fut egy-egy meccs.
export class Table extends DurableObject {
  async fetch(req) {
    return Response.json({ where: 'durable-object', decisions: bidDecisions(count(new URL(req.url))) });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === BENCH + '/worker') return Response.json({ where: 'worker', decisions: bidDecisions(count(url)) });
    if (url.pathname === BENCH + '/do') return env.TABLE.get(env.TABLE.idFromName('bench')).fetch(req);
    return new Response('Not found', { status: 404 });
  },
};
