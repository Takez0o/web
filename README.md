# Filmový festival Postupák

Web s živým odpočtem pro Filmový festival Postupák na Gymnáziu Postupická.

- Veřejná stránka: https://vyskocilovi.cz/
- Správa pro pořadatele: https://vyskocilovi.cz/sprava/
- Ovládání odpočtu: záložka **Actions → Ovládání odpočtu → Run workflow**

## Jak to funguje

Web je statický a hostuje ho GitHub Pages. Aktuální stav odpočtu je v souboru
[`site/stav.json`](site/stav.json):

| Pole | Význam |
|---|---|
| `startedAt` | Kdy pořadatel odpočet spustil (UTC), nebo `null`, když ještě neběží |
| `endAt` | Pevný konec odpočtu, ISO 8601 s posunem, výchozí `2026-12-09T10:00:00+01:00` |
| `endMessage` | Závěrečná zpráva po skončení, nejvýš 400 znaků |
| `plannedStart` | Plánovaný den spuštění, zobrazí se před spuštěním |
| `updatedAt` | Kdy se stav naposledy změnil |

Stránka si `stav.json` načítá každých 15 sekund (po skončení jednou za minutu)
a hned po návratu do záložky. Lidé, kteří mají stránku otevřenou, tak změnu
uvidí sami. Konec se počítá z pevného času, takže odpočet doběhne na nulu i
bez připojení a nezávisle na tom, jestli je počítač pořadatele zapnutý.
Posun hodin telefonu se opravuje podle hlavičky `Date` ze serveru.

## Ovládání odpočtu (pro pořadatele)

1. Otevři https://vyskocilovi.cz/sprava/ a klikni na **Otevřít ovládání**.
2. Klikni na **Run workflow** a vyber akci:
   - **Spustit odpočet**: zapne odpočet do pevného konce.
   - **Jen upravit konec nebo zprávu**: změní konec nebo zprávu a stav nechá být.
   - **Vrátit do stavu před spuštěním**: odpočet znovu skryje.
3. Konec (např. `9.12.2026 10:00`, pražský čas) a zprávu vyplň jen při změně.
4. Potvrď zeleným **Run workflow**. Běh trvá asi minutu a půl. Nasazení vyčistí
   mezipaměť GitHub Pages, takže nový stav je hned venku a otevřené stránky
   si ho načtou nejpozději do 15 sekund (ověřeno 26. 11. 2026).

Skript [`scripts/stav.js`](scripts/stav.js) každý vstup zkontroluje. Při chybě
(neplatné datum, konec v minulosti, příliš dlouhá zpráva) web nezmění a v
přehledu běhu napíše česky, co je špatně.

## Přístupy a bezpečnost

- Odpočet může ovládat jen člověk s právem **Write** k tomuto repozitáři.
  Pořadatele přidej v **Settings → Collaborators** jako spolupracovníka
  (dostane roli **Write** jen k tomuto repozitáři, ne k ostatním).
- Ve webu nejsou žádná hesla ani klíče. Ochranu zajišťuje přihlášení na GitHub.
- Vstupy formuláře jdou do skriptu přes proměnné prostředí, ne přímo do shellu,
  takže je nejde zneužít ke spuštění příkazů.
- Stránky mají přísnou Content Security Policy: jen vlastní skripty a styly a
  písma z Google Fonts. Text ze `stav.json` se vkládá jen jako prostý text.

## Úpravy webu

Všechno, co se zveřejní, je ve složce `site/`:

- `index.html`: hlavní stránka
- `styles.css`: vzhled všech stránek
- `stav.js`: načtení a kontrola stavu (sdílené)
- `app.js`: odpočet na hlavní stránce
- `sprava/`: stránka pro pořadatele
- `404.html`, `favicon.svg`, `robots.txt`

Po pushi do `main` se web sám znovu nasadí (workflow **Nasazení webu**).
Pro lokální náhled stačí servírovat složku `site/` jakýmkoli statickým serverem,
například `npx serve site`.

## Nastavení repozitáře (jednorázově)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions**: ponech výchozí.
   Oprávnění si workflowy určují samy. Kdyby nastavení zápis z Actions
   zakazovala, povol **Read and write permissions**.
