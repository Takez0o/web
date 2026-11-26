/* Upraví site/stav.json podle formuláře „Ovládání odpočtu“ v GitHub Actions.
 *
 * Vstupy přicházejí v proměnných prostředí AKCE, KONEC, ZPRAVA (nikdy se
 * nevkládají přímo do shellu). Každý vstup se kontroluje; při chybě skript
 * skončí s českou hláškou a soubor nezmění.
 *
 * Spuštění: node scripts/stav.js   (Node 18+ s plnou podporou Intl)
 */
"use strict";

(function (factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    if (require.main === module) module.exports.main();
  } else if (typeof window !== "undefined") {
    window.PostupakSkript = factory(); // jen kvůli testům v prohlížeči
  }
})(function () {
  var TZ = "Europe/Prague";
  var MAX_MESSAGE = 400;
  var ACTIONS = {
    "Spustit odpočet": "spustit",
    "Jen upravit konec nebo zprávu": "upravit",
    "Vrátit do stavu před spuštěním": "vratit"
  };

  function UserError(message) { this.name = "UserError"; this.message = message; }
  UserError.prototype = Object.create(Error.prototype);

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  var partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });

  /* Pražský „nástěnný“ čas pro daný okamžik UTC. */
  function pragueWall(utcMs) {
    var out = {};
    partsFormatter.formatToParts(new Date(utcMs)).forEach(function (p) {
      if (p.type !== "literal") out[p.type] = parseInt(p.value, 10);
    });
    if (out.hour === 24) out.hour = 0;
    return out;
  }

  /* Posun Prahy proti UTC v minutách (60 v zimě, 120 v létě). */
  function pragueOffset(utcMs) {
    var w = pragueWall(utcMs);
    var asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
  }

  /* Převede pražský čas na ISO řetězec s posunem, např. 2026-12-09T10:00:00+01:00. */
  function pragueToIso(y, mo, d, h, mi) {
    var guess = Date.UTC(y, mo - 1, d, h, mi);
    var check = new Date(guess);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) {
      throw new UserError("Datum " + d + ". " + mo + ". " + y + " " + h + ":" + pad(mi) + " neexistuje.");
    }
    var off = pragueOffset(guess - pragueOffset(guess) * 60000);
    var utc = guess - off * 60000;
    var w = pragueWall(utc);
    if (w.year !== y || w.month !== mo || w.day !== d || w.hour !== h || w.minute !== mi) {
      throw new UserError("Čas " + h + ":" + pad(mi) + " v tento den v Praze neexistuje (přechod na letní čas). Zvol jiný čas.");
    }
    var sign = off >= 0 ? "+" : "-";
    var abs = Math.abs(off);
    return {
      iso: y + "-" + pad(mo) + "-" + pad(d) + "T" + pad(h) + ":" + pad(mi) + ":00" + sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60),
      ms: utc
    };
  }

  /* Přijímá „9.12.2026 10:00“, „9. 12. 2026 10:00“ i „2026-12-09 10:00“. */
  function parseEnd(text) {
    var s = String(text).trim();
    var m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*(?:v\s*)?(\d{1,2}):(\d{2})$/i.exec(s);
    var y, mo, d, h, mi;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; h = +m[4]; mi = +m[5]; }
    else {
      m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(s);
      if (!m) throw new UserError("Konec „" + s.slice(0, 40) + "“ nerozumím. Napiš ho třeba jako 9.12.2026 10:00.");
      y = +m[1]; mo = +m[2]; d = +m[3]; h = +m[4]; mi = +m[5];
    }
    if (y < 2026 || y > 2030) throw new UserError("Rok " + y + " je mimo povolený rozsah 2026–2030.");
    return pragueToIso(y, mo, d, h, mi);
  }

  function cleanMessage(text) {
    var raw = String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
    if (!raw) throw new UserError("Závěrečná zpráva je prázdná.");
    var length = Array.from(raw).length;
    if (length > MAX_MESSAGE) throw new UserError("Zpráva má " + length + " znaků, maximum je " + MAX_MESSAGE + ".");
    return raw;
  }

  function isoUtcNow(nowMs) { return new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, "Z"); }

  function validIso(v) { return typeof v === "string" && !isNaN(Date.parse(v)); }

  function checkCurrent(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new UserError("Soubor stav.json je poškozený.");
    if (!validIso(state.endAt)) throw new UserError("Soubor stav.json nemá platný konec odpočtu.");
    if (state.startedAt !== null && state.startedAt !== undefined && !validIso(state.startedAt)) {
      throw new UserError("Soubor stav.json má neplatný čas spuštění.");
    }
  }

  var csDateTime = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
  function human(iso) { return csDateTime.format(new Date(Date.parse(iso))); }

  /* Čistá funkce: vrátí nový stav a shrnutí, nebo vyhodí UserError. */
  function applyChange(current, input, nowMs) {
    checkCurrent(current);
    var action = ACTIONS[String(input.akce || "").trim()];
    if (!action) throw new UserError("Neznámá akce „" + String(input.akce || "").slice(0, 40) + "“.");

    var next = {
      startedAt: current.startedAt || null,
      endAt: current.endAt,
      endMessage: typeof current.endMessage === "string" ? current.endMessage : "",
      plannedStart: typeof current.plannedStart === "string" ? current.plannedStart : null,
      updatedAt: current.updatedAt || null
    };
    var notes = [];
    var konec = String(input.konec || "").trim();
    var zprava = String(input.zprava || "").trim();

    if (konec) {
      var end = parseEnd(konec);
      if (end.ms <= nowMs) throw new UserError("Nový konec (" + human(end.iso) + ") už uplynul.");
      next.endAt = end.iso;
      notes.push("Nový konec: " + human(end.iso) + ".");
    }
    if (zprava) {
      next.endMessage = cleanMessage(zprava);
      notes.push("Nová závěrečná zpráva: „" + next.endMessage + "“");
    }

    if (action === "spustit") {
      if (Date.parse(next.endAt) <= nowMs) throw new UserError("Konec odpočtu už uplynul. Nejdřív zadej nový konec.");
      if (next.startedAt) notes.unshift("Odpočet už běžel od " + human(next.startedAt) + ", nechávám ho běžet.");
      else { next.startedAt = isoUtcNow(nowMs); notes.unshift("Odpočet je spuštěný."); }
    } else if (action === "vratit") {
      next.startedAt = null;
      notes.unshift("Odpočet je vrácený do stavu před spuštěním.");
    } else if (!konec && !zprava) {
      throw new UserError("Nevyplnil jsi nový konec ani zprávu, takže není co měnit.");
    }

    next.updatedAt = isoUtcNow(nowMs);
    notes.push("Odpočet končí " + human(next.endAt) + " (pražský čas).");
    return { state: next, notes: notes };
  }

  function main() {
    var fs = require("fs");
    var path = require("path");
    var file = path.join(__dirname, "..", "site", "stav.json");
    var summaryFile = process.env.GITHUB_STEP_SUMMARY;

    function summary(lines) {
      var text = lines.join("\n") + "\n";
      if (summaryFile) fs.appendFileSync(summaryFile, text, "utf8");
      process.stdout.write(text);
    }

    try {
      var current = JSON.parse(fs.readFileSync(file, "utf8"));
      var result = applyChange(current, {
        akce: process.env.AKCE,
        konec: process.env.KONEC,
        zprava: process.env.ZPRAVA
      }, Date.now());
      fs.writeFileSync(file, JSON.stringify(result.state, null, 2) + "\n", "utf8");
      summary(["### Hotovo", ""].concat(result.notes.map(function (n) { return "- " + n; }))
        .concat(["", "Změna se návštěvníkům objeví obvykle do 10 minut (GitHub Pages drží soubory v mezipaměti). Konec odpočtu je přesný vždy."]));
    } catch (err) {
      var message = err instanceof UserError ? err.message
        : (err && err.code === "ENOENT" ? "Soubor stav.json chybí." : "Neočekávaná chyba: " + (err && err.message));
      summary(["### Nic se nezměnilo", "", message]);
      process.stdout.write("::error::" + message.replace(/[\r\n%]/g, " ") + "\n");
      process.exitCode = 1;
    }
  }

  return {
    applyChange: applyChange,
    parseEnd: parseEnd,
    pragueOffset: pragueOffset,
    cleanMessage: cleanMessage,
    UserError: UserError,
    main: main
  };
});
