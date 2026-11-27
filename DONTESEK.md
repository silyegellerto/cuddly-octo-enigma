# Rablóulti – megbeszélt döntések és szabályok

Ez a fájl a fejlesztés során megbeszélt játék-, Tipp- és munkaszabályokat rögzíti.
Minden új döntés ide kerül, és minden változtatás előtt ezt kell átnézni,
hogy egy korábbi javítás ne vesszen el.

## Munkaszabályok

- GitHubra (commit, push) csak akkor kerül változás, ha Gellért kéri.
- Ha Gellért azt mondja, „beszéljük át / gondolkozzunk / ne változtass”, akkor nincs kódmódosítás, csak megbeszélés.
- A fejlesztés a repóban lévő `ulti.html`-ben folyik; a claude.ai-os artifact ugyanebből a fájlból frissül, a kettő mindig egyezzen.
- A szerver (`ulti.silyegellert.cc`) a main ágat húzza: `ulti.html`, `cards/`, `fonts/` (és kell az `icons/` is).
- Minden változtatás után lefut a szabályellenőrzés: `python3 tests/run_audit.py`.
- **Átköltözés a Cloudflare-re** (2026.11.25., Gellért döntése): a játékot egy Cloudflare Worker szolgálja ki a repó gyökeréből (`wrangler.jsonc`), a Pi-n csak a garázs marad. A webre csak az kerül ki, amit a `.assetsignore` kifejezetten enged (`ulti.html`, `cards/`, `fonts/`, `icons/`); **új nyilvános fájlt vagy mappát ott is fel kell venni**. A biztonsági fejlécek (CSP stb.) és a gyorsítótárazás a `_headers` fájlban vannak, a `/` címet a `_redirects` irányítja az `ulti.html`-re.
- **A motor a szerveren is fut** (multiplayer, 2026.11.25.): telepítéskor a `scripts/build-engine.mjs` kivágja az `ulti.html`-ből az `// ===== ENGINE START` és `// ===== ENGINE END` közötti részt. Ezért a jelölők maradjanak meg, és a motor ne nyúljon a felülethez (`document`, `window`, `localStorage`). A szerveren a botlicit átlagosan ~0,4 s processzoridő; a Durable Objectben ez belefér az ingyenes csomagba, egy sima Worker-hívásban nem.
- **Multiplayer, privát szoba** (2026.11.25.): a szerver (`src/worker.js`) a felülettel azonos `G`-t küld, a játékos szemszögéből elforgatva (ő a 0. ülés), a rejtett lapok helyén `null`-lal. A felület így a meglévő megjelenítéssel és a motor saját ellenőrzéseivel dolgozhat; a lépést nem a motorral hajtja végre, hanem üzenetben küldi el. Időkorlát: 45 s licit, 30 s lap; kiesés után 3 perc a visszatérésre, addig a gép lép. Részletek: `docs/MULTIPLAYER.md`.
- **Multiplayer felület** (2026.11.25.): a „Játék barátokkal” gomb a fejlécben a menü mellett van, nem a menüben (Gellért): mobilon kerek, háromemberes ikon, gépen szöveg a Szabályok és a Statisztikám után; szoba közben a szoba ablakát nyitja (kód, link, helyek, ki esett ki). Név megjegyezve, link `/?szoba=KÓD`, váró a kóddal, linkmásolással, három hellyel, a házigazdának „Indítás”. Multiplayerben semmilyen tippet nem kap a játékos, és napló sincs (Gellért, 2026.11.25.): nincs Tipp, „Mi lett volna jobb?”, Újrajátszás, helyzeti tippbuborék, automata játék, napló (oldalon és menüben), ulti-VII figyelmeztetés, „Felmutatom” ajánlat (az is a motor ítélete, hogy minden ütés biztosan a tiéd), és Tanuló beállítással sem látszik mások ütése; nem fut `newDeal`/`advance`, nem íródik mentés, pontszám, statisztika. Az egyjátékos játék a háttérben megmarad, kilépés után ott folytatódik. A token kódonként a `localStorage` `ulti-mp-v1` kulcsán; kapcsolatvesztéskor 1, 2, 5 s múlva újrapróbál („Újracsatlakozás…”), `fatal` hibánál vissza a menübe. Ha lejárt a játékos ideje és a gép lép helyette, ezt kiírjuk, és a „Következő osztás” akkor is nyomható (bármely üzenete visszaadja neki a helyet). A naplóban a második személy („Te kezdesz”, „kiterítetted”) csak akkor, ha `NAME[0]==='Te'`.

## Alapelvek a gépi döntésekhez

- A Tipp, a licit utáni elemzés és a botok **ugyanazokkal a döntési függvényekkel** számolnak (`evalOpt`, `bestDiscard`, `rankOptions`, `botChoose` stb.).
- A Kovács-könyv tanácsai (`KV`) csak a Tipp szövegét gazdagítják, **a botok játékát soha nem változtatják** (a próbajátékok mindig `KV=false`-szal futnak).
- Az esélyek rögzített véletlenmagú próbajátékokból jönnek: ugyanarra a lapra mindig ugyanaz az eredmény.

## Talonozás (ultiblog: „A talonozás”)

Forrás: <https://ultiblog.hu/a-talonozas/>

- **Alacsony licitnél** (parti, piros parti; `LOW_BID=2`) a talonba **nem kerül ász, X, VII, király, felső**, mert a következő licitáló felveheti, és magasabbat mondhat vele.
  - Kivétel: a X letehető, ha ugyanabból a színből az ász és a király is nálad van.
  - Ha a lapban nincs más szabályos lerakás, a tiltott is mehet.
- **Piros lap** csak **magas értékű bemondásnál** (legalább 8 pont: piros 40-100, 40-100 ulti, piros ulti, …; `RED_BID=8`) kerülhet a talonba, amikor megéri a kockázat. Ennél kisebb bemondásnál nem: a következő licitáló piros játékot mondhatna vele. Magas bemondásnál is pontlevonással jár (`giftValue`).
- **Adus játékban adut nem teszünk le** (a saját játékodat gyengítené). Sorrend, ha nincs szabályos lerakás: előbb VII, király, felső vagy piros lap; adu, illetve alacsony licitnél ász vagy X csak végső esetben, és ezek közül a próbajátékok döntenek (`discardTier`).
- **Hosszú színből** dobj (kevésbé erősíted a következőt).
- **Abból a színből dobj, amelyiknek a VII-ese nálad marad**: abban a színben más nem tud ultit mondani.
- Magasabb licitnél a lerakás nem tiltott, de a „másnak kellő” lapok pontlevonással járnak (`giftPenalty`): minél kisebb a bemondás, annál nagyobb a levonás.
- A botok és a Tipp **olvassák a talont**: az előző licitáló vállalásából következtetnek, mit tehetett le (ulti után inkább kis lapokat, betli után magasakat).
- **Gyűjtés / felvétel**: a passz sem ingyenes; felvenni csak akkor érdemes, ha a gyűjtés jobb az azonnali legjobb lehetőségnél (`passBase = passValue()/2`, `MIN_PICK_P = 0.3`).

## Betli

- Talonozásnál nincs tiltás: a veszélyes lapoknak kell lemenniük. A VII és VIII soha nem megy le.
- A Tipp betlinél **minden lehetséges lerakást** lemér próbajátékkal (`N_PRE=24`), a legjobbakat pontosabban is.
- **Ász betliben**: csak 7–8 lapos színben tartható. 6 lapnál már nagyon kockázatos (a kint lévő két lap elosztásán múlik), rövidebb színben a védők addig hívják a színt, amíg rá nem kell tenni. Csak színhiánnyal lehet idő előtt eldobni.
- **A betli esélye** (Tipp és botlicit) **erős védekezést** feltételez: a próbajátékokban a védők látják a felvevő lapjait. Indok: a zárt lapos bot nem találja meg a lyukakat, így az esély túl optimista volt (16 betlijavaslaton átlag 67% helyett 48%; egy lyukas lap 85% helyett 3%). Ezért csak a valóban jó betlit javasolja.
- **Védekezés**: a felülütési kényszer mindenkire vonatkozik, a védő társára is. A védő minden hívást végigszámol az ismeretlen lapok lehetséges elosztásain, és azt hívja, amelyiknél a felvevő a legnagyobb eséllyel viszi az ütést. A talonban a magas lapok (ász, király, felső) valószínűbbek, mert a betlis felvevő ezeket teszi le. (Az „elsőként hívott szín rövid” feltevést elvetettük, félrevitt.)
- **Színtelenítés**: ha a védő nem tud színt adni, abból a színből dob tovább, amelyikből már elkezdett dobni; ha még egyikből sem, a legmagasabb lapját dobja (azonos rangnál a rövidebb színből).
- **Betli elleni hívás: előbb a fogás** (Gellért, 2026.11.27.): a védő először azt nézi, melyik hívással kényszerítheti ütésre a felvevőt (felülütési kényszer). A társ üres színéből is ezt hívja, gyakran a legkisebb lapot (pl. makk VIII, ha a felvevőnél makk X, IX van), és csak ha egyik hívás sem foghat, hívja a magasat színtelenítésre. Előtte a bot a társ üres színéből mindig a legmagasabbat hívta, és a felvevő kényelmesen alá tett. Teszt: `tests/audit_body.js`.
- Ha a védő tud színt adni, és a felvevő az ütést már nem viszi, a legmagasabb lapját teszi (a kis lapokat az alá hívásokhoz tartja).
- **Licit, nem mondható játék** (Gellért, 2026.11.25.): ha a választott ultihoz nem marad adu VII-es (nincs, vagy a talonba jelölted), a „Bemondom” halvány, mellette **piros** „!”, rákoppintva az ok. A kényszervállalás „!”-e **sárga** (figyelmeztetés, mondható). A licit hibaüzenete a gombsor fölött áll, nem a görgethető lista alatt.
- **Link előnézete** (2026.11.26.): Open Graph címkék az `ulti.html` fejében, kép: `icons/og.jpg` (1200×630, zöld asztal, legyező, név, rövid leírás, „Barátokkal · Gép ellen · Tanuló tipp”). Az `og:image` teljes címmel (`https://ulti.silyegellert.cc/...`) szerepel, mert az üzenetküldők csak így töltik le.
- **Kéz több sorban telefonon** (Gellért, 2026.11.27.): az alkalmazás-nézetben (telefon állva) a kéz alapból egy sorban, húzható. Ha a döntési panelben van annyi üres hely, hogy a lapok több, egyenletes sorban (pl. 3+3) mind kiférjenek, és a panel tartalma utána is görgetés nélkül látszik, több sorba törik (`fitHand`). A lapok mérete nem változik (Gellért). Az asztal mérete sem változik (Gellért). Helyet a panel ad: kijátszáskor a „···” menü a panel jobb felső sarkában van, a szöveg körbefolyja, így a kétsoros állapotszöveg (pl. „Te jössz. A kiemelt lapok közül választhatsz.”) mellett is marad a két kártyasor, és nem ugrál a kéz ütésről ütésre; a sorok között 6 px. Bekapcsolt Tippnél a Tipp sora miatt kisebb képernyőn maradhat egy sor. Licitnél a táblázat vagy nyitott Tipp mellett így marad egy sor.
- **Ablakok bezárása** (Gellért, 2026.11.26.): a Szabályok ablak tetején is van X (görgetés közben is fent marad), nem csak alul a „Bezár”.
- **Terített betli**: az első ütés után a felvevő lapjai kiterítődnek (napló, értesítés, „terítve” jelzés).

## Licit, kontra, játékmenet

- A sikertelen durchmars vagy betli a leosztást nem állítja meg, ha még más része is van; ha minden rész eldőlt, a leosztás véget ér (`allDecided`). Partis játék a végéig megy.
- A **parti kontrázható** a védők 20+20-ával is (`PARTI_MARGIN = [60,40,40]`).
- Sima durchmars színtelen sorrenddel megy (MAUSZ szerint), adus változatnál az adu sorrend.
- **Felmutatás** („Felmutatom”): ha egy ütés elején biztos, hogy minden ütés az egyik félé. Mindkét irányban működik. A botok maguktól felmutatnak, ilyenkor a két bot maradék lapja is látszik.
  - **Csak a felmutató tudása alapján biztos esetben** (`claimSafe`): minden lehetséges lapelosztásnál biztos legyen. Tudás: a saját lap (védőknél a két védőé együtt), a kiment lapok, felvevőnél a talon, a bemondásokból ismert lapok, a kiderült színhiányok. A rejtett lapokat a keresés a felmutatónak legrosszabb módon, de szabályosan osztja ki. Hibás volt: korábban a gép a valódi, eltakart lapokat is figyelembe vette (lyukas betlinél is felajánlotta).
- **Felmutatás multiplayerben** (Gellért, 2026.11.26.): nincs előre jelzés, hogy biztos-e (az tipp volna; a szerver a `claimAt`-ot sem küldi el). Ütés elején, az utolsó ütés előtt a „⋯” menüben „Felmutatom a lapjaimat”; előbb figyelmeztető ablak, benne a „Felmutatom” gomb. A szerver ekkor számol: ha biztos, a szokásos felmutatás; ha nem, **bukott játék** (felvevőnél minden tétel bukott, védőknél a felvevő minden tétele nyert, a szokásos áron, kontrával együtt: `badClaim`). Betliben csak a felvevő mutathat fel. A botok felmutatása változatlan.
- **Emótok multiplayerben** (Gellért, 2026.11.26.): chat nincs, csak adott képekből választható emót (a képeket és a felületet Gellért készíti, `emotes/` mappa, a `.assetsignore` már engedi). A szerver nem menti és nem ismeri a listát, csak a formát ellenőrzi (`a-z0-9-`, max. 24 jel) és továbbküldi; a kliens csak a saját listájában lévő azonosítót mutatja. Korlát ülésenként 3 s-onként egy, 30 s alatt 5, a többi csendben eldobva. Botok egyelőre nem küldenek emótot. Részletek: `docs/MULTIPLAYER.md`.
- **Emótok a felületen** (Gellért, 2026.11.26.): lebegő kerek gomb a jobb alsó sarokban (csak multiplayerben, a váróban is), rákoppintva 5×2-es választó (felirat nélküli kép + magyar szöveg). A buborék a feliratos kép: másoké a játékos mezője fölött (a szoba ablakában a sora mellett), a sajátod a kezed sora fölött; kb. 3 s, nem lehet rákattintani. **A lapokat semmi nem takarhatja**: a buborék soha nem kerül a kéz vagy az asztal lapjaira, a gomb alól pedig a kéz utolsó lapja is kigörgethető (a kéz sora jobbról helyet hagy); gépen a jobb oldali panel nem fut a gomb alá. Küldés után a gomb 3 s-ig (5 emót után a 30 s lejártáig) tiltott, gyűrű mutatja a hátralévő időt. Némítás a szoba ablakában játékosonként és „Mások emótjainak elrejtése”, csak ezen a gépen, szobánként. Hang és rezgés egyelőre nincs.
- Felmutatásnál ultis felvevő az adu VII-et az utolsó ütésre tartja.
- Elnevezés: a piros szín nélküli durchmars neve **Redurchmars**.

## Ultiblog-stratégiák (licit és lejátszás)

Források: <https://ultiblog.hu/az-ulti-szabalyai/ulti-strategia> és az onnan linkelt cikkek (passz/parti, piros parti, 40-100, 20-100, ulti, piros ulti, betli, durchmars, kontra- és licittáblázat). 2026.11.24-én átnézve; ami benne van:

- **Piros 40-100, 20-100, piros 20-100 nem nyitólicit** („soha nem elsőre”, „nem szabad azonnal, első körben”): nyitáskor alacsonyabbal tartunk, ezek csak túllicitálásra jönnek (`NOT_FIRST`).
- **40-100 / 20-100 felvevő**: a húzó színben nem ásszal kezd, amíg a védőknél adu lehet, hanem előbb egy kisebb, pontot nem érő lappal.
- **20-100 felvevő**: a védőknek járó egyetlen ütést a játék elején adja oda (amíg színt kell adniuk, nem tudnak kenni).
- **20-100 védő**: korán megszabadul az adu- és hajtószínű lapjaitól, hogy később ászt vagy X-et kenhessen a társa ütésébe.
- Már korábban is benne volt: talonozás; az ulti lapelosztás-táblázata, hajtószín, aduhúzás; ulti ellen a társ színéből indulás (nem aduból, nem a hajtószínből); betliben ászt nem indít, királlyal indul; 40-100-nál a hiányzó adu ász kihajtása felsővel/királlyal; durchmarsnál előbb a biztos ütők, a fogható lap utoljára, a védő a fogólapját tartja; kontra 20/40 és erős adu esetén, betliben egyéni; terített csak hibátlan lappal; partinál a nem piros 20 megtartása.
- Nem építettük be (a cikkek csak általánosan írják): a társ dobásaiból jelzések olvasása, a blöff talon.

## Felület

- Ha a leosztásban senki nem kap pontot (a felvevő összesen 0), az eredmény: **„Pénz az ablakban”** (nem „elbukta”).
- A játék neve **Rablóulti**, a botok **Gellért** és **Samu**.
- Az Új játék megerősítő felirata: „Biztos?” (telefonon is ráfér).
- Kényszervállalásnál piros „!” gomb nyitja a magyarázatot (nem takarja a licit gombot).
- A licitlista nem külön görgethető doboz; `⤢` gomb teljes képernyőn mutatja.
- Telefonon álló helyzetben alkalmazás-nézet: csak a döntési panel görög, a fő gombsor alul ragad.
- Eredménynél a „Következő osztás” mellett sárga **„Újrajátszás”** gomb: ugyanaz a leosztás ugyanazokkal a lapokkal, ugyanazzal az osztóval; a pontszámba normál leosztásként számít.
- A lapsor fölötti gomb felirata **„Talon”** (az ablak továbbra is a talont és az ütéseket mutatja).
- A saját kijátszott lapod a panel fölött repül az asztalra, és ha te viszed az ütést, a lapok is a panel fölött úsznak hozzád (nem tűnnek el mögötte).
- A Tipp beállítása: **Ki / Normál / Tanuló**. „Ki” állásban a döntési panelen nincs Tipp gomb, és a kör végén a „Mi lett volna jobb?” gomb sem jelenik meg.
- A 20/40 megtartásáról nincs külön szabály: a Tipp a próbajátékok alapján dönt (Gellért döntése).
- Telefonos app-nézetben a dokumentum soha nem görög el (őrfüggvény + görgetés nélküli fókusz, dupla koppintásos nagyítás tiltva), hogy a tartalom ne csússzon a státuszsor alá.
- iOS 26 kezdőképernyős homályosítás ellen: tömör, háttérszínű, rögzített sáv a státuszsor mögött (`#sbBand`, magassága `env(safe-area-inset-top)`), **pointer-events nélküli tiltás nélkül** (a Safari a pointer-events:none elemeket átugorja). A fejléc lejjebb tolása (42 px, 22 px) nem tetszett; most 6 px (alap). A háttérszín a státuszsorban maradjon (Gellért kérése).
- A Tipp nincs mindig nyitva; a részletek a „▾ Miért?” alatt.
