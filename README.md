# Tipovačka F1

Statická webová appka (žádný build, žádné npm) nad Firebase — Firestore jako databáze,
Firebase Auth jako přihlášení. Nasazuje se na GitHub Pages.

## Soubory

| Soubor | K čemu |
|---|---|
| `index.html` | kostra stránky, načítá SDK, konfiguraci a appku |
| `app.css` | styly |
| `firebase-config.js` | konfigurace Firebase, `ADMIN_UID`, doména hráčských e-mailů |
| `app.js` | celá logika appky |
| `firestore.rules` | serverová pravidla — bez nich je databáze otevřená |
| `tools/migrate.html` | admin nástroj: záloha, import, přemapování starých tipů, mazání hráčů |
| `tools/migrate.js` | logika admin nástroje |
| `tools/smoke-test.js` | rychlá kontrola zápisové vrstvy — `node tools/smoke-test.js` |

`apiKey` ve `firebase-config.js` není tajemství — je to veřejný identifikátor projektu.
Přístup k datům hlídají výhradně `firestore.rules`.

## Nasazení na GitHub Pages

1. Nahraj obsah repozitáře do větve `main`.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, složka `/ (root)`.
3. Po prvním nasazení si poznamenej výslednou doménu (`<uzivatel>.github.io`).

## Nastavení Firebase Console

1. **Firestore Database** → vytvoř databázi (produkční režim).
2. **Authentication → Sign-in method** → zapni *Email/Password* a *Google*.
3. **Authentication → Settings → Authorized domains** → přidej doménu z GitHub Pages
   (`<uzivatel>.github.io`). Bez toho se přihlášení nespustí.
4. **Firestore → Rules** → vlož obsah `firestore.rules`.

## Doplnění ADMIN_UID

UID správce vznikne až prvním přihlášením Googlem:

1. Otevři appku, na přihlašovací obrazovce klikni na **Správa** a přihlas se Googlem.
2. Firebase Console → Authentication → Users → zkopíruj *User UID* svého účtu.
3. Vlož ho na dvě místa:
   - `firebase-config.js` → `var ADMIN_UID = "…";`
   - `firestore.rules` → místo `ADMIN_GOOGLE_UID_DOPLNIT`
4. Změněná pravidla publikuj v konzoli, změněný `firebase-config.js` nahraj do repozitáře.

Dokud UID nedoplníš, nikdo nemá právo zapisovat do závodů, ročníků ani konfigurace.

## Runbook: hráč zapomněl heslo

Hráči se přihlašují přezdívkou; ta se převádí na technický e-mail
`<přezdívka-bez-diakritiky>@hraci.f1-tipovacka.app` (viz `PLAYER_MAIL_DOMAIN`).
Doména není skutečná, takže e-mail s obnovou hesla nikam nedorazí — heslo mění správce:

1. Firebase Console → Authentication → Users.
2. Najdi účet podle e-mailu odvozeného z přezdívky.
3. Nabídka u řádku (⋮) → *Reset password* nepoužívej, vyber *Edit user* a nastav nové heslo ručně.
4. Nové heslo předej hráči osobně a řekni mu, ať si ho v klidu změní… to appka neumí,
   takže platí: heslo zná i správce. Neposílej takové heslo veřejným kanálem.

Smazáním uživatele v Authentication se **nesmaže** jeho dokument v `tips/` — ten zůstane
v žebříčku. Pokud má zmizet, smaž ho ve Firestore ručně.

## Runbook: záloha dat

1. Otevři `tools/migrate.html` (na nasazené doméně, ne ze souboru — jinak Auth neprojde).
2. Přihlas se Googlem jako správce.
3. **Stáhnout zálohu JSON** — uloží všechny čtyři kolekce do jednoho souboru.
4. Zálohu ukládej mimo repozitář (`data/` je v `.gitignore`).

Kromě čtyř kolekcí obsahuje záloha i klíč `tipsPrivate` — soukromé dokumenty
`tips/{uid}/private/data` s tipy, které ještě nejsou po uzávěrce odkryté. Bez něj
není obnova úplná: hráčům by se vrátily jen tipy na už uzavřené sekce.

Obnova: obsah souboru vlož do pole **Import** a potvrď. Dokumenty se stejným id se přepíšou,
ostatní zůstanou — import nic nemaže.

## Runbook: tipy z doby před přechodem

Staré dokumenty v `tips/` mají id, které neodpovídá žádnému účtu v Authentication.
V `tools/migrate.html` zadej staré uid a přezdívku hráče, který už má nový účet;
nástroj přenese `races` a `season` do soukromého dokumentu nového účtu a starý dokument smaže.
Veřejně se tipy ukážou až po uzávěrce — odkryje je appka, až ji načteš přihlášený jako správce.
Pozor: tipy, které už hráč pod novým účtem zadal, se přepíšou těmi starými.

## Runbook: hráč mi obsadil cizí jméno / úklid spam účtů

V `tools/migrate.html` → karta **Smazat hráče** zadej přezdívku nebo uid a potvrď.
Nástroj smaže dokument v `tips/` i s tipy — nejde to vrátit, udělej si nejdřív zálohu.
Smazáním v `tips/` **nezaniká účet** v Authentication: dokud ho nesmažeš i tam
(Console → Authentication → Users), může se hráč přihlásit a zaregistrovat se znovu.
U obsazeného jména smaž nejdřív účet v Authentication, teprve potom dokument v `tips/`.
