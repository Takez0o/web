/* Správa odpočtu – zobrazí, co právě vidí návštěvníci. Nic nezapisuje;
 * změny dělá pořadatel přes GitHub Actions (chráněno přihlášením na GitHub). */
(function () {
  "use strict";

  var core = window.OdpocetStav;
  if (!core) return;

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  var state = null, offset = 0, failed = false;

  function render() {
    if (!state) {
      setText("fState", failed ? "Stav se nepodařilo načíst. Zkouším to znovu." : "Načítám…");
      return;
    }
    var now = Date.now() + offset;
    var label = now >= Date.parse(state.endAt) ? "Odhaleno (odpočet skončil)"
      : state.startedAt ? "Odpočet běží" : "Čeká na spuštění";
    setText("fState", label);

    var end = core.formatEnd(state.endAt);
    setText("fEnd", end ? end.date + " v " + end.time + (end.zone ? " (" + end.zone + ")" : "") : state.endAt);
    setText("fStarted", state.startedAt ? (core.formatStamp(state.startedAt) || state.startedAt) : "Zatím ne");
    setText("fMsg", state.endMessage);
    setText("fUpdated", state.updatedAt ? (core.formatStamp(state.updatedAt) || state.updatedAt) : "–");
  }

  function poll() {
    core.fetchState("/stav.json", function (err, fresh, off) {
      if (err) { failed = true; } else { state = fresh; failed = false; offset = core.usableOffset(off); }
      render();
    });
  }

  poll();
  setInterval(function () { if (!document.hidden) poll(); }, 15000);
  setInterval(render, 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
})();
