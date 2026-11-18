# Rablóulti

Böngészős, egyszemélyes magyar ulti (rablóulti) játék: a játékos két bot (Gellért, Samu) ellen játszik. Tipp rendszerrel és oktató móddal, magyar kártyaképekkel.

## Fájlok

- `ulti.html` – a teljes játék egyetlen fájlban (HTML + CSS + JavaScript, külső függőség csak a Google Fonts).
- `cards/c0.webp` … `cards/c31.webp` – a 32 kártyakép. Az oldal relatív úton tölti be őket (`cards/cN.webp`), ezért a mappának az `ulti.html` mellett kell lennie.
- `ulti_standalone.html` – ugyanaz a játék, a kártyaképek base64-ként beágyazva. Egy fájlként, internet nélkül is megnyitható. LLM-nek ne ezt add, mert a képek miatt nagy (~450 KB); a kódhoz az `ulti.html` elég.

Indítás: nyisd meg az `ulti.html`-t böngészőben (a `cards` mappával együtt), vagy a standalone fájlt.

## Kártyaazonosítók

`id = s*8 + r`
- szín `s`: 0 piros, 1 tök, 2 zöld, 3 makk
- rang `r`: 0 VII, 1 VIII, 2 IX, 3 X, 4 alsó, 5 felső, 6 király, 7 ász

Adus erősorrend (`TP` tömb): ász > X > király > felső > alsó > IX > VIII > VII. Adu nélküli játékban (betli, szín nélküli durchmars) a természetes `r` sorrend: ász > király > felső > alsó > X > IX > VIII > VII.

## A kód szerkezete (`ulti.html` `<script>`)

| Szakasz | Tartalom |
|---|---|
| `ENGINE START … ENGINE END` | Tiszta játéklogika, DOM nélkül. Node-ban külön is futtatható tesztekhez. |
| `CONTRACTS` | A licitsor (42 vállalás) a Jánoska–Zsigri könyv táblázata szerint: `name`, `val`, `comps` (részek és értékük: `parti`, `c40`, `c20`, `ulti`, `betli`, `durch`), `kind` (`trump` / `betli` / `durch` = szín nélküli), `red`, `open` (terített). |
| állapot `G` | `hands`, `talon`, `phase` (`bid` → `kontra` → `play` → `result`), `bid`, `decl`, `trump`, `trick`, `hist`, `won`, `kmult` (kontraszorzók védőnként és részenként), `forced` (kényszervállalás), `marr` (20/40 bemondások), `log`. |
| licit | `doBid`, `doPass`, `doPickUp`, `doConcede`, `minBidIndex` (csak nagyobb pontértékű vállalás), `checkReq`, `forcedParts`, `validateBid`. Önrablás: két passz után a licitáló visszaveheti a saját talonját. |
| kontra | `kontraOptions`, `doKontra`, `mustKontra` (kényszervállalásnál kötelező), `kontraCommon` (adus játékban közös, betliben és szín nélküli durchmarsban egyéni). |
| lejátszás | `legalCards` (színkényszer, felülütés, adukényszer, ulti: a VII nem adható ki, amíg más adu van), `beats`, `playCard`, `collectTrick`. |
| elszámolás | `finishHand`, `defGain` (bukott ulti: kontra nélkül 2x, kontrával 3x, rekontrával 5x), csendes ulti / 100 / négy ász / durchmars. |
| bot licit | `trumpStats`, `pBetli`, `pDurch`, `compP` (esélybecslés, a könyv feltételeinek nem megfelelő vállalás 0,82-es szorzót kap), `estimate`, `bidOptions`, `botBidAction`. |
| stratégia | `handFacts`, `bookComp`, `bookCheck`, `bookHTML` (a könyv licitfeltételei pipálható listaként), `knownVoid`, `partnerSuits`, `stopperSuit`. |
| bot kontra | `kontraJudge` (a könyv kontratanácsai, rekontra alullicitálásnál), `botKontra`. |
| bot kijátszás | `botChoose` – minden döntés indoklást ír a `WHY` változóba, ezt mutatja a Tipp. |
| UI | `render*` függvények, `computeHint` (Tipp), `buildAnalysis` / `analyzeBid` / `simulate` (oktató mód: kör utáni elemzés, a lehetséges vállalások gépi lejátszása a valódi leosztással). |

## Szabályok (döntések)

Alap: ultiblog.hu szabálykönyv, kiegészítve Jánoska Levente – Zsigri: *A rablóulti szabályai* könyvvel.

- Kezdő 12 lap, a többiek 10. Licit a talon felvételével, mindig erősebb vállalással (`bidRank`): az ulti és a piros ulti parti-pontja csak döntetlennél számít (ulti 4+1 < betli 5); azonos értéknél az egyszerű vállalás erősebb a kombináltnál, a 20-100 a piros 40-100-nál; az egyforma erősségűek kizárják egymást. A `CONTRACTS` tömb e szerint rendezett.
- 42 vállalás, összetett vállalásokkal (40-100 / 20-100 / ulti / adus durchmars kombinációk, piros és terített változatok). A könyv táblázatán felül benne maradt a „Piros 20-100” (16).
- Kényszervállalás: 40-100 a 40 nélkül, 20-100 a 20 nélkül mondható; a hiányzó bemondás pontja nem számít, a kulcslapot tartó védő kötelezően kontráz.
- Kontra / rekontra (szubkontra nincs), az első lap előtt.
- Korai vége (`allDecided`): ha a bemondás minden része eldőlt (betli/durchmars bukott, 100 megvan vagy elérhetetlen, ulti VII idő előtt kiment), a leosztás véget ér. Partis játék a végéig megy; ha a felvevő addig mindent vitt, a csendes durchmars miatt is tovább megy.
- Parti kontra (`kontraJudge`, `PARTI_MARGIN`): ha a védők 20/40 bemondásai legalább 40 ponttal (óvatosnál 60) többet érnek a felvevőénél, a parti kontrázható kevés ütőlappal is (gépi lejátszásokban ilyenkor ~70%-ban bukik). Ilyen különbségnél a felvevő nem rekontráz partit.
- Felmutatás (`claimCheck`, `solveClaim`, `resolveClaim`): ütés elején teljes kereséssel (egyenértékű lapok összevonásával) megnézi, biztos-e, hogy innentől minden ütés egy félé (felvevő mindent / betliben semmit / védők mindent). A botok maguktól felmutatnak, a játékosnak „Felmutatom” gomb jelenik meg; a maradékot a gép lejátssza, így a pontozás a szokásos.
- Lapszámolás (`knownAt`, `mayHold`, `oppTrumps`, `declMayBeat`): a botok a bemondott 20/40-ből, az ulti VII-eséből, a 40-100 adu király-felsőjéből és az ismert színhiányokból következtetnek: a felvevő nem húz adut, ha a védőknél már nincs; a védők a társnál ismert lapot nem tekintik fenyegetésnek, és biztonságosan beadják a pontot, ha a felvevő nem tud fölé menni.
- Bedobás bármikor (licit végén vagy játék közben), mindig kontrázott áron: a vállalás duplája védőnként, bukott ulti háromszorosa.
- A leosztás véget ér, amint minden bemondott rész eldőlt (`allDecided`): durchmars az első elvesztett ütésnél, betli az első vitt ütésnél, 40-100 / 20-100 ha már megvan vagy már nem érhető el, ulti ha a VII idő előtt kiment. A parti a végéig megy. Korai befejezésnél csendes bónusz nem jár.
- 20/40 bemondás csak akkor számít, ha a fél vitt ászt, X-et vagy az utolsó ütést.
- Csendes ulti (2, bukva 4), csendes 100 (2), csendes négy ász (2), csendes durchmars (3); piros adunál dupla.

## Fejlesztési elv: a Tipp és a botok ugyanazt döntik

A Tipp, az oktató mód elemzése és a botok mindig ugyanazokat a döntési függvényeket használják, a kockázati szinttől (`RISK`: óvatos / normál / merész) függően:
`chooseBid` (licit, licitlétrával), `pickupDecision` (talon felvétele), `ownRaise` és `shouldConcede` (saját talon, bedobás), `kontraDecision` (kontra), `botChoose` (kijátszás). Minden vállalás esélyét és várható pontját az `evalOpt` számolja: 32 próbajáték a többi lap véletlen kiosztásával (20/40 bemondásokkal, csendes bónuszokkal), rögzített véletlenmaggal, így ugyanarra a lapra mindig ugyanaz az eredmény. A heurisztikus `estimate`/`compP` csak előszűrésre (`bidOptions`, `rankOptions`) és a talon-felvétel becslésére (`pickupDetail`) szolgál. A kiírt számoknak mindig abból kell jönniük, amiből a döntés született. Új stratégiát mindig ezekbe a függvényekbe kell tenni, ne külön a Tippbe.

## Élénk licit

Mindig be van kapcsolva; a `LIVELY=false` csak teszteléshez maradt meg (akkor a korábbi licitlogika fut). Részei (mind a botok, mind a Tipp ugyanezeket használja):

- **Talonolvasás** (`inferTalons`): az előző licitáló vállalásából visszakövetkeztet, milyen két lap kerülhetett a talonba (16 mintakéz, a bot saját lerakási logikájával). A felvétel becslése (`pickupDetailH`) ezekkel a talonokkal számol, nem vakon.
- **Passz mint viszonyítás** (`passValue`, `PASS_LOSS=0.65`, `passBase`): passzolva védő leszel, és átlagosan a vállalás értékének kb. 65%-át veszíted. Mivel a vállalás várható értéke védőnként értendő (két védővel számolsz el), a felvételt ennek a felével vetjük össze. Felvétel csak akkor, ha a legjobb játék sikeresélye legalább 30% (`MIN_PICK_P`), kivéve a gyűjtést.
- **Gyűjtés tartó licittel** (`collectPlan`, `bidDecision`): ha egy olcsó vállalással (tartó licit) a talont tovább lehet adni, és a visszakerülő talonnal nagyobb játék (betli, 40-100, 20-100) várható, a bot / a Tipp ezt javasolja. Az esélyt a `P_RETURN` (visszakerülés), a beragadás kockázatát próbajáték (`evalOpt`) adja; a `RISK_COLLECT` küszöb a kockázati szinttől függ.
- A „laprontás” (szándékosan rossz talon) nincs benne.

Visszaállítás: a `backup/ulti_v34_elenk_licit_elott.html` fájl.

## Talonozás alacsony licitnél

Parti és piros parti licitnél a talonba nem kerül ász, X, VII, király vagy felső (ultiblog), kivéve az X-et, ha ugyanabból a színből az ász és a király is a kézben van. Betlire nem vonatkozik. Ez kötelező szabály (`discardAllowed`), nem csak levonás. Ha a tiltott lerakás kártyajátékban jobb lenne, a Tipp ezt tanulságként megmutatja.

## Szándékos eltérések a Wikipédia licittáblázatától

- A 42 vállalás értéke egyezik a Wikipédia „Rablóulti” szócikkének táblázatával. A „négy ász” család (12 vállalás) szándékosan nincs benne, a csendes négy ász bónusz viszont igen.
- Bukáskor csak az ulti fizet duplán (ultiblog, Jánoska–Zsigri). A Wikipédia szerinti „bukó pont” (a legtöbb vállalás duplán) szándékosan nincs bekapcsolva.

## Tesztelés

`python3 tests/run_audit.py`: lejátszik 60 leosztást a botokkal, és ellenőrzi a szabályokat és a stratégiai elveket: lapadás, licit, önrablás, kontra, kényszervállalás, bedobás, talonszabály, a Tipp és a botok egyezése, licitlétra, a védők és a betli-felvevő lapdobása, élénk licit bekapcsolva.


Az `ENGINE START` és `ENGINE END` közötti rész kivágható és Node-ban futtatható: botok egymás elleni leosztásaival ellenőrizhető a szabályos lapadás, hogy a pontok összege 0, és a vállalások nyerési aránya.

A kártyaképek a felhasználó által feltöltött magyar kártya táblaképből vannak kivágva.
