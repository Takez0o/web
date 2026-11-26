/* Filmový festival Postupák – odpočet.
 * Bez knihoven, kompatibilní se staršími prohlížeči (ES2017, žádné ?. ani ??).
 * Veškerý text se vkládá přes textContent, nikdy innerHTML, takže ani zpráva
 * ze správy nemůže do stránky vložit skript.
 */
(function () {
  "use strict";

  var TZ = "Europe/Prague";

  /* Stav odpočtu. Ve finální verzi ho dodá sdílené úložiště a změnu pošle
   * všem otevřeným stránkám. V náhledu ho mění lišta dole. */
  var state = {
    startedAt: null,                       // čas ručního spuštění, nebo null
    endAt: "2026-12-09T10:00:00+01:00",   // pevný konec: 9. 12. 2026 10:00 pražského času
    endMessage: "Díky, že jste s námi vydrželi až do poslední vteřiny.",
    plannedStart: "2026-12-07"
  };

  var clockOffset = 0; // posun hodin (v náhledu pro simulaci, později oprava podle času serveru)
  function now() { return Date.now() + clockOffset; }

  var app = document.getElementById("app");
  if (!app) return;
  function byId(id) { return document.getElementById(id); }

  var UNITS = ["d", "h", "m", "s"];
  var FORMS = {
    d: ["den", "dny", "dní"],
    h: ["hodina", "hodiny", "hodin"],
    m: ["minuta", "minuty", "minut"],
    s: ["sekunda", "sekundy", "sekund"]
  };
  function plural(n, f) { return n === 1 ? f[0] : (n >= 2 && n <= 4 ? f[1] : f[2]); }

  var unitEls = {}, lblEls = {};
  UNITS.forEach(function (u) {
    unitEls[u] = app.querySelector('[data-u="' + u + '"]');
    lblEls[u] = app.querySelector('[data-l="' + u + '"]');
  });

  /* Formátování data v pražském čase. Když Intl časová pásma nezná
   * (velmi staré prohlížeče), zůstane text, který je přímo v HTML. */
  var fmt = null;
  try {
    fmt = {
      date: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      time: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
      day: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }),
      zone: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, timeZoneName: "short" })
    };
  } catch (e) { fmt = null; }

  function zoneName(d) {
    if (!fmt || !fmt.zone.formatToParts) return "";
    var parts = fmt.zone.formatToParts(d);
    for (var i = 0; i < parts.length; i++) if (parts[i].type === "timeZoneName") return parts[i].value;
    return "";
  }

  function endMs() {
    var t = Date.parse(state.endAt);
    return isNaN(t) ? Date.parse("2026-12-09T09:00:00Z") : t;
  }

  function phase() {
    if (now() >= endMs()) return "ended";
    return state.startedAt ? "running" : "waiting";
  }

  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

  function setDigits(u, str, animate) {
    var el = unitEls[u];
    if (!el) return;
    while (el.children.length < str.length) {
      var s = document.createElement("span");
      s.className = "d";
      el.appendChild(s);
    }
    while (el.children.length > str.length) el.removeChild(el.lastChild);
    for (var i = 0; i < str.length; i++) {
      var slot = el.children[i];
      var ch = str.charAt(i);
      if (slot.textContent !== ch) {
        slot.textContent = ch;
        if (animate) {
          slot.classList.remove("tick");
          void slot.offsetWidth; // restart animace
          slot.classList.add("tick");
        }
      }
    }
  }

  function renderEnd(ph) {
    var end = new Date(endMs());
    var timeEl = byId("endText");
    if (timeEl) timeEl.setAttribute("datetime", end.toISOString());
    if (fmt) {
      setText(byId("endDate"), fmt.date.format(end));
      setText(byId("endTime"), "v " + fmt.time.format(end));
      var z = zoneName(end);
      setText(byId("tzText"), z ? "pražský čas · " + z : "pražský čas");
    }
    setText(byId("endLabel"), "Konec odpočtu");
  }

  var lastPhase = null;

  function render() {
    var ph = phase();
    var changed = ph !== lastPhase;
    if (changed) app.setAttribute("data-state", ph);

    if (ph === "waiting") {
      UNITS.forEach(function (u) { setDigits(u, "––", false); setText(lblEls[u], FORMS[u][2]); });
      byId("clock").setAttribute("aria-label", "Odpočet zatím neběží");
      setText(byId("boxHead"), "Odpočet zatím neběží");
    } else {
      var total = ph === "ended" ? 0 : Math.max(0, Math.ceil((endMs() - now()) / 1000));
      var v = {
        d: Math.floor(total / 86400),
        h: Math.floor((total % 86400) / 3600),
        m: Math.floor((total % 3600) / 60),
        s: total % 60
      };
      var animate = ph === "running" && !changed;
      UNITS.forEach(function (u) {
        setDigits(u, String(v[u]).padStart(2, "0"), animate);
        setText(lblEls[u], plural(v[u], FORMS[u]));
      });
      byId("clock").setAttribute("aria-label",
        "Zbývá " + v.d + " " + plural(v.d, FORMS.d) + ", " +
        v.h + " " + plural(v.h, FORMS.h) + ", " + v.m + " " + plural(v.m, FORMS.m));
      setText(byId("boxHead"), ph === "ended" ? "Čas vypršel" : "Do konce odpočtu zbývá");
    }

    if (changed) {
      renderEnd(ph);
      var planned = "7. prosince 2026";
      if (fmt) planned = fmt.day.format(new Date(state.plannedStart + "T12:00:00Z"));
      setText(byId("statusText"), { waiting: "Čeká na spuštění", running: "Odpočet běží", ended: "Odpočet skončil" }[ph]);
      setText(byId("note"), {
        waiting: "Pořadatel odpočet ručně spustí " + planned + ". Stránku nemusíte obnovovat, změna se objeví sama.",
        running: "Odpočítáváme do pevně daného konce. Stejný čas teď vidí všichni.",
        ended: String(state.endMessage || "").slice(0, 400)
      }[ph]);
      if (lastPhase !== null) {
        var stamp = byId("stamp");
        stamp.classList.remove("thump");
        void stamp.offsetWidth;
        stamp.classList.add("thump");
      }
      lastPhase = ph;
    }
  }

  var timer = null;
  function loop() {
    render();
    clearTimeout(timer);
    // další překreslení přesně na začátku další sekundy
    timer = setTimeout(loop, 1000 - (now() % 1000) + 15);
  }

  // Po návratu do záložky (mobil ji mohl uspat) hned přepočítat.
  document.addEventListener("visibilitychange", function () { if (!document.hidden) loop(); });
  window.addEventListener("pageshow", loop);

  /* ---------- Náhled stavů (ve finální verzi se odstraní) ---------- */
  var preview = byId("preview");
  if (preview) {
    var presets = {
      waiting: function () { clockOffset = 0; state.startedAt = null; },
      running: function () { clockOffset = 0; state.startedAt = new Date().toISOString(); },
      last: function () { state.startedAt = new Date().toISOString(); clockOffset = endMs() - 10500 - Date.now(); },
      ended: function () { state.startedAt = new Date().toISOString(); clockOffset = endMs() + 60000 - Date.now(); }
    };
    var hashFor = { waiting: "pred", running: "bezi", last: "posledni", ended: "konec" };
    var buttons = preview.querySelectorAll("button[data-p]");

    var choose = function (p) {
      presets[p]();
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-p") === p));
      }
      loop();
    };
    var fromHash = function () {
      for (var k in hashFor) if ("#" + hashFor[k] === location.hash) return k;
      return "waiting";
    };

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var p = this.getAttribute("data-p");
        choose(p);
        try { history.replaceState(null, "", "#" + hashFor[p]); } catch (e) { /* nevadí */ }
      });
    }
    window.addEventListener("hashchange", function () { choose(fromHash()); });
    choose(fromHash());
  } else {
    loop();
  }
})();
