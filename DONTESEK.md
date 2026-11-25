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
- Ha a védő tud színt adni, és a felvevő az ütést már nem viszi, a legmagasabb lapját teszi (a kis lapokat az alá hívásokhoz tartja).
- **Terített betli**: az első ütés után a felvevő lapjai kiterítődnek (napló, értesítés, „terítve” jelzés).

## Licit, kontra, játékmenet

- A sikertelen durchmars vagy betli a leosztást nem állítja meg, ha még más része is van; ha minden rész eldőlt, a leosztás véget ér (`allDecided`). Partis játék a végéig megy.
- A **parti kontrázható** a védők 20+20-ával is (`PARTI_MARGIN = [60,40,40]`).
- Sima durchmars színtelen sorrenddel megy (MAUSZ szerint), adus változatnál az adu sorrend.
- **Felmutatás** („Felmutatom”): ha egy ütés elején biztos, hogy minden ütés az egyik félé. Mindkét irányban működik. A botok maguktól felmutatnak, ilyenkor a két bot maradék lapja is látszik.
  - **Csak a felmutató tudása alapján biztos esetben** (`claimSafe`): minden lehetséges lapelosztásnál biztos legyen. Tudás: a saját lap (védőknél a két védőé együtt), a kiment lapok, felvevőnél a talon, a bemondásokból ismert lapok, a kiderült színhiányok. A rejtett lapokat a keresés a felmutatónak legrosszabb módon, de szabályosan osztja ki. Hibás volt: korábban a gép a valódi, eltakart lapokat is figyelembe vette (lyukas betlinél is felajánlotta).
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
