# Multiplayer: privát szoba (szerver és üzenetek)

A szerver a `src/worker.js`: Cloudflare Worker, szobánként egy Durable Object (`Table`). A szabályokat és a botokat
ugyanaz a motor adja, mint az egyjátékos módban: telepítéskor a `scripts/build-engine.mjs` kivágja az `ulti.html`-ből
(`// ===== ENGINE START` és `// ===== ENGINE END` között). A szerver az igazság egyetlen forrása: ő oszt, ő ellenőriz
minden lépést, ő számol, és mindenki csak azt látja, amit az asztalnál is látna.

Jelenleg: **privát szoba, vendégként** és emótok (fiók, párosítás, ranglétra később).

## Csatlakozás

WebSocket, ugyanarról a címről, ahonnan a játék jön (a CSP `connect-src 'self'`):

| Cím | Mire |
|---|---|
| `wss://ulti.silyegellert.cc/ws/new?name=NÉV` | Új szoba. Aki létrehozza, az a házigazda. |
| `wss://ulti.silyegellert.cc/ws/room/KÓD?name=NÉV` | Belépés egy szobába a 6 betűs kóddal (indulás előtt). |
| `wss://ulti.silyegellert.cc/ws/room/KÓD?token=TOKEN` | Visszacsatlakozás ugyanarra a helyre (bármikor, a 3 perces ablakon belül). |

- A kód 6 karakter a `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` jelekből (nincs 0/O, 1/I). Javasolt megosztható link:
  `https://ulti.silyegellert.cc/?szoba=KÓD`.
- A tokent a kliens kódonként tárolja (például `localStorage`), ezzel tér vissza frissítés vagy hálózati hiba után.
- A név 1–16 karakter; a szerver kiszűri a vezérlőkaraktereket és a `< > & " '` jeleket, azonos névnél számot tesz mögé.

## Szerver → kliens

| `t` | Mezők | Mikor |
|---|---|---|
| `welcome` | `code`, `token` | Csatlakozáskor. |
| `state` | lásd lent | Minden változás után, mindenkinek a saját nézetével. |
| `emote` | `from`, `id` | Valaki emótot küldött (te is megkapod a sajátodat). `from` a küldő ülése a te szemszögedből (0 = te). |
| `error` | `msg` (magyar szöveg), `fatal` | Elutasított lépés (az állapot nem változott). `fatal: true` esetén a szerver bontja a kapcsolatot (nincs ilyen szoba, megtelt, már elindult). |

A `state` üzenet:

| Mező | Jelentés |
|---|---|
| `code` | A szoba kódja. |
| `status` | `lobby` (várakozás) vagy `playing`. |
| `host` | A házigazda ülése a te szemszögedből (0 = te vagy). Csak ő küldhet `start`-ot. |
| `players[3]` | A **0. mindig te vagy**, utána az óramutató szerint a többiek, mint az egyjátékos módban. Elemei: `{name, bot, online, away, score}`, üres hely: `null`. `away`: többször lejárt az ideje, a gép lép helyette, amíg újra nem lép. |
| `deals` | Lejátszott leosztások száma. |
| `ready[3]` | Leosztás végén ki nyomott már „Következő osztás”-t. |
| `deadline` | A soron lévő játékos határideje (ms, Unix-idő), ha ember lép; különben `null`. |
| `G` | A játékállapot (lásd lent), indulás előtt `null`. |

### A `G` nézet

Ugyanaz a szerkezet, mint az egyjátékos mód `G`-je, a te szemszögedből **elforgatva: te vagy a 0. ülés**. Így a felület
és a motor ugyanúgy működik rajta (`legalCards(0)`, `validateBid(0, …)`, `canPickUp(0)`, `kontraOptions(0)` …).

- A mások lapjai helyén `null` áll (a darabszám valós). Terített játéknál az első ütés után (`G.revealed`) a
  felvevő lapjai látszanak.
- A talon lapjai `null`-ok, kivéve ha te tetted le (`G.talonBy === 0`); a `talonPts` ilyenkor hiányzik.
- A `G.collect` (a botok terve) és a `G.deal` (az eredeti osztás) soha nem kerül ki.
- Leosztás végén (`G.phase === 'result'`) minden lap látszik.
- A `G.log` szövegeiben a játékosok neve áll. Két motorszöveg még az egyjátékos 0. ülésre van írva („Te kezdesz”,
  „kiterítetted a lapjaidat”): ezt a motorban kell javítani (lásd lent).
- A Tipp és a botfüggvények a szerver nézetén **nem** használhatók (a rejtett lapok `null`-ok).

## Kliens → szerver

Minden üzenet JSON, legfeljebb 1 KB; 10 másodperc alatt legfeljebb 20 üzenet (különben a szerver bont).

| `t` | Mezők | Mikor szabályos |
|---|---|---|
| `start` | | Házigazda, `lobby` állapotban. Az üres helyekre bot ül (Gellért, Samu). |
| `bid` | `ci` (a `CONTRACTS` indexe), `disc` (2 lap `id`-ja) | Licitben, ha te jössz és 12 lapod van. Adus, nem piros játéknál az adut a licit végén kell megadni (`trump`). |
| `pickup` | | Ha `canPickUp(0)`. |
| `pass` | | Licitben, ha te jössz és 10 lapod van („Passz”, illetve saját licitnél „Maradok”). |
| `concede` | | Bedobás: licitben a saját visszajött licitednél, adu választásakor, vagy felvevőként játék közben. |
| `trump` | `s` (1 tök, 2 zöld, 3 makk) | `G.phase === 'trump'` és te jössz. |
| `kontra` | `keys` (pl. `["parti","ulti"]`, lehet üres) | `G.phase === 'kontra'` és te jössz; a kulcsok a `kontraOptions(0)`-ból. A kötelező kontrát a szerver magától hozzáteszi. |
| `play` | `id` (a lap azonosítója) | Ha te jössz, és a lap benne van a `legalCards(0)`-ban. |
| `claim` | | Felmutatás ütés elején (az utolsó ütés előtt). A játékos maga dönt, a nézetben nincs `claimAt`. A szerver ekkor számol (`claimCheck`): ha a felmutató fél (felvevő, betlis felvevő, illetve a két védő; betliben csak a felvevő mutathat fel) biztosan nyer, a leosztás a szokásos módon véget ér; ha nem, `badClaim`: felvevőnél bukott, védőnél nyert játék (`G.result.badClaim`). |
| `next` | | Leosztás végén: kész vagy a következőre. |
| `emote` | `id` (kisbetű, szám, kötőjel, legfeljebb 24 jel) | Bármikor (váróban, játék közben, eredménynél). Lásd lent. |

### Emótok

- A képek a felületé: `emotes/ID.svg` (vagy `.png`/`.webp`), az azonosító és a magyar felirat listája az `ulti.html`-ben.
  A szerver nem ismeri a listát, csak a formát ellenőrzi, ezért **a kliens csak a saját listájában lévő azonosítót
  jelenítse meg**, az ismeretlent hagyja figyelmen kívül (így új emót felvételéhez nem kell a szerverhez nyúlni).
- A szerver azonnal továbbküldi mindenkinek, a küldőnek is (a saját buborékot ez alapján érdemes mutatni). Nem menti,
  nem küld `state`-et, a lépési időt és az `away` állapotot nem érinti; visszacsatlakozáskor a régi emótok nem jönnek újra.
- Korlát ülésenként: 3 másodpercenként egy, 30 másodperc alatt legfeljebb 5. A többit a szerver **csendben eldobja**
  (nincs hibaüzenet, a kapcsolat marad), ezért a felület is tartsa a 3 s-os várakozást. Hibás formájú `id`-ra
  `error` jön („Ismeretlen emót.”).
- Elnémítás (egy játékosé vagy az összesé) csak a kliensen történik.

## Időzítések

| Mi | Idő | Utána |
|---|---|---|
| Licit, talon, adu, kontra | 45 s | A gép lép helyetted, te a helyeden maradsz. |
| Lap kijátszása | 30 s | Ugyanígy. 3 egymás utáni lejárat után `away`: a gép lép, amíg újra nem lépsz. |
| Kiesés (bontott kapcsolat) | 3 perc | Addig a gép lép helyetted 2,5 s-onként; ha nem jössz vissza, a helyeden végleg a gép marad. |
| Leosztás vége | 30 s | Ha nem mindenki nyomott `next`-et, magától jön a következő osztás. |
| Emót | 3 s, 30 s alatt 5 | Ülésenként; a többit a szerver eldobja. |
| Üres szoba (nincs bent ember) | 3 perc | A szoba bezárul, a kód megszűnik. |

A botok lépései között kb. 0,85 s telik el; a teljes ütés 1 s-ig látszik, mielőtt a szerver begyűjti.

## Fejlesztés és próba

```bash
npx wrangler dev --var MP_FAST:1 --var MP_DEV:1    # MP_FAST: minden idő a tizenötödére rövidül; MP_DEV: helyi Origin
node tests/mp_test.mjs                             # három szimulált játékos, kiesés, lejárt idő, botok, rejtett lapok, emótok
```

## Ismert korlátok

- A házigazda nélkül a szoba nem indítható el (ha a házigazda a váróban kiesik és nem jön vissza, a szoba nem indul).
- Indulás után új játékos nem ülhet be, csak a régiek térhetnek vissza a tokenjükkel.
- A szoba végtelen leosztásig megy; a pontszám összesítve látszik.
