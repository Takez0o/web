/* Filmový festival Postupák – živý odpočet na hlavní stránce.
 * Stav (spuštěno / konec / závěrečná zpráva) čte ze souboru stav.json, který mění
 * pořadatel přes GitHub Actions. Otevřené stránky si ho samy znovu načítají.
 * Veškerý text se vkládá přes textContent, nikdy innerHTML.
 */
(function () {
  "use strict";

  var core = window.PostupakStav;
  var app = document.getElementById("app");
  if (!core || !app) return;

  var STATE_URL = "/stav.json";
  var POLL_ACTIVE = 15000;  // před spuštěním a během odpočtu
  var POLL_ENDED = 60000;   // po skončení stačí občas (kvůli úpravě zprávy)

  var UNITS = ["d", "h", "m", "s"];
  var FORMS = {
    d: ["den", "dny", "dní"],
    h: ["hodina", "hodiny", "hodin"],
    m: ["minuta", "minuty", "minut"],
    s: ["sekunda", "sekundy", "sekund"]
  };
  var STATUS = {
    loading: "Načítám stav",
    waiting: "Čeká na spuštění",
    running: "Odpočet běží",
    ended: "Odpočet skončil"
  };

  var state = core.cacheRead();  // poslední známý stav, nebo null
  var loaded = false;            // odpověď serveru už dorazila
  var loadFailed = false;        // první načtení selhalo a nemáme nic lepšího
  var clockOffset = 0;           // oprava hodin zařízení podle serveru
  var lastFetch = 0;
  var pollTimer = null, tickTimer = null;
  var lastPhase = null, lastNoteKey = null;

  function now() { return Date.now() + clockOffset; }
  function byId(id) { return document.getElementById(id); }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

  var unitEls = {}, lblEls = {};
  UNITS.forEach(function (u) {
    unitEls[u] = app.querySelector('[data-u="' + u + '"]');
    lblEls[u] = app.querySelector('[data-l="' + u + '"]');
  });

  function current() { return state || core.DEFAULTS; }

  function phase() {
    var s = current();
    if (now() >= Date.parse(s.endAt)) return "ended";   // konec platí i bez spojení
    if (!state && !loadFailed) return "loading";
    return s.startedAt ? "running" : "waiting";
  }

  function setDigits(u, str, animate) {
    var el = unitEls[u];
    if (!el) return;
    while (el.children.length < str.length) {
      var span = document.createElement("span");
      span.className = "d";
      el.appendChild(span);
    }
    while (el.children.length > str.length) el.removeChild(el.lastChild);
    for (var i = 0; i < str.length; i++) {
      var slot = el.children[i];
      var ch = str.charAt(i);
      if (slot.textContent !== ch) {
        slot.textContent = ch;
        if (animate) {
          slot.classList.remove("tick");
          void slot.offsetWidth;
          slot.classList.add("tick");
        }
      }
    }
  }

  function renderEnd() {
    var s = current();
    var timeEl = byId("endText");
    if (timeEl) timeEl.setAttribute("datetime", s.endAt);
    var f = core.formatEnd(s.endAt);
    if (f) {
      setText(byId("endDate"), f.date);
      setText(byId("endTime"), "v " + f.time);
      setText(byId("tzText"), f.zone ? "pražský čas · " + f.zone : "pražský čas");
    }
  }

  function noteFor(ph) {
    var s = current();
    if (ph === "loading") return "Načítám aktuální stav odpočtu.";
    if (ph === "running") return "Odpočítáváme do pevně daného konce. Stejný čas teď vidí všichni.";
    if (ph === "ended") return s.endMessage;
    var planned = core.formatDay(s.plannedStart);
    var text = planned
      ? "Pořadatel odpočet ručně spustí " + planned + ". Stránku nemusíte obnovovat, změna se objeví sama."
      : "Až pořadatel odpočet spustí, objeví se tu sám. Stránku nemusíte obnovovat.";
    if (loadFailed && !loaded) text += " Aktuální stav se teď nepodařilo načíst, zkouším to znovu.";
    return text;
  }

  function render() {
    var ph = phase();
    var changed = ph !== lastPhase;
    if (changed) app.setAttribute("data-state", ph);

    if (ph === "loading" || ph === "waiting") {
      UNITS.forEach(function (u) { setDigits(u, "––", false); setText(lblEls[u], FORMS[u][2]); });
      byId("clock").setAttribute("aria-label", "Odpočet zatím neběží");
      setText(byId("boxHead"), ph === "loading" ? "Načítám odpočet" : "Odpočet zatím neběží");
    } else {
      var total = ph === "ended" ? 0 : Math.max(0, Math.ceil((Date.parse(current().endAt) - now()) / 1000));
      var v = {
        d: Math.floor(total / 86400),
        h: Math.floor((total % 86400) / 3600),
        m: Math.floor((total % 3600) / 60),
        s: total % 60
      };
      var animate = ph === "running" && !changed;
      UNITS.forEach(function (u) {
        setDigits(u, String(v[u]).padStart(2, "0"), animate);
        setText(lblEls[u], core.plural(v[u], FORMS[u]));
      });
      byId("clock").setAttribute("aria-label",
        "Zbývá " + v.d + " " + core.plural(v.d, FORMS.d) + ", " +
        v.h + " " + core.plural(v.h, FORMS.h) + ", " +
        v.m + " " + core.plural(v.m, FORMS.m));
      setText(byId("boxHead"), ph === "ended" ? "Čas vypršel" : "Do konce odpočtu zbývá");
    }

    var noteKey = ph + "|" + current().endMessage + "|" + current().plannedStart + "|" + loadFailed + "|" + loaded;
    if (noteKey !== lastNoteKey) {
      setText(byId("note"), noteFor(ph));
      lastNoteKey = noteKey;
    }

    if (changed) {
      setText(byId("statusText"), STATUS[ph]);
      // razítko „dopadne“ při skutečné změně stavu, ne při prvním vykreslení
      if (lastPhase !== null && lastPhase !== "loading") {
        var stamp = byId("stamp");
        stamp.classList.remove("thump");
        void stamp.offsetWidth;
        stamp.classList.add("thump");
      }
      lastPhase = ph;
    }
  }

  function tick() {
    render();
    clearTimeout(tickTimer);
    // po skončení stačí kontrolovat jednou za minutu, jinak přesně na začátku sekundy
    var delay = lastPhase === "ended" ? 60000 : 1000 - (now() % 1000) + 15;
    tickTimer = setTimeout(tick, delay);
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (document.hidden) return; // ve skryté záložce nenačítat; po návratu se načte hned
    pollTimer = setTimeout(poll, lastPhase === "ended" ? POLL_ENDED : POLL_ACTIVE);
  }

  function poll() {
    lastFetch = Date.now();
    core.fetchState(STATE_URL, function (err, fresh, offset) {
      if (err) {
        if (!state) loadFailed = true;
      } else {
        state = fresh;
        loaded = true;
        loadFailed = false;
        clockOffset = core.usableOffset(offset);
        core.cacheWrite(fresh);
        renderEnd();
      }
      tick();
      schedulePoll();
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearTimeout(pollTimer); return; }
    tick();
    if (Date.now() - lastFetch > 5000) poll(); else schedulePoll();
  });
  window.addEventListener("online", poll);
  window.addEventListener("pageshow", function (e) { if (e.persisted) { tick(); poll(); } });

  // Kdyby server neodpověděl, po limitu ukázat výchozí stav místo „Načítám“.
  setTimeout(function () { if (!state) { loadFailed = true; tick(); } }, 9000);

  renderEnd();
  tick();
  poll();
})();
