# Tajný odpočet – Gymnázium Postupická

Odpočet k odhalení, které proběhne 9. 12. 2026 v 10:00 pražského času.

- Veřejná stránka: https://vyskocilovi.cz/
- Správa pro pořadatele: https://vyskocilovi.cz/sprava/
- Ovládání odpočtu: záložka **Actions → Ovládání odpočtu → Run workflow**

## Jak to funguje

Web je statický a hostuje ho GitHub Pages. Aktuální stav odpočtu je v souboru
[`site/stav.json`](site/stav.json):

| Pole | Význam |
|---|---|
| `startedAt` | Kdy pořadatel odpočet spustil (UTC), nebo `null`, když ještě neběží |
| `endAt` | Pevný čas odhalení, ISO 8601 s posunem, výchozí `2026-12-09T10:00:00+01:00` |
| `endMessage` | Zpráva, která se ukáže na nule, nejvýš 400 znaků |
| `plannedStart` | Plánovaný den spuštění, zobrazí se před spuštěním |
| `updatedAt` | Kdy se stav naposledy změnil |

Stránka si `stav.json` načítá každých 15 sekund (po odhalení jednou za minutu)
a hned po návratu do záložky, takže změnu uvidí i lidé s otevřenou stránkou.
Čas odhalení se počítá v prohlížeči z pevného času, takže odpočet doběhne na
nulu přesně i bez připojení. Posun hodin telefonu se opravuje podle hlavičky
`Date` ze serveru.

Stavy stránky:

| Stav | Nadpis | Co je vidět |
|---|---|---|
| Před spuštěním | Něco se chystá… | pomlčky místo čísel, datum odhalení, kdy se odpočet rozběhne |
| Odpočet běží | Už se to blíží… | dny, hodiny, minuty, sekundy; posledních 10 s červeně |
| Odhaleno | Je to tady. | nuly, záblesk (u otevřených stránek) a zpráva ze `stav.json` |

Web záměrně neprozrazuje, co se odhalí.

## Ovládání odpočtu (pro pořadatele)

1. Otevři https://vyskocilovi.cz/sprava/ a klikni na **Otevřít ovládání**.
2. Klikni na **Run workflow** a vyber akci:
   - **Spustit odpočet**: zapne odpočet do pevného času odhalení.
   - **Jen upravit konec nebo zprávu**: změní čas odhalení nebo zprávu a stav nechá být.
   - **Vrátit do stavu před spuštěním**: odpočet znovu schová.
3. Čas (např. `9.12.2026 10:00`, pražský čas) a zprávu vyplň jen při změně.
4. Potvrď zeleným **Run workflow**. Běh trvá asi minutu a půl. Nasazení vyčistí
   mezipaměť GitHub Pages, takže nový stav je hned venku a otevřené stránky
   si ho načtou nejpozději do 15 sekund.

Skript [`scripts/stav.js`](scripts/stav.js) každý vstup zkontroluje. Při chybě
(neplatné datum, čas v minulosti, příliš dlouhá zpráva) web nezmění a v
přehledu běhu napíše česky, co je špatně.

## Přístupy a bezpečnost

- Odpočet může ovládat jen člověk s právem **Write** k tomuto repozitáři.
  Pořadatele přidej v **Settings → Collaborators**.
- Ve webu nejsou žádná hesla ani klíče. Ochranu zajišťuje přihlášení na GitHub.
- Vstupy formuláře jdou do skriptu přes proměnné prostředí, ne přímo do shellu.
- Stránky mají přísnou Content Security Policy: jen vlastní skripty a styly a
  písma z Google Fonts. Text ze `stav.json` se vkládá jen jako prostý text.

## Úpravy webu

Všechno, co se zveřejní, je ve složce `site/`:

- `index.html`, `styles.css`, `app.js`: hlavní stránka s odpočtem
- `stav.js`: načtení a kontrola stavu (sdílené)
- `sprava/`: stránka pro pořadatele
- `404.html`, `favicon.svg`, `grain.svg` (zrno), `distress.svg` (opotřebovaný tisk), `robots.txt`

Po pushi do `main` se web sám znovu nasadí (workflow **Nasazení webu**).
