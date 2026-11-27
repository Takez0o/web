/* Tajný odpočet – atmosféra promítacího sálu.
 * Canvas: paprsek projektoru, prach v něm, filmové zrno, škrábance (24 snímků/s).
 * Reflektor: odkrývá skryté kresby (klapka, kamera, soška) přes CSS masku.
 * Při omezeném pohybu se vykreslí jen jeden klidný snímek.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("fx");
  var motifs = document.getElementById("motifs");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var SCALE = 0.5;          // canvas v polovičním rozlišení: měkčí zrno, nižší zátěž
  var FPS = 24;             // filmová snímková frekvence
  var W = 0, H = 0, cw = 0, ch = 0;

  var target = { beam: 0.4, lights: 0 };   // řídí app.js podle stavu odpočtu
  var cur = { beam: 0.4, lights: 0 };
  var spot = { x: 0.5, y: 0.42, tx: 0.5, ty: 0.42, manualUntil: 0 };
  var flicker = 1;
  var dust = [], tiles = [];
  var raf = 0, lastDraw = 0, start = Date.now();
  var frameHook = null;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cw = Math.max(1, Math.round(W * SCALE));
    ch = Math.max(1, Math.round(H * SCALE));
    canvas.width = cw;
    canvas.height = ch;
    if (reduce) draw(Date.now());
  }

  function makeTiles() {
    for (var t = 0; t < 4; t++) {
      var c = document.createElement("canvas");
      c.width = c.height = 96;
      var g = c.getContext("2d");
      var img = g.createImageData(96, 96);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() < 0.55 ? 0 : 30 + Math.random() * 70;
      }
      g.putImageData(img, 0, 0);
      tiles.push(c);
    }
  }

  function makeDust() {
    var n = W < 600 ? 45 : 80;
    for (var i = 0; i < n; i++) {
      dust.push({
        x: Math.random(), y: Math.random(),
        r: 0.35 + Math.random() * 1.3,
        vx: (Math.random() - 0.5) * 0.0004,
        vy: (Math.random() - 0.55) * 0.0005,
        p: Math.random() * 6.283
      });
    }
  }

  /* Jak moc je bod (0–1) uvnitř kužele paprsku. Vrchol nad horním okrajem uprostřed. */
  function inBeam(x, y) {
    var apexY = -0.18;
    var half = 0.08 + (y - apexY) * 0.42;
    var d = Math.abs(x - 0.5) / half;
    return d >= 1 ? 0 : (1 - d) * (1 - d);
  }

  function drawBeam(power) {
    var ax = cw * 0.5, ay = -ch * 0.18;
    ctx.globalCompositeOperation = "lighter";
    var layers = [[0.5, 0.05], [0.36, 0.06], [0.22, 0.08]];
    for (var i = 0; i < layers.length; i++) {
      var spread = layers[i][0], alpha = layers[i][1] * power;
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "rgba(255,244,222," + alpha + ")");
      g.addColorStop(1, "rgba(255,244,222," + (alpha * 0.15) + ")");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ax - cw * 0.012, ay);
      ctx.lineTo(ax + cw * 0.012, ay);
      ctx.lineTo(ax + cw * spread, ch);
      ctx.lineTo(ax - cw * spread, ch);
      ctx.closePath();
      ctx.fill();
    }
    // záře objektivu u horního okraje
    var r = ctx.createRadialGradient(ax, 0, 0, ax, 0, ch * 0.45);
    r.addColorStop(0, "rgba(255,244,222," + (0.16 * power) + ")");
    r.addColorStop(1, "rgba(255,244,222,0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSpot(power) {
    var x = spot.x * cw, y = spot.y * ch;
    var rad = Math.max(cw, ch) * (0.28 + cur.lights * 0.9);
    var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(255,240,215," + (0.075 * power) + ")");
    g.addColorStop(1, "rgba(255,240,215,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "source-over";
  }

  function drawDust(power, dt) {
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      if (!reduce) {
        p.x += p.vx * dt + Math.sin(p.p) * 0.00012 * dt;
        p.y += p.vy * dt;
        p.p += 0.002 * dt;
        if (p.x < -0.02) p.x = 1.02; else if (p.x > 1.02) p.x = -0.02;
        if (p.y < -0.02) p.y = 1.02; else if (p.y > 1.02) p.y = -0.02;
      }
      var b = inBeam(p.x, p.y);
      if (b <= 0.02) continue;
      var a = b * power * (0.35 + 0.35 * Math.sin(p.p * 3));
      ctx.fillStyle = "rgba(255,246,230," + Math.max(0, a) + ")";
      ctx.beginPath();
      ctx.arc(p.x * cw, p.y * ch, p.r, 0, 6.283);
      ctx.fill();
    }
  }

  function drawGrain() {
    var tile = tiles[(Math.random() * tiles.length) | 0];
    var pattern = ctx.createPattern(tile, "repeat");
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(-Math.random() * 96, -Math.random() * 96);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, cw + 96, ch + 96);
    ctx.restore();
  }

  function drawScratches() {
    if (Math.random() < 0.18) {
      var n = Math.random() < 0.3 ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var x = Math.random() * cw;
        ctx.strokeStyle = "rgba(255,248,235," + (0.05 + Math.random() * 0.12) + ")";
        ctx.lineWidth = Math.random() < 0.8 ? 0.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 6, ch);
        ctx.stroke();
      }
    }
    if (Math.random() < 0.05) { // občasné smítko
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,248,235,.18)" : "rgba(0,0,0,.5)";
      ctx.beginPath();
      ctx.arc(Math.random() * cw, Math.random() * ch, 0.6 + Math.random() * 1.8, 0, 6.283);
      ctx.fill();
    }
  }

  function moveSpot(now) {
    if (reduce) return;
    if (now > spot.manualUntil) {
      var t = (now - start) / 1000;
      spot.tx = 0.5 + 0.34 * Math.sin(t * 0.21) * Math.cos(t * 0.07);
      spot.ty = 0.48 + 0.3 * Math.sin(t * 0.16 + 1.3);
    }
    spot.x += (spot.tx - spot.x) * 0.07;
    spot.y += (spot.ty - spot.y) * 0.07;
  }

  function applyMask() {
    if (!motifs) return;
    var r = Math.max(W, H) * (0.3 + cur.lights * 1.2);
    motifs.style.setProperty("--sx", (spot.x * 100).toFixed(2) + "%");
    motifs.style.setProperty("--sy", (spot.y * 100).toFixed(2) + "%");
    motifs.style.setProperty("--sr", Math.round(Math.max(170, Math.min(r, 3000))) + "px");
  }

  function draw(now) {
    var dt = lastDraw ? Math.min(100, now - lastDraw) : 40;
    lastDraw = now;
    cur.beam += (target.beam - cur.beam) * 0.06;
    cur.lights += (target.lights - cur.lights) * 0.04;
    if (!reduce) flicker += ((0.86 + Math.random() * 0.14) - flicker) * 0.35;
    var power = cur.beam * flicker;

    ctx.clearRect(0, 0, cw, ch);
    drawBeam(power);
    moveSpot(now);
    drawSpot(0.6 + cur.beam * 0.4);
    drawDust(power, dt);
    drawGrain();
    if (!reduce) drawScratches();
    applyMask();
    if (frameHook) frameHook(now);
  }

  function loop() {
    raf = window.requestAnimationFrame(loop);
    var now = Date.now();
    if (now - lastDraw < 1000 / FPS) return;
    draw(now);
  }

  function startLoop() { if (!raf && !reduce) raf = window.requestAnimationFrame(loop); }
  function stopLoop() { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }

  /* Při omezeném pohybu reflektor nebloudí sám, jen skočí tam, kam ukážete. */
  var pending = 0;
  function pointTo(e) {
    spot.tx = e.clientX / W;
    spot.ty = e.clientY / H;
    spot.manualUntil = Date.now() + (e.pointerType === "mouse" ? 2500 : 4000);
    if (reduce && !pending) {
      pending = window.requestAnimationFrame(function () {
        pending = 0;
        spot.x = spot.tx; spot.y = spot.ty;
        applyMask();
      });
    }
  }

  makeTiles();
  resize();
  makeDust();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", pointTo, { passive: true });
  window.addEventListener("pointerdown", pointTo, { passive: true });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopLoop(); else startLoop(); });

  if (reduce) { cur.beam = target.beam; draw(Date.now()); } else startLoop();

  window.OdpocetFX = {
    /* beam 0–1: síla projektoru; lights 0–1: rozsvícení sálu (odhalí všechny kresby) */
    setMode: function (beam, lights) {
      target.beam = beam;
      target.lights = lights;
      if (reduce) { cur.beam = beam; cur.lights = lights; draw(Date.now()); }
    },
    onFrame: function (fn) { frameHook = fn; },
    reduced: reduce
  };
})();
