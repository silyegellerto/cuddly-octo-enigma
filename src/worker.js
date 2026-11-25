import { DurableObject } from 'cloudflare:workers';

// Asztal: a következő szakaszban itt fut egy-egy meccs (a motort a build/engine.js adja).
export class Table extends DurableObject {
  async fetch() {
    return new Response('Not found', { status: 404 });
  }
}

export default {
  // Létező fájlokra (a játékra) ez le sem fut; minden más cím egyelőre 404.
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
