/* Tajný odpočet – hlavní stránka.
 * Stav (spuštěno / čas odhalení / závěrečná zpráva) čte ze stav.json, který mění
 * pořadatel přes GitHub Actions. Otevřené stránky si ho samy znovu načítají.
 * Veškerý text se vkládá přes textContent, nikdy innerHTML.
 */
(function () {
  "use strict";

  var core = window.OdpocetStav;
  var app = document.getElementById("app");
  if (!core || !app) return;

  var STATE_URL = "/stav.json";
  var POLL_ACTIVE = 15000;  // před spuštěním a během odpočtu
  var POLL_ENDED = 60000;   // po odhalení stačí občas (kvůli úpravě zprávy)
  var TEASER_EVERY = 4500;

  var UNITS = ["d", "h", "m", "s"];
  var FORMS = {
    d: ["den", "dny", "dní"],
    h: ["hodina", "hodiny", "hodin"],
    m: ["minuta", "minuty", "minut"],
    s: ["sekunda", "sekundy", "sekund"]
  };
  var STATUS = { loading: "Načítám", waiting: "Čeká na spuštění", running: "Odpočet běží", ended: "Odhaleno" };
  var HEADLINE = { loading: "Něco se chystá…", waiting: "Něco se chystá…", running: "Už se to blíží…", ended: "Je to tady." };
  var TEASERS = {
    loading: ["Jste připraveni?"],
    waiting: ["Jste připraveni?", "9. 12. 2026"],
    running: ["Něco se chystá…", "Jste připraveni?"],
    ended: []
  };

  var state = core.cacheRead();  // poslední známý stav, nebo null
  var loaded = false;
  var loadFailed = false;
  var clockOffset = 0;
  var lastFetch = 0;
  var pollTimer = null, tickTimer = null, teaserTimer = null;
  var lastPhase = null, lastNoteKey = null, teaserIndex = 0;

  function now() { return Date.now() + clockOffset; }
  function byId(id) { return document.getElementById(id); }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

  var unitEls = {}, lblEls = {};
  UNITS.forEach(function (u) {
    unitEls[u] = app.querySelector('[data-u="' + u + '"]');
    lblEls[u] = app.querySelector('[data-l="' + u + '"]');
  });
  var clockEl = byId("clock");

  function current() { return state || core.DEFAULTS; }

  function phase() {
    var s = current();
    if (now() >= Date.parse(s.endAt)) return "ended";   // odhalení platí i bez spojení
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
    if (ph === "ended") return s.endMessage;
    if (ph !== "waiting") return "";
    var planned = core.formatDay(s.plannedStart);
    var text = planned
      ? "Odpočet se rozběhne " + planned + ". Stránku nemusíte obnovovat."
      : "Odpočet se brzy rozběhne. Stránku nemusíte obnovovat.";
    if (loadFailed && !loaded) text += " Aktuální stav se teď nepodařilo načíst, zkouším to znovu.";
    return text;
  }

  /* Pod nadpisem se střídají hesla z plakátů. */
  function startTeaser(ph) {
    clearInterval(teaserTimer);
    var el = byId("teaser");
    var lines = TEASERS[ph] || [];
    teaserIndex = 0;
    el.classList.remove("out");
    setText(el, lines[0] || "");
    if (lines.length < 2) return;
    teaserTimer = setInterval(function () {
      el.classList.add("out");
      setTimeout(function () {
        teaserIndex = (teaserIndex + 1) % lines.length;
        setText(el, lines[teaserIndex]);
        el.classList.remove("out");
      }, 600);
    }, TEASER_EVERY);
  }

  function render() {
    var ph = phase();
    var changed = ph !== lastPhase;
    if (changed) app.setAttribute("data-state", ph);

    if (ph === "loading" || ph === "waiting") {
      UNITS.forEach(function (u) { setDigits(u, "––", false); setText(lblEls[u], FORMS[u][2]); });
      clockEl.setAttribute("aria-label", "Odpočet zatím neběží");
      clockEl.classList.remove("final");
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
      clockEl.classList.toggle("final", ph === "running" && total <= 10);
      clockEl.setAttribute("aria-label", ph === "ended" ? "Odpočet skončil"
        : "Do odhalení zbývá " + v.d + " " + core.plural(v.d, FORMS.d) + ", " +
          v.h + " " + core.plural(v.h, FORMS.h) + ", " + v.m + " " + core.plural(v.m, FORMS.m));
    }

    var noteKey = ph + "|" + current().endMessage + "|" + current().plannedStart + "|" + loadFailed + "|" + loaded;
    if (noteKey !== lastNoteKey) {
      setText(byId("note"), noteFor(ph));
      lastNoteKey = noteKey;
    }

    if (changed) {
      setText(byId("statusText"), STATUS[ph]);
      setText(byId("headline"), HEADLINE[ph]);
      startTeaser(ph);
      // záblesk jen při živém přechodu z odpočtu na odhalení
      if (ph === "ended" && lastPhase === "running") {
        var flash = byId("flash");
        flash.classList.remove("go");
        void flash.offsetWidth;
        flash.classList.add("go");
      }
      lastPhase = ph;
    }
  }

  function tick() {
    render();
    clearTimeout(tickTimer);
    var delay = lastPhase === "ended" ? 60000 : 1000 - (now() % 1000) + 15;
    tickTimer = setTimeout(tick, delay);
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
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

  setTimeout(function () { if (!state) { loadFailed = true; tick(); } }, 9000);

  renderEnd();
  tick();
  poll();
})();
