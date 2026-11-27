/* Tajný odpočet – sdílené jádro: načtení a kontrola stavu odpočtu,
 * formátování v pražském čase. Používá ho hlavní stránka i správa.
 * Kompatibilní se staršími prohlížeči (ES5 + fetch), žádné ?. ani ??.
 */
(function (root) {
  "use strict";

  var TZ = "Europe/Prague";
  var MAX_MESSAGE = 400;
  var FETCH_TIMEOUT = 8000;

  /* Výchozí stav, když se stav.json nepodaří načíst. Odpovídá zadání:
   * odhalení 9. 12. 2026 v 10:00 pražského času, ruční spuštění 7. 12. */
  var DEFAULTS = {
    startedAt: null,
    endAt: "2026-12-09T10:00:00+01:00",
    endMessage: "Tajemství právě zaznělo ve školním rozhlase.",
    plannedStart: "2026-12-07",
    updatedAt: null
  };

  function isIsoDate(value) {
    return typeof value === "string" &&
      value.length <= 40 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !isNaN(Date.parse(value));
  }

  function cleanMessage(value) {
    if (typeof value !== "string") return "";
    // řídicí znaky pryč, bílé znaky sjednotit, délku omezit
    return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);
  }

  /* Přísná kontrola dat ze serveru. Vrací čistý objekt, nebo null. */
  function validate(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (!isIsoDate(raw.endAt)) return null;
    if (raw.startedAt !== null && raw.startedAt !== undefined && !isIsoDate(raw.startedAt)) return null;

    var message = cleanMessage(raw.endMessage) || DEFAULTS.endMessage;
    var planned = typeof raw.plannedStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.plannedStart)
      ? raw.plannedStart : null;

    return {
      startedAt: raw.startedAt ? raw.startedAt : null,
      endAt: raw.endAt,
      endMessage: message,
      plannedStart: planned,
      updatedAt: isIsoDate(raw.updatedAt) ? raw.updatedAt : null
    };
  }

  /* Načte stav. Zároveň odhadne posun hodin zařízení proti serveru
   * (hlavička Date), aby odpočet seděl i na telefonu se špatně nastaveným časem. */
  function fetchState(url, done) {
    if (typeof root.fetch !== "function") { done(new Error("Prohlížeč neumí fetch")); return; }

    var controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    var finished = false;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
      finish(new Error("Vypršel časový limit"));
    }, FETCH_TIMEOUT);

    function finish(err, state, offset) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(err, state, offset);
    }

    var t0 = Date.now();
    var options = { cache: "no-store", credentials: "omit" };
    if (controller) options.signal = controller.signal;

    root.fetch(url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + t0, options)
      .then(function (res) {
        var t1 = Date.now();
        if (!res.ok) throw new Error("HTTP " + res.status);
        var offset = null;
        var dateHeader = res.headers.get("Date");
        var age = parseInt(res.headers.get("Age") || "0", 10);
        // jen čerstvá odpověď (ne z mezipaměti) a rozumně rychlá síť
        if (dateHeader && !(age > 0) && t1 - t0 < 3000) {
          var server = Date.parse(dateHeader);
          if (!isNaN(server)) offset = server + 500 - (t0 + t1) / 2; // Date má přesnost na sekundy
        }
        return res.json().then(function (data) { return { data: data, offset: offset }; });
      })
      .then(function (result) {
        var state = validate(result.data);
        if (!state) throw new Error("Neplatná data stavu");
        finish(null, state, result.offset);
      })
      .catch(function (err) { finish(err || new Error("Chyba sítě")); });
  }

  /* Posun hodin použijeme, jen když je zřetelný (víc než 2 s) a uvěřitelný (méně než 1 den). */
  function usableOffset(offset) {
    if (typeof offset !== "number" || !isFinite(offset)) return 0;
    var abs = Math.abs(offset);
    return abs > 2000 && abs < 86400000 ? offset : 0;
  }

  var formatters = null;
  try {
    formatters = {
      date: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      time: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
      day: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }),
      stamp: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      zone: new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, timeZoneName: "short" })
    };
  } catch (e) { formatters = null; }

  function zoneName(date) {
    if (!formatters || typeof formatters.zone.formatToParts !== "function") return "";
    var parts = formatters.zone.formatToParts(date);
    for (var i = 0; i < parts.length; i++) if (parts[i].type === "timeZoneName") return parts[i].value;
    return "";
  }

  /* Vrací { date: "středa 9. prosince 2026", time: "10:00", zone: "SEČ" }, nebo null bez podpory Intl. */
  function formatEnd(iso) {
    if (!formatters) return null;
    var d = new Date(Date.parse(iso));
    return { date: formatters.date.format(d), time: formatters.time.format(d), zone: zoneName(d) };
  }

  function formatDay(ymd) {
    if (!formatters || !ymd) return null;
    return formatters.day.format(new Date(ymd + "T12:00:00Z"));
  }

  function formatStamp(iso) {
    if (!formatters || !iso) return null;
    return formatters.stamp.format(new Date(Date.parse(iso)));
  }

  function plural(n, forms) { return n === 1 ? forms[0] : (n >= 2 && n <= 4 ? forms[1] : forms[2]); }

  /* Poslední známý stav v prohlížeči, aby se stránka hned zobrazila správně.
   * Jen pro rychlost; skutečný stav vždy přepíše odpověď serveru. */
  var CACHE_KEY = "odpocet-stav-v1";
  function cacheRead() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(CACHE_KEY);
      return raw ? validate(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function cacheWrite(state) {
    try { if (root.localStorage) root.localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch (e) { /* soukromé okno apod. */ }
  }

  root.OdpocetStav = {
    TZ: TZ,
    DEFAULTS: DEFAULTS,
    validate: validate,
    fetchState: fetchState,
    usableOffset: usableOffset,
    formatEnd: formatEnd,
    formatDay: formatDay,
    formatStamp: formatStamp,
    plural: plural,
    cacheRead: cacheRead,
    cacheWrite: cacheWrite
  };
})(window);
