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
- **Hosszú színből** dobj (kevésbé erősíted a következőt).
- **Abból a színből dobj, amelyiknek a VII-ese nálad marad**: abban a színben más nem tud ultit mondani.
- Magasabb licitnél a lerakás nem tiltott, de a „másnak kellő” lapok pontlevonással járnak (`giftPenalty`): minél kisebb a bemondás, annál nagyobb a levonás.
- A botok és a Tipp **olvassák a talont**: az előző licitáló vállalásából következtetnek, mit tehetett le (ulti után inkább kis lapokat, betli után magasakat).
- **Gyűjtés / felvétel**: a passz sem ingyenes; felvenni csak akkor érdemes, ha a gyűjtés jobb az azonnali legjobb lehetőségnél (`passBase = passValue()/2`, `MIN_PICK_P = 0.3`).

## Betli

- Talonozásnál nincs tiltás: a veszélyes lapoknak kell lemenniük. A VII és VIII soha nem megy le.
- A Tipp betlinél **minden lehetséges lerakást** lemér próbajátékkal (`N_PRE=24`), a legjobbakat pontosabban is.
- **Ász betliben**: csak 7–8 lapos színben tartható. 6 lapnál már nagyon kockázatos (a kint lévő két lap elosztásán múlik), rövidebb színben a védők addig hívják a színt, amíg rá nem kell tenni. Csak színhiánnyal lehet idő előtt eldobni.
- **Védekezés**: a felülütési kényszer mindenkire vonatkozik, a védő társára is. A védő minden hívást végigszámol az ismeretlen lapok lehetséges elosztásain, és azt hívja, amelyiknél a felvevő a legnagyobb eséllyel viszi az ütést. A felvevő által elsőként hívott színt (valószínűleg rövid) kevésbé hívja vissza.
- Ha a felvevő az ütést már nem viszi, a védő a legmagasabb lapját dobja (a kis lapokat az alá hívásokhoz tartja).
- **Terített betli**: az első ütés után a felvevő lapjai kiterítődnek (napló, értesítés, „terítve” jelzés).

## Licit, kontra, játékmenet

- A sikertelen durchmars vagy betli a leosztást nem állítja meg, ha még más része is van; ha minden rész eldőlt, a leosztás véget ér (`allDecided`). Partis játék a végéig megy.
- A **parti kontrázható** a védők 20+20-ával is (`PARTI_MARGIN = [60,40,40]`).
- Sima durchmars színtelen sorrenddel megy (MAUSZ szerint), adus változatnál az adu sorrend.
- **Felmutatás** („Felmutatom”): ha egy ütés elején biztos, hogy minden ütés az egyik félé. Mindkét irányban működik. A botok maguktól felmutatnak, ilyenkor a két bot maradék lapja is látszik.
- Felmutatásnál ultis felvevő az adu VII-et az utolsó ütésre tartja.
- Elnevezés: a piros szín nélküli durchmars neve **Redurchmars**.

## Felület

- A játék neve **Rablóulti**, a botok **Gellért** és **Samu**.
- Az Új játék megerősítő felirata: „Biztos?” (telefonon is ráfér).
- Kényszervállalásnál piros „!” gomb nyitja a magyarázatot (nem takarja a licit gombot).
- A licitlista nem külön görgethető doboz; `⤢` gomb teljes képernyőn mutatja.
- Telefonon álló helyzetben alkalmazás-nézet: csak a döntési panel görög, a fő gombsor alul ragad.
- A Tipp nincs mindig nyitva; a részletek a „▾ Miért?” alatt.
