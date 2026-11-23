// Front page: a river that runs from the lower-left to the upper-right corner between two
// ink-wash banks. Categories are stones in the river and methods are fish that rest near their
// stone and swim to it when the stone is active. Without this script the page is a plain list.
(function () {
  var stage = document.querySelector(".stage");
  if (!stage) return;
  document.documentElement.classList.add("js");

  var front = document.querySelector(".front");
  var cats = Array.prototype.slice.call(stage.querySelectorAll(".cat"));
  var sats = Array.prototype.slice.call(stage.querySelectorAll(".sat"));
  var caption = document.querySelector(".caption");
  var wide = window.matchMedia("(min-width: 900px)");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var svgNS = "http://www.w3.org/2000/svg";
  var OPEN_DELAY = 120, CLOSE_DELAY = 380;
  var STONE_A = 150, STONE_B = 78, GROW = 1.18;   // half-axes of a stone (px) and its scale when active
  var openTimer = null, closeTimer = null, filter = null, openCat = null;

  // Ends of the line of stones in percent of the stage, from the lower left to the upper right,
  // and the alternating distance (px) of each stone from that line.
  var LINE = { x0: 12, y0: 85, x1: 88, y1: 13 };
  var STONE_OFFSET = 34;

  // ---- Painting parameters ---------------------------------------------------------
  //   layers: [distance from the shore (px), opacity] of the ink washes on each bank
  //   rocks:  [bank, position along the river (0 to 1), distance from the shore, width, height]
  //   trees:  [bank, position along the river, distance from the shore, size, lean (rad)]
  var P = { seed: 24681357, ink: "#34434c", width: 235,
            layers: [[0, .07], [50, .07], [120, .07], [200, .08], [310, .09], [450, .1]], edge: 2.4, soft: 2.5,
            masses: 7, massOp: [.06, .12], blobs: 14, blobOp: [.05, .12], grain: .22, glow: .55, clear: .8, flow: 14, ticks: 10, rockTone: 1.4,
            rocks: [["ul", .04, 14, 62, 24], ["ul", .62, 18, 46, 18], ["lr", .14, 40, 70, 27], ["lr", .5, 34, 50, 20], ["lr", .95, 40, 44, 18]],
            trees: [["ul", .24, 40, 1.0, .5], ["ul", .74, 34, .85, .55], ["lr", .32, 230, .95, -.2], ["lr", .62, 330, 1.25, -.25], ["lr", .92, 230, .9, -.35]],
            blossom: ["#e8968f", "#f0b3ab", "#d97f79"], bloom: 5, reeds: 8 };

  // ---- Motion parameters -----------------------------------------------------------
  var WIND = 22, FALL = 20, FLOW = 11;   // px/s at a 1440 px wide page: wind, falling speed of petals, river current
  var MAX_PETALS = 9;                    // petals in the air or on the water at one time
  var IDLE_R = 16, IDLE_T = [26, 36];    // radius (px) and period range (s) of the slow loop a resting fish swims

  // Moving elements are drawn in a second SVG layer without filters, so the painting is never redrawn.
  var drift = document.createElementNS(svgNS, "svg");
  drift.setAttribute("class", "drift");
  drift.setAttribute("aria-hidden", "true");
  drift.setAttribute("focusable", "false");
  front.insertBefore(drift, front.querySelector(".scene").nextSibling);
  var river = null;   // river geometry and blossom positions of the current drawing, set by drawScene

  function crescent(r) {
    return "M" + (-r).toFixed(1) + " 0A" + r.toFixed(1) + " " + r.toFixed(1) + " 0 0 1 " + r.toFixed(1) + " 0A" + (r * 1.02).toFixed(1) + " " + (r * .28).toFixed(1) + " 0 0 0 " + (-r).toFixed(1) + " 0Z";
  }

  // Ends of the stone line in pixel coordinates of .front, with the unit direction d of the river
  // and the unit normal n that points to the upper-left bank. On narrow screens the line spans
  // the whole page.
  function axis() {
    var f = front.getBoundingClientRect(), r = stage.getBoundingClientRect();
    var sx = r.left - f.left, sy = r.top - f.top, sw = r.width, sh = r.height;
    if (!wide.matches) { sx = 0; sy = 0; sw = f.width; sh = f.height; }
    var A = [sx + sw * LINE.x0 / 100, sy + sh * LINE.y0 / 100], B = [sx + sw * LINE.x1 / 100, sy + sh * LINE.y1 / 100];
    var len = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
    return { A: A, len: len, d: d, n: [d[1], -d[0]], sx: sx, sy: sy };
  }

  // ---- Landscape -----------------------------------------------------------------
  // Drawn in pixel coordinates of the page, from a fixed seed, and redrawn when the page is
  // resized. Banks are stacked translucent washes with displaced, blurred edges; trees are
  // tapered brush strokes with blossoms; the river is lighter than the paper.
  function drawScene() {
    var svg = document.querySelector(".scene");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = front.clientWidth, H = front.clientHeight, u = Math.max(.7, Math.min(1.2, W / 1440));
    var INK = "#16191b", PAPER = getComputedStyle(front).getPropertyValue("--paper").trim() || "#eef0ef";
    var M = 260 * u, BIG = 5000, seed = P.seed, i, s;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");

    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function R(a, b) { return a + rnd() * (b - a); }
    function pick(list) { return list[Math.floor(rnd() * list.length)]; }
    function el(name, attrs, parent) {
      var n = document.createElementNS(svgNS, name);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(n);
      return n;
    }
    function pt(p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }
    function poly(points) { return "M" + points.map(pt).join("L") + "Z"; }
    function line(points) { return "M" + points.map(pt).join("L"); }
    // Smooth curve through the points (Catmull-Rom spline written as cubic Bezier segments).
    function curve(p, closed) {
      var n = p.length, d = "M" + pt(p[0]);
      function g(k) { return closed ? p[(k + n) % n] : p[Math.max(0, Math.min(n - 1, k))]; }
      for (var k = 0; k < (closed ? n : n - 1); k++) {
        var a = g(k - 1), b = g(k), c = g(k + 1), e = g(k + 2);
        d += "C" + pt([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6]) + " " + pt([c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6]) + " " + pt(c);
      }
      return d + (closed ? "Z" : "");
    }
    function blob(cx, cy, rx, ry) {
      var p = [], rot = R(0, Math.PI), m = 9;
      for (var k = 0; k < m; k++) {
        var a = Math.PI * 2 * k / m, f = R(.75, 1.15), x = Math.cos(a) * rx * f, y = Math.sin(a) * ry * f;
        p.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
      return curve(p, true);
    }

    // Filters, in page coordinates.
    var defs = el("defs", {});
    function filterEl(id) {
      return el("filter", { id: id, filterUnits: "userSpaceOnUse", x: -M, y: -M, width: W + 2 * M, height: H + 2 * M, "color-interpolation-filters": "sRGB" }, defs);
    }
    function displace(id, freq, oct, sd, scale, blur) {
      var f = filterEl(id);
      el("feTurbulence", { type: "fractalNoise", baseFrequency: freq, numOctaves: oct, seed: sd, result: "n" }, f);
      el("feDisplacementMap", { "in": "SourceGraphic", in2: "n", scale: scale, xChannelSelector: "R", yChannelSelector: "G", result: "d" }, f);
      if (blur) el("feGaussianBlur", { "in": "d", stdDeviation: blur }, f);
    }
    function blurOnly(id, sd) { el("feGaussianBlur", { stdDeviation: sd }, filterEl(id)); }
    displace("s-wash", (.01 / u).toFixed(4), 4, 3, 48 * u, P.soft * u);    // wash edges spreading in wet paper
    displace("s-shore", (.008 / u).toFixed(4), 3, 12, 56 * u, 9 * u);      // soft gradation at the water's edge
    displace("s-bloom", (.007 / u).toFixed(4), 3, 9, 70 * u, 10 * u);      // diffuse ink clouds
    displace("s-rock", (.05 / u).toFixed(4), 3, 5, 7 * u, .6);             // rock outlines
    displace("s-brush", (.08 / u).toFixed(4), 2, 2, 4.5 * u, 0);           // dry brush edge of branches
    blurOnly("s-soft", 26 * u);
    blurOnly("s-fog", 34 * u);
    var rgb = [1, 3, 5].map(function (k) { return (parseInt(P.ink.substr(k, 2), 16) / 255).toFixed(3); });
    var grain = filterEl("s-grain");
    el("feTurbulence", { type: "fractalNoise", baseFrequency: (.011 / u).toFixed(4), numOctaves: 3, seed: 6, result: "n" }, grain);
    el("feColorMatrix", { type: "matrix", values: "0 0 0 0 " + rgb[0] + " 0 0 0 0 " + rgb[1] + " 0 0 0 0 " + rgb[2] + " 1.6 0 0 0 -.62" }, grain);
    el("feGaussianBlur", { stdDeviation: 2 * u }, grain);

    // River geometry. at(s, o) is the point at arc length s along the river, at signed distance o
    // from the center line (positive toward the upper-left bank).
    var ax = axis();
    function meander(t) { return 24 * u * Math.sin(t / (380 * u) + .7) + 11 * u * Math.sin(t / (170 * u) + 2); }
    function half(t) { return P.width * u * (1 + .1 * Math.sin(t / (430 * u) + 2.1)); }
    function at(t, o) {
      var m = meander(t) + o;
      return [ax.A[0] + ax.d[0] * t + ax.n[0] * m, ax.A[1] + ax.d[1] * t + ax.n[1] * m];
    }
    // Arc lengths at which the center line leaves the page (with margin mg) at either end.
    function exits(mg) {
      return [-Math.min((ax.A[0] + mg) / ax.d[0], (H + mg - ax.A[1]) / -ax.d[1]),
              Math.min((W + mg - ax.A[0]) / ax.d[0], (ax.A[1] + mg) / -ax.d[1])];
    }
    var full = exits(M), vis = exits(0), s0 = full[0] - 700 * u, s1 = full[1] + 700 * u, step = 14 * u;
    function far(p, side) { return [p[0] + side * ax.n[0] * BIG, p[1] + side * ax.n[1] * BIG]; }

    // Water: the river is lighter than the paper.
    var up = [], down = [];
    for (s = s0; s <= s1; s += step) { up.push(at(s, half(s))); down.push(at(s, -half(s))); }
    el("path", { d: poly(up.concat(down.slice().reverse())), fill: "#fff", opacity: P.glow, filter: "url(#s-soft)" });

    // Fog: the landscape fades behind the header, the caption, and the platform filter.
    var fog = el("mask", { id: "s-clear", maskUnits: "userSpaceOnUse", x: -M, y: -M, width: W + 2 * M, height: H + 2 * M }, defs);
    el("rect", { x: -M, y: -M, width: W + 2 * M, height: H + 2 * M, fill: "#fff" }, fog);
    var fogG = el("g", { filter: "url(#s-fog)" }, fog), fr = front.getBoundingClientRect();
    [[".front-head", 1], [".filter", .45]].forEach(function (f) {
      var e = front.querySelector(f[0]), b = e && e.getBoundingClientRect();
      if (!b || !b.width) return;
      el("ellipse", { cx: b.left - fr.left + b.width / 2, cy: b.top - fr.top + b.height / 2, rx: b.width * .62 + 40 * u, ry: b.height * .7 + 30 * u,
                      fill: "#000", opacity: P.clear * f[1] }, fogG);
    });
    var land = el("g", { mask: "url(#s-clear)" });

    // Banks.
    var bankMask = el("mask", { id: "s-bank", maskUnits: "userSpaceOnUse", x: -M, y: -M, width: W + 2 * M, height: H + 2 * M }, defs);
    var bankMaskG = el("g", { filter: "url(#s-wash)" }, bankMask);
    function bank(side) {
      var gs = el("g", { filter: "url(#s-shore)" }, land), g = el("g", { filter: "url(#s-wash)" }, land);
      P.layers.forEach(function (L, li) {
        var ph = [R(0, 6.3), R(0, 6.3), R(0, 6.3)], l1 = R(140, 300) * u, l2 = R(60, 120) * u, dep = L[0] * u;
        function off(t, d) {
          return side * (half(t) + d + (6 * u + d * .2) * (Math.sin(t / l1 + ph[0]) + .6 * Math.sin(t / l2 + ph[1])) + 4 * u * Math.sin(t / (31 * u) + ph[2]));
        }
        var inner = [];
        for (var t = s0; t <= s1; t += step) inner.push(at(t, off(t, dep)));
        var shape = inner.concat([far(inner[inner.length - 1], side), far(inner[0], side)]);
        el("path", { d: poly(shape), fill: P.ink, opacity: L[1] }, li < 2 ? gs : g);
        if (li >= 2) el("path", { d: line(inner), fill: "none", stroke: P.ink, "stroke-width": (P.edge * u).toFixed(1), "stroke-linejoin": "round", opacity: Math.min(.6, L[1] * 2.6).toFixed(3) }, g);
        el("path", { d: poly(shape), fill: "#fff" }, bankMaskG);
      });
      // Ink masses inside the bank, each with a darker rim where the pigment collected.
      for (var k = 0; k < P.masses; k++) {
        var mt = R(vis[0] - 200 * u, vis[1] + 200 * u), mc = at(mt, side * (half(mt) + R(90, 460) * u)), mr = R(70, 190) * u, md = blob(mc[0], mc[1], mr, mr * R(.4, .7));
        el("path", { d: md, fill: P.ink, opacity: R(P.massOp[0], P.massOp[1]).toFixed(3) }, g);
        el("path", { d: md, fill: "none", stroke: P.ink, "stroke-width": (2.2 * u).toFixed(1), opacity: (P.massOp[1] * 1.6).toFixed(3) }, g);
      }
      var gb = el("g", { filter: "url(#s-bloom)" }, land);
      for (k = 0; k < P.blobs; k++) {
        var t = R(vis[0], vis[1]), c = at(t, side * (half(t) + R(30, 400) * u)), r = R(50, 160) * u;
        el("path", { d: blob(c[0], c[1], r, r * R(.45, .8)), fill: P.ink, opacity: R(P.blobOp[0], P.blobOp[1]).toFixed(3) }, gb);
      }
    }
    bank(1);
    bank(-1);
    el("rect", { x: -M, y: -M, width: W + 2 * M, height: H + 2 * M, filter: "url(#s-grain)", opacity: P.grain }, el("g", { mask: "url(#s-bank)" }, land));

    // Texture strokes along the banks, parallel to the river.
    var tex = el("g", { fill: "none", stroke: P.ink, "stroke-linecap": "round", filter: "url(#s-brush)" }, land);
    for (i = 0; i < 26; i++) {
      var side = rnd() < .5 ? 1 : -1, t0 = R(vis[0], vis[1]), dd = R(20, 260) * u, len = R(60, 180) * u, pts = [];
      for (s = t0; s <= t0 + len; s += 12 * u) pts.push(at(s, side * (half(s) + dd + 6 * u * Math.sin(s / (40 * u)))));
      el("path", { d: line(pts), "stroke-width": R(.8, 2.4).toFixed(1), opacity: R(.1, .3).toFixed(2) }, tex);
    }

    // Rocks on the shores, as soft ink masses with a light face, texture strokes, and moss dots.
    var rocksG = el("g", {}, land);
    function rock(spec) {
      var side = spec[0] === "ul" ? 1 : -1, t = spec[1] * ax.len, w = spec[3] * u, h = spec[4] * u;
      var base = at(t, side * (half(t) + spec[2] * u)), cx = base[0], cy = base[1] - h * .3;
      var g = el("g", { filter: "url(#s-rock)" }, rocksG), p = [], m = 10, j;
      for (j = 0; j < m; j++) {
        var a = Math.PI * 2 * j / m, f = R(.82, 1.12), y = Math.sin(a) * h / 2 * f;
        p.push([cx + Math.cos(a) * w / 2 * f, cy + (y > 0 ? y * .55 : y)]);
      }
      function scaled(sx, sy, ox, oy) { return p.map(function (q) { return [cx + (q[0] - cx) * sx + ox, cy + (q[1] - cy) * sy + oy]; }); }
      el("path", { d: curve(p, true), fill: P.ink, opacity: (.3 * P.rockTone).toFixed(2) }, g);
      el("path", { d: curve(scaled(.72, .6, w * .1, h * .12), true), fill: P.ink, opacity: (.35 * P.rockTone).toFixed(2) }, g);
      el("path", { d: curve(scaled(.5, .45, -w * .14, -h * .16), true), fill: PAPER, opacity: ".16" }, g);
      el("path", { d: curve(p, true), fill: "none", stroke: P.ink, "stroke-width": (2.2 * u).toFixed(1), opacity: (.55 * P.rockTone).toFixed(2) }, g);
      for (j = 0; j < 4; j++) {
        var x0 = cx + R(-.35, .3) * w, y0 = cy - h * R(.05, .35), ks = Math.min(1, w / (150 * u));
        el("path", { d: "M" + pt([x0, y0]) + "q" + (R(10, 26) * u * ks).toFixed(1) + "," + (R(4, 12) * u * ks).toFixed(1) + " " + (R(18, 44) * u * ks).toFixed(1) + "," + (R(10, 22) * u * ks).toFixed(1),
                     fill: "none", stroke: INK, "stroke-width": (R(1, 2.2) * u * Math.max(.5, ks)).toFixed(1), "stroke-linecap": "round", opacity: (.45 * P.rockTone).toFixed(2) }, g);
      }
      for (j = 0; j < 6; j++) {
        var b = R(Math.PI * 1.15, Math.PI * 1.85);
        el("circle", { cx: (cx + Math.cos(b) * w / 2 * .85).toFixed(1), cy: (cy + Math.sin(b) * h / 2 * .9).toFixed(1), r: (R(1.5, 3.5) * u * Math.max(.4, Math.min(1, w / (150 * u)))).toFixed(1), fill: INK, opacity: ".8" }, g);
      }
    }
    P.rocks.forEach(rock);

    // Reeds at the water's edge.
    var reedG = el("g", { fill: "none", stroke: INK, "stroke-linecap": "round", filter: "url(#s-brush)" }, land);
    for (i = 0; i < P.reeds; i++) {
      var rs = rnd() < .5 ? 1 : -1, rt = R(vis[0], vis[1]), rb = at(rt, rs * (half(rt) + R(-6, 20) * u));
      for (var j = 0; j < 5; j++) {
        var rx = rb[0] + R(-7, 7) * u, rh = R(14, 34) * u, rl = R(-.5, .5) * rh;
        el("path", { d: "M" + pt([rx, rb[1]]) + "q" + (rl * .3).toFixed(1) + "," + (-rh * .6).toFixed(1) + " " + rl.toFixed(1) + "," + (-rh).toFixed(1),
                     "stroke-width": (R(.8, 1.5) * u).toFixed(1), opacity: R(.4, .7).toFixed(2) }, reedG);
      }
    }

    // Trees: tapered brush strokes for trunk and branches, blossoms at the branch ends.
    var trunkG = el("g", { filter: "url(#s-brush)" }, land), bloomG = el("g", {}, land);
    function grow(x, y, a, len, w, depth, strokes, tips) {
      var n = 9, seg = len / n, p = [[x, y]], ws = [w];
      for (var k = 1; k <= n; k++) {
        a += R(-.22, .22) + (rnd() < .2 ? R(-.65, .65) : 0);
        a = Math.max(-Math.PI - .25, Math.min(.25, a));
        x += Math.cos(a) * seg; y += Math.sin(a) * seg;
        p.push([x, y]); ws.push(Math.max(1.4 * u, w * (1 - .8 * k / n)));
        if (depth > 0 && k > 2 && k < n && rnd() < .34) grow(x, y, a + (rnd() < .5 ? -1 : 1) * R(.6, 1.2), len * R(.4, .62), ws[k] * .75, depth - 1, strokes, tips);
        if (depth === 0 && k > n / 2 && rnd() < .2) tips.push([x, y]);
      }
      strokes.push({ p: p, w: ws });
      tips.push([x, y]);
    }
    function brush(p, w) {
      var Lf = [], Rt = [];
      for (var k = 0; k < p.length; k++) {
        var a = p[Math.max(0, k - 1)], b = p[Math.min(p.length - 1, k + 1)];
        var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, hw = w[k] / 2 * R(.85, 1.12);
        Lf.push([p[k][0] - dy / l * hw, p[k][1] + dx / l * hw]);
        Rt.push([p[k][0] + dy / l * hw, p[k][1] - dx / l * hw]);
      }
      return curve(Lf.concat([p[p.length - 1]], Rt.reverse()), true);
    }
    var spots = [];
    function tree(spec) {
      var side = spec[0] === "ul" ? 1 : -1, t = spec[1] * ax.len, size = spec[3], strokes = [], tips = [];
      var base = at(t, side * (half(t) + spec[2] * u));
      grow(base[0], base[1], -Math.PI / 2 + spec[4], 270 * size * u, 26 * size * u, 2, strokes, tips);
      strokes.forEach(function (st) { el("path", { d: brush(st.p, st.w), fill: INK, opacity: R(.84, .95).toFixed(2) }, trunkG); });
      for (var k = 0; k < 5; k++) {
        el("path", { d: "M" + pt([base[0] - R(10, 40) * u, base[1] + R(-2, 6) * u]) + "h" + (R(30, 80) * u).toFixed(1), fill: "none", stroke: INK,
                     "stroke-width": (R(1, 3) * u).toFixed(1), "stroke-linecap": "round", opacity: R(.2, .5).toFixed(2) }, trunkG);
      }
      tips.forEach(function (tp) {
        var n = 3 + Math.floor(rnd() * P.bloom), r = 26 * size * u;
        spots.push(tp);
        for (var k = 0; k < n; k++) {
          var a = R(0, 6.28), d = Math.sqrt(rnd()) * r;
          el("path", { d: crescent(R(11, 22) * size * u), fill: pick(P.blossom), opacity: R(.85, .97).toFixed(2),
                       transform: "translate(" + (tp[0] + Math.cos(a) * d).toFixed(1) + " " + (tp[1] + Math.sin(a) * d * .8).toFixed(1) + ") rotate(" + R(-60, 60).toFixed(0) + ")" }, bloomG);
        }
      });
    }
    P.trees.forEach(tree);

    // Small marks on the water.
    var water = el("g", { fill: "none", stroke: P.ink, "stroke-linecap": "round" });
    for (i = 0; i < P.ticks; i++) {
      var tt = R(vis[0], vis[1]), tp = at(tt, R(-.9, .9) * half(tt)), tw = R(3, 6) * u;
      el("path", { d: "M" + pt([tp[0] - tw, tp[1] - tw * .6]) + "L" + pt(tp) + "L" + pt([tp[0] + tw, tp[1] - tw * .8]), "stroke-width": (1.2 * u).toFixed(1), opacity: ".45" }, water);
    }

    // Motion layer: dashed flow lines that move downstream (toward the lower left), and a group for petals.
    while (drift.firstChild) drift.removeChild(drift.firstChild);
    drift.setAttribute("viewBox", "0 0 " + W + " " + H);
    drift.setAttribute("preserveAspectRatio", "none");
    var flow = el("g", { "class": "flow", fill: "none", stroke: P.ink, "stroke-linecap": "round" }, drift);
    var PERIOD = 160 * u;
    for (i = 0; i < P.flow; i++) {
      var o = R(-.85, .85), sa = R(vis[0], vis[1]), sl = R(.12, .35) * ax.len, ph = R(0, 6.3), fl = [], dash = R(.35, .7) * PERIOD;
      for (s = sa; s <= sa + sl; s += 20 * u) fl.push(at(s, o * half(s) + 5 * u * Math.sin(s / (60 * u) + ph)));
      var dur = PERIOD / (FLOW * u * R(.8, 1.2));
      el("path", { d: line(fl), "stroke-width": (R(.7, 1.2) * u).toFixed(2), opacity: R(.12, .22).toFixed(2), "stroke-dasharray": dash.toFixed(0) + " " + (PERIOD - dash).toFixed(0),
                   style: "--period:" + PERIOD.toFixed(0) + ";animation-duration:" + dur.toFixed(1) + "s;animation-delay:" + (-R(0, dur)).toFixed(1) + "s" }, flow);
    }
    river = { W: W, H: H, u: u, A: ax.A, d: ax.d, n: ax.n, meander: meander, half: half, spots: spots,
              petals: el("g", { "class": "petals" }, drift) };
    petals = [];
  }

  // True when the page point (x, y) lies on the water.
  function onWater(x, y) {
    var px = x - river.A[0], py = y - river.A[1], t = px * river.d[0] + py * river.d[1];
    return Math.abs(px * river.n[0] + py * river.n[1] - river.meander(t)) < river.half(t) * .9;
  }

  // ---- Falling petals ----------------------------------------------------------------
  // A petal leaves a blossom, drifts down and to the right in the wind, and after a fall of a
  // random height either floats downstream on the water or fades on the bank.
  var petals = [], nextPetal = 0, clock = 0;
  function petalStep(dt) {
    if (!river || still.matches) return;
    var u = river.u;
    clock += dt;
    if (clock >= nextPetal && petals.length < MAX_PETALS && river.spots.length) {
      nextPetal = clock + 1.2 + Math.random() * 2.4;
      var sp = river.spots[Math.floor(Math.random() * river.spots.length)];
      var e = document.createElementNS(svgNS, "path");
      e.setAttribute("d", crescent((5.5 + Math.random() * 4) * u));
      e.setAttribute("fill", P.blossom[Math.floor(Math.random() * P.blossom.length)]);
      river.petals.appendChild(e);
      petals.push({ e: e, x: sp[0], y: sp[1], y0: sp[1], drop: (80 + Math.random() * 220) * u, rot: Math.random() * 360,
                    spin: (Math.random() - .5) * 120, ph: Math.random() * 6.3, state: 0, age: 0, op: 0 });
    }
    petals = petals.filter(function (p) {
      p.age += dt;
      var flip = 1;
      if (p.state === 0) {
        var gust = 1 + .5 * Math.sin(clock * .35 + p.ph);
        p.x += (WIND * gust + 14 * Math.sin(p.age * 1.3 + p.ph)) * u * dt;
        p.y += FALL * u * dt;
        p.rot += p.spin * dt;
        p.op = Math.min(.92, p.op + dt * 1.5);
        flip = Math.cos(p.age * 2.2 + p.ph);
        if (p.y - p.y0 > p.drop) { p.state = onWater(p.x, p.y) ? 1 : 2; p.age = 0; }
      } else if (p.state === 1) {
        var wob = 4 * Math.sin(p.age * .8 + p.ph);
        p.x += (-river.d[0] * FLOW + river.n[0] * wob) * u * dt;
        p.y += (-river.d[1] * FLOW + river.n[1] * wob) * u * dt;
        p.rot += p.spin * .1 * dt;
        p.op = .92 * Math.max(0, 1 - p.age / 14);
      } else {
        p.op -= dt * .35;
      }
      var gone = (p.state && p.op <= 0) || p.x > river.W + 30 || p.y > river.H + 30 || p.x < -30;
      if (gone) { p.e.remove(); return false; }
      p.e.setAttribute("transform", "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ") rotate(" + p.rot.toFixed(0) + ") scale(1 " + (.35 + .65 * Math.abs(flip)).toFixed(2) + ")");
      p.e.setAttribute("opacity", Math.max(0, p.op).toFixed(2));
      return true;
    });
  }

  // ---- Stones and fish ---------------------------------------------------------
  // Each fish has a position relative to the center of its stone and a heading. At rest it lies
  // still at a fixed place near the stone, drawn as a small ink fish. When the stone is active
  // it swims to a place on an arc below the stone, where it is drawn in full and can be selected.
  var fishes = sats.map(function (sat) {
    return { sat: sat, cat: sat.closest(".cat"), link: sat.querySelector(".fish"),
             x: 0, y: 0, ang: 0, homeX: 0, homeY: 0, homeAng: 0, slotX: 0, slotY: 0, held: false, placed: false,
             orb: Math.random() * 6.3, orbW: (Math.random() < .5 ? -1 : 1) * 2 * Math.PI / (IDLE_T[0] + Math.random() * (IDLE_T[1] - IDLE_T[0])) };
  });

  function layout() {
    var stageH = stage.clientHeight || 760, ax = axis(), nc = cats.length;
    cats.forEach(function (cat, i) {
      // Stones along the river, from the lower left to the upper right, alternately on either side of the line.
      var t = (nc === 1 ? .5 : i / (nc - 1)) * ax.len, off = (i % 2 ? -1 : 1) * STONE_OFFSET;
      var cx = ax.A[0] + ax.d[0] * t + ax.n[0] * off - ax.sx, cy = ax.A[1] + ax.d[1] * t + ax.n[1] * off - ax.sy;
      cat.style.setProperty("--px", cx.toFixed(1) + "px");
      cat.style.setProperty("--py", cy.toFixed(1) + "px");
      var mine = fishes.filter(function (f) { return f.cat === cat; }), n = mine.length;
      mine.forEach(function (f, j) {
        // Place on an arc below the active stone.
        var ring = Math.floor(j / 4), inRing = Math.min(4, n - ring * 4), jj = j - ring * 4;
        var t = (22 + 136 * (jj + .5) / inRing) * Math.PI / 180;
        f.slotX = Math.cos(t) * (STONE_A * GROW + 66 + ring * 84);
        f.slotY = Math.sin(t) * (STONE_B * GROW + 62 + ring * 70);
        // Resting place: spread around the stone, at a distance that differs between fish.
        var h = (i * 1.9 + j * 6.283 / n + .6), k = 1.55 + ((i * 3 + j * 5) % 4) * .14;
        f.homeX = Math.cos(h) * STONE_A * k;
        f.homeY = Math.sin(h) * STONE_B * k * 1.35;
        f.homeY = Math.max(40 - cy, Math.min(stageH - 30 - cy, f.homeY));
        f.homeAng = h + 1.75 + ((i + j) % 3 - 1) * .5;
        if (!f.placed) { f.x = f.homeX + Math.cos(f.orb) * IDLE_R; f.y = f.homeY + Math.sin(f.orb) * IDLE_R * .6; f.ang = f.homeAng; f.placed = true; }
      });
    });
  }

  var last = 0;
  function step(now) {
    requestAnimationFrame(step);
    if (!wide.matches || document.hidden) { last = now; return; }
    var dt = Math.min(.05, (now - last) / 1000 || 0);
    last = now;
    petalStep(dt);
    fishes.forEach(function (f) {
      var active = f.cat === openCat, speed = 0, want, idle = false;
      // A resting fish swims a slow loop around its resting place.
      f.orb += f.orbW * dt;
      var ox = f.homeX + Math.cos(f.orb) * IDLE_R, oy = f.homeY + Math.sin(f.orb) * IDLE_R * .6;
      var tx = active ? f.slotX : (still.matches ? f.homeX : ox), ty = active ? f.slotY : (still.matches ? f.homeY : oy);
      var gd = Math.hypot(tx - f.x, ty - f.y);
      if (still.matches) { f.x = tx; f.y = ty; gd = 0; }
      if (f.held || gd <= 4) {
        // Arrived: an active fish faces the stone; a resting fish follows its loop, or keeps its own heading without motion.
        if (active) want = Math.atan2(-f.y, -f.x);
        else if (still.matches) want = f.homeAng;
        else {
          var sg = f.orbW > 0 ? 1 : -1;
          f.x = ox; f.y = oy; idle = true;
          want = Math.atan2(Math.cos(f.orb) * .6 * sg, -Math.sin(f.orb) * sg);
        }
      } else {
        // Swim around the stone to the target, not across it.
        var kk = Math.sqrt(Math.pow(tx / STONE_A, 2) + Math.pow(ty / STONE_B, 2)) || 1;
        var RA = STONE_A * kk, RB = STONE_B * kk;
        var ac = Math.atan2(f.y / RB, f.x / RA), at = Math.atan2(ty / RB, tx / RA);
        var da = Math.atan2(Math.sin(at - ac), Math.cos(at - ac));
        var wx = tx, wy = ty;
        if (Math.abs(da) > .45) { var am = ac + (da > 0 ? .45 : -.45); wx = Math.cos(am) * RA; wy = Math.sin(am) * RB; }
        want = Math.atan2(wy - f.y, wx - f.x);
        speed = Math.min(active ? 210 : 120, gd * 2.4 + 14);
      }
      var diff = Math.atan2(Math.sin(want - f.ang), Math.cos(want - f.ang));
      var turn = (speed ? 5 : 2.2) * dt;
      f.ang += Math.max(-turn, Math.min(turn, diff));
      if (speed) { f.x += Math.cos(f.ang) * speed * dt; f.y += Math.sin(f.ang) * speed * dt; }
      f.sat.classList.toggle("resting", !speed && !idle);
      f.sat.classList.toggle("idle", idle);
      f.sat.style.setProperty("--fx", f.x.toFixed(1) + "px");
      f.sat.style.setProperty("--fy", f.y.toFixed(1) + "px");
      f.sat.style.setProperty("--fa", (f.ang * 180 / Math.PI).toFixed(1) + "deg");
    });
  }

  // ---- Caption -------------------------------------------------------------------
  function badges(sat) {
    var planned = (sat.dataset.planned || "").split("|");
    return (sat.dataset.platforms || "").split("|").filter(Boolean).map(function (p) {
      return '<span class="badge-p' + (planned.indexOf(p) >= 0 ? " planned" : "") + '">' + p + "</span>";
    }).join("");
  }
  function setCaption(html) { caption.innerHTML = html || caption.dataset.default; }
  function describeCat(cat) {
    var names = Array.prototype.map.call(cat.querySelectorAll(".sat-name"), function (n) { return n.textContent; });
    setCaption("<strong>" + cat.dataset.area + "</strong>" + names.join(" · "));
  }
  function describeSat(sat) {
    var status = sat.dataset.status === "released" ? "" : ' <span class="status dev">in development</span>';
    setCaption("<strong>" + sat.querySelector(".sat-name").textContent + status + "</strong>" +
      sat.dataset.desc + '<span class="badges">' + badges(sat) + "</span>");
  }

  // ---- Interaction ---------------------------------------------------------------
  function open(cat) {
    if (cat === openCat) return;
    openCat = cat;
    cats.forEach(function (c) {
      c.classList.toggle("open", c === cat);
      c.querySelector(".stone").setAttribute("aria-expanded", c === cat ? "true" : "false");
    });
    stage.classList.toggle("has-open", !!cat);
    front.classList.toggle("focus", !!cat);
    if (!cat) setCaption("");
    else if (!stage.querySelector(".fish:hover, .fish:focus-visible")) describeCat(cat);
  }
  function scheduleOpen(cat) {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    openTimer = setTimeout(function () { open(cat); }, OPEN_DELAY);
  }
  function scheduleClose() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { open(null); }, CLOSE_DELAY);
  }

  cats.forEach(function (cat) {
    var stone = cat.querySelector(".stone");
    cat.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && wide.matches) scheduleOpen(cat); });
    cat.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && wide.matches) scheduleClose(); });
    cat.addEventListener("focusin", function () { if (wide.matches) { clearTimeout(closeTimer); open(cat); } });
    cat.addEventListener("focusout", function (e) { if (wide.matches && !cat.contains(e.relatedTarget)) scheduleClose(); });
    stone.addEventListener("click", function () {
      if (!wide.matches) return;
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      if (openCat === cat && !cat.matches(":hover")) open(null); else open(cat);
    });
  });

  // Ink spreads and ripples widen from the selected fish; the tutorial opens when they finish.
  function splash(f) {
    var base = stage.getBoundingClientRect(), box = f.link.querySelector(".koi").getBoundingClientRect();
    var s = document.createElement("li");
    s.className = "splash";
    s.setAttribute("aria-hidden", "true");
    s.style.transform = "translate(" + (box.left + box.width / 2 - base.left) + "px," + (box.top + box.height / 2 - base.top) + "px)";
    s.innerHTML = "<b></b><b></b><i></i><i></i><i></i>";
    stage.appendChild(s);
    return s;
  }

  fishes.forEach(function (f) {
    function enter() {
      if (!wide.matches || f.held || stage.classList.contains("leaving")) return;
      // Only a fish that has reached its place beside the active stone can be held.
      if (f.cat !== openCat || Math.hypot(f.slotX - f.x, f.slotY - f.y) > 10) return;
      f.held = true;
      clearTimeout(closeTimer);
      describeSat(f.sat);
    }
    function leave() {
      f.held = false;
      if (!wide.matches) return;
      if (openCat) describeCat(openCat); else setCaption("");
    }
    f.link.addEventListener("pointerenter", enter);
    f.link.addEventListener("pointermove", enter);
    f.link.addEventListener("pointerleave", leave);
    f.link.addEventListener("focus", enter);
    f.link.addEventListener("blur", leave);
    f.link.addEventListener("click", function (e) {
      if (!wide.matches || still.matches || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (stage.classList.contains("leaving")) return;
      stage.classList.add("leaving");
      f.held = true;
      splash(f);
      setTimeout(function () { window.location.href = f.link.href; }, 820);
    });
  });

  // Returning with the back button: clear the effect.
  window.addEventListener("pageshow", function () {
    stage.classList.remove("leaving");
    Array.prototype.forEach.call(stage.querySelectorAll(".splash"), function (s) { s.remove(); });
    fishes.forEach(function (f) { f.held = false; });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { open(null); if (document.activeElement) document.activeElement.blur(); }
  });

  // Platform filter: dim the fish that are not available on the chosen platform.
  Array.prototype.forEach.call(document.querySelectorAll(".filter button"), function (btn) {
    btn.addEventListener("click", function () {
      filter = filter === btn.dataset.platform ? null : btn.dataset.platform;
      Array.prototype.forEach.call(document.querySelectorAll(".filter button"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.platform === filter ? "true" : "false");
      });
      stage.classList.toggle("filtering", !!filter);
      sats.forEach(function (s) {
        s.classList.toggle("off", !!filter && (s.dataset.platforms || "").split("|").indexOf(filter) < 0);
      });
    });
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { drawScene(); layout(); }, 150);
  });

  layout();
  drawScene();
  // The page height settles after fonts load; draw the landscape again at the final size.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawScene);
  requestAnimationFrame(step);
})();
