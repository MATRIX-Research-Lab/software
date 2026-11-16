// Front page: a river between two ink-wash banks. Categories are stones in the river and
// methods are fish that rest near their stone and swim to it when the stone is active. Without this script the page is a plain list.
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
  var STONE_A = 120, STONE_B = 62, GROW = 1.18;   // half-axes of a stone (px) and its scale when active
  var openTimer = null, closeTimer = null, filter = null, openCat = null;

  // Stone positions as percent of the stage: a zigzag down the river.
  var SLOTS = [
    { x: 38, y: 15 }, { x: 62, y: 27 }, { x: 39, y: 47 }, { x: 62, y: 61 }, { x: 48, y: 80 },
    { x: 50, y: 36 }, { x: 52, y: 60 }
  ];

  // ---- Landscape -----------------------------------------------------------
  // Drawn in pixel coordinates of the page, from a fixed seed, and redrawn when the page is
  // resized. The two banks carry peaks, pines, and red-leaved trees; the center stays empty.
  function drawScene() {
    var svg = document.querySelector(".scene");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = front.clientWidth, H = front.clientHeight, u = Math.max(.7, Math.min(1.2, W / 1440));
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    var INK = "#1d211c", PAPER = "#f3efe5", RED = "#a63d2f", seed = 24681357;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function R(a, b) { return a + rnd() * (b - a); }
    function el(name, attrs, parent) {
      var n = document.createElementNS(svgNS, name);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(n);
      return n;
    }
    function poly(points) {
      return "M" + points.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L") + " Z";
    }

    var defs = el("defs", {});
    function turb(id, freq, scale, blur) {
      var f = el("filter", { id: id, x: "-15%", y: "-15%", width: "130%", height: "130%" }, defs);
      el("feTurbulence", { type: "fractalNoise", baseFrequency: freq, numOctaves: "3", seed: "8", result: "n" }, f);
      el("feDisplacementMap", { "in": "SourceGraphic", in2: "n", scale: scale, xChannelSelector: "R", yChannelSelector: "G", result: "d" }, f);
      if (blur) el("feGaussianBlur", { "in": "d", stdDeviation: blur }, f);
    }
    turb("bank-wash", ".012 .035", "28", "1.4");   // soft wash
    turb("bank-dry", ".07", "8");                  // dry brush
    turb("bank-brush", ".045", "5");               // brush edge
    var fade = el("linearGradient", { id: "bank-fade", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#252b25", "stop-opacity": ".04" }, fade);
    el("stop", { offset: ".5", "stop-color": "#343b32", "stop-opacity": ".17" }, fade);
    el("stop", { offset: "1", "stop-color": "#252b25", "stop-opacity": ".46" }, fade);

    var uid = 0;
    function fading(yTop, yBase, filterId) {
      var id = "bank-m" + (uid++);
      var g = el("linearGradient", { id: id + "g", gradientUnits: "userSpaceOnUse", x1: "0", y1: yTop, x2: "0", y2: yBase }, defs);
      el("stop", { offset: "0", "stop-color": "#fff" }, g);
      el("stop", { offset: ".5", "stop-color": "#fff" }, g);
      el("stop", { offset: "1", "stop-color": "#000" }, g);
      var m = el("mask", { id: id, maskUnits: "userSpaceOnUse", x: -200, y: -200, width: W + 400, height: H + 400 }, defs);
      el("rect", { x: -200, y: -200, width: W + 400, height: H + 400, fill: "url(#" + id + "g)" }, m);
      return el("g", { filter: "url(#" + filterId + ")" }, el("g", { mask: "url(#" + id + ")" }));
    }

    // Shoreline of each bank as a function of height.
    function shoreL(y) { return W * (.25 + .035 * Math.sin(y / (170 * u) + 1) + .018 * Math.sin(y / (61 * u))); }
    function shoreR(y) { return W * (.75 - .035 * Math.sin(y / (150 * u) + 2.2) - .018 * Math.sin(y / (57 * u) + 1)); }
    function bank(shore, outer) {
      var pts = [[outer, -60]], y;
      for (y = -60; y <= H + 60; y += 24) pts.push([shore(y), y]);
      pts.push([outer, H + 60]);
      el("path", { d: poly(pts), fill: "url(#bank-fade)", filter: "url(#bank-wash)" });
    }

    // A pine: a leaning trunk and flat, layered foliage.
    function pine(g, x, y, s, tone) {
      var lean = R(-.22, .22) * s, tx = x + lean, ty = y - s;
      el("path", { d: "M" + x + "," + y + " Q" + (x + lean * .2) + "," + (y - s * .55) + " " + tx + "," + ty,
                   fill: "none", stroke: INK, "stroke-width": Math.max(1.2, s * .045), "stroke-linecap": "round", opacity: tone }, g);
      var layers = s > 90 ? 5 : 3;
      for (var i = 0; i < layers; i++) {
        var t = i / layers, cy = ty + s * (.02 + t * .42), side = i % 2 ? 1 : -1;
        var cx = tx - lean * t * .8 + side * s * R(.08, .26);
        el("ellipse", { cx: cx.toFixed(1), cy: cy.toFixed(1), rx: (s * R(.26, .4) * (1 - t * .25)).toFixed(1), ry: (s * R(.045, .07)).toFixed(1),
                        fill: INK, opacity: tone, filter: "url(#bank-dry)" }, g);
      }
    }

    // One columnar peak with a pale face, shaded side, dark crest, and texture strokes.
    function spire(g, cx, base, w, top, tone, pines) {
      var h = base - top, n = 6 + Math.floor(rnd() * 3), i, t;
      var topW = w * R(.3, .46), lean = R(-.1, .1) * w, L = [], Rt = [];
      for (i = 0; i <= n; i++) {
        t = i / n;
        var half = (w / 2) * (1 - t) + (topW / 2) * t, y = base - h * .86 * t;
        var jl = i > 0 && i < n ? R(-.14, .1) * half : 0, jr = i > 0 && i < n ? R(-.14, .1) * half : 0;
        L.push([cx + lean * t - half - jl, y]);
        Rt.push([cx + lean * t + half + jr, y]);
      }
      var k = 3 + Math.floor(rnd() * 2), T = [], peak = Math.floor(rnd() * k);
      for (i = 0; i < k; i++) {
        T.push([L[n][0] + (i + .5) / k * (Rt[n][0] - L[n][0]) + R(-.06, .06) * topW, i === peak ? top : top + R(.03, .11) * h]);
      }
      var outline = L.concat(T, Rt.slice().reverse());
      el("path", { d: poly(outline), fill: PAPER }, g);
      el("path", { d: poly(outline), fill: INK, opacity: tone.face }, g);
      var inner = Rt.map(function (p, j) {
        var tt = j / n, hw = (w / 2) * (1 - tt) + (topW / 2) * tt;
        return [p[0] - hw * R(.45, .8), p[1]];
      });
      el("path", { d: poly(Rt.concat([T[k - 1]], inner.reverse())), fill: INK, opacity: tone.shade }, g);
      var crest = [L[n]].concat(T, [Rt[n]]);
      var under = crest.map(function (p) { return [p[0] + R(-3, 3), p[1] + h * R(.035, .085)]; }).reverse();
      el("path", { d: poly(crest.concat(under)), fill: INK, opacity: Math.min(.92, tone.shade * 1.5) }, g);
      if (tone.line) el("path", { d: poly(outline), fill: "none", stroke: INK, "stroke-width": 2, "stroke-linejoin": "round", opacity: tone.line }, g);
      for (i = 0; i < tone.texture; i++) {
        var q = R(-.85, .55), x0 = cx + lean * .86 + q * topW / 2, y0 = top + R(.1, .32) * h, len = R(.14, .46) * h;
        var spread = q * (w - topW) / 2 * (len / h) * 1.1;
        el("path", { d: "M" + x0.toFixed(1) + "," + y0.toFixed(1) + " l" + (spread + R(-4, 4)).toFixed(1) + "," + len.toFixed(1),
                     fill: "none", stroke: INK, "stroke-width": R(.9, 1.8).toFixed(1), "stroke-linecap": "round", opacity: R(.2, .45).toFixed(2) }, g);
      }
      if (pines) {
        pine(g, T[peak][0], T[peak][1] + 3, R(24, 36) * u, .88);
        if (rnd() < .6) pine(g, L[n - 2][0] + 3, L[n - 2][1], R(20, 30) * u, .82);
      }
    }
    function cluster(o) {
      var g = fading(o.base - o.height * .5, o.base, o.filter), list = [], i;
      for (i = 0; i < o.n; i++) {
        var pos = o.n === 1 ? 0 : i / (o.n - 1) - .5;
        list.push({ cx: o.cx + pos * o.width + R(-.06, .06) * o.width,
                    h: o.height * (1 - Math.abs(pos + o.skew) * 1.05) * R(.7, 1), w: o.width / o.n * R(1.7, 2.5) });
      }
      list.sort(function (a, b) { return b.h - a.h; });
      list.forEach(function (s, j) { spire(g, s.cx, o.base + j * 6, s.w, o.base - Math.max(s.h, o.height * .25), o.tone, o.pines); });
    }

    // A broadleaf tree; red-leaved trees are the color accent of the painting.
    function tree(x, y, s, red, flip) {
      var g = el("g", { transform: "translate(" + x + " " + y + ") scale(" + (flip ? -s : s) + " " + s + ")", filter: "url(#bank-dry)" });
      el("path", { d: "M0 0Q-8-55 8-112Q22-154 9-202M3-79Q-35-105-54-145M10-120Q48-139 64-174M6-161Q-17-177-27-196",
                   fill: "none", stroke: INK, "stroke-width": "4.5", "stroke-linecap": "round", opacity: ".85" }, g);
      [[-53, -145, 42], [60, -174, 46], [8, -202, 44], [-22, -192, 30]].forEach(function (c) {
        for (var i = 0; i < (red ? 20 : 10); i++) {
          var a = R(0, Math.PI * 2), r = Math.sqrt(rnd()) * c[2];
          el("ellipse", { cx: c[0] + Math.cos(a) * r, cy: c[1] + Math.sin(a) * r * .45, rx: R(3, 10), ry: R(2, 5),
                          fill: red ? (rnd() < .7 ? RED : "#c26743") : "#39433a", opacity: R(.35, .82),
                          transform: "rotate(" + R(-35, 35) + " " + c[0] + " " + c[1] + ")" }, g);
        }
      });
    }

    function rock(g, cx, base, w, h) {
      var pts = [], m = 7;
      for (var i = 0; i <= m; i++) {
        var a = Math.PI * (1 - i / m);
        pts.push([cx + Math.cos(a) * w / 2 * R(.85, 1.1), base - Math.sin(a) * h * R(.75, 1.1)]);
      }
      el("path", { d: poly(pts), fill: PAPER }, g);
      el("path", { d: poly(pts), fill: INK, opacity: ".24" }, g);
      el("path", { d: poly([pts[m], pts[m - 1], pts[m - 2], [cx + w * .1, base - h * .3], [cx - w * .1, base]]), fill: INK, opacity: ".6" }, g);
      el("path", { d: poly(pts), fill: "none", stroke: INK, "stroke-width": "1.8", "stroke-linejoin": "round", opacity: ".85" }, g);
    }

    // A two-story pavilion with red roofs; (x, y) is the center of its base.
    function pavilion(x, y, s) {
      var g = el("g", { transform: "translate(" + x + " " + y + ") scale(" + s + ")", stroke: INK, "stroke-width": "1.3",
                        "stroke-linejoin": "round", "stroke-linecap": "round", filter: "url(#ink-wobble)" });
      el("path", { d: "M-54 0h108v-7h-108z", fill: INK, opacity: ".75" }, g);
      el("path", { d: "M-38-7v-25M-16-7v-25M16-7v-25M38-7v-25M-38-20h76M-24-47v-17M0-47v-17M24-47v-17M-14-76v-9M14-76v-9", fill: "none", opacity: ".8" }, g);
      el("path", { d: "M-70-36q12-1 26-11h88q14 10 26 11q-12 5-28 2h-84q-16 3-28-2z", fill: RED, opacity: ".88" }, g);
      el("path", { d: "M-50-66q9-1 20-10h60q11 9 20 10q-9 5-21 2h-58q-12 3-21-2z", fill: RED, opacity: ".88" }, g);
      el("path", { d: "M-32-87q20-4 32-22q12 18 32 22q-16 4-32 2q-16 2-32-2zM0-109v-10", fill: RED, opacity: ".88" }, g);
    }

    var FAR  = { face: .15, shade: .06, line: 0,   texture: 0 };
    var NEAR = { face: .07, shade: .58, line: .88, texture: 11 };

    // Distant peaks behind each bank.
    cluster({ cx: W * .16, base: H * .40, width: W * .16, height: H * .27, n: 3, skew: .08, filter: "bank-wash", tone: FAR });
    cluster({ cx: W * .86, base: H * .36, width: W * .17, height: H * .26, n: 3, skew: -.08, filter: "bank-wash", tone: FAR });

    bank(shoreL, -80);
    bank(shoreR, W + 80);

    // Peaks on the banks.
    cluster({ cx: W * .085, base: H * .50, width: W * .15, height: H * .30, n: 4, skew: .1,  filter: "bank-brush", tone: NEAR, pines: true });
    cluster({ cx: W * .925, base: H * .46, width: W * .14, height: H * .28, n: 4, skew: -.1, filter: "bank-brush", tone: NEAR, pines: true });

    // Dry-brush ground strokes on the banks.
    var ground = el("g", { fill: "none", stroke: "#394037", "stroke-linecap": "round", filter: "url(#bank-dry)" });
    for (var i = 0; i < 44; i++) {
      var left = rnd() < .5, gy = R(H * .45, H), gx = left ? R(-20, shoreL(gy) - 110 * u) : R(shoreR(gy) + 20, W - 60);
      el("path", { d: "M" + gx.toFixed(0) + " " + gy.toFixed(0) + "q" + R(15, 70).toFixed(0) + " " + R(-12, 12).toFixed(0) + " " + R(60, 150).toFixed(0) + " " + R(-5, 8).toFixed(0),
                   "stroke-width": R(.8, 2.5).toFixed(1), opacity: R(.08, .28).toFixed(2) }, ground);
    }

    // Trees, pavilion, and rocks along the two shores.
    var shoreG = el("g", { filter: "url(#bank-brush)" });
    pavilion(W * .875, H * .70, .95 * u);
    tree(W * .07, H * .58, .62 * u, false, false);
    tree(W * .19, H * .47, .5 * u, true, false);
    tree(W * .945, H * .575, .6 * u, true, true);
    tree(W * .80, H * .44, .48 * u, false, true);
    tree(W * .955, H * .76, .8 * u, false, true);
    tree(W * .79, H * .735, .72 * u, true, false);
    pine(shoreG, W * .045, H * .80, 150 * u, .9);
    pine(shoreG, W * .21, H * .72, 96 * u, .85);
    tree(W * .14, H * .76, .9 * u, true, false);
    tree(W * .12, H * .97, 1.4 * u, true, false);
    tree(W * .90, H * .98, 1.45 * u, true, true);
    pine(shoreG, W * .975, H * .93, 170 * u, .9);
    rock(shoreG, shoreL(H * .93) - 30 * u, H * .955, 170 * u, 58 * u);
    rock(shoreG, shoreL(H * .87) + 26 * u, H * .90, 96 * u, 34 * u);
    rock(shoreG, shoreR(H * .92) + 20 * u, H * .95, 180 * u, 60 * u);
    rock(shoreG, shoreR(H * .66) - 16 * u, H * .685, 90 * u, 30 * u);
    rock(shoreG, shoreL(H * .60) + 10 * u, H * .62, 84 * u, 28 * u);

    // Water: a few short strokes in the river.
    var water = el("g", { fill: "none", stroke: "#65766d", "stroke-linecap": "round" });
    for (i = 0; i < 16; i++) {
      var wy = R(H * .18, H * .97), wx = R(shoreL(wy) + 30, shoreR(wy) - 140), wl = R(50, 110);
      el("path", { d: "M" + wx.toFixed(0) + " " + wy.toFixed(0) + "q" + (wl / 2).toFixed(0) + " -5 " + wl.toFixed(0) + " 0", "stroke-width": "1", opacity: ".18" }, water);
      el("path", { d: "M" + (wx + 18).toFixed(0) + " " + (wy + 7).toFixed(0) + "h" + (wl * .55).toFixed(0), "stroke-width": ".7", opacity: ".11" }, water);
    }

    // Sun.
    el("circle", { cx: W * .80, cy: H * .095, r: 26 * u, fill: RED, opacity: ".6", filter: "url(#bank-wash)" });
  }

  // ---- Stones and fish ---------------------------------------------------------
  // Each fish has a position relative to the center of its stone and a heading. At rest it lies
  // still at a fixed place near the stone, drawn as a small ink fish. When the stone is active
  // it swims to a place on an arc below the stone, where it is drawn in full and can be selected.
  var fishes = sats.map(function (sat) {
    return { sat: sat, cat: sat.closest(".cat"), link: sat.querySelector(".fish"),
             x: 0, y: 0, ang: 0, homeX: 0, homeY: 0, homeAng: 0, slotX: 0, slotY: 0, held: false, placed: false };
  });

  function layout() {
    var stageH = stage.clientHeight || 700;
    cats.forEach(function (cat, i) {
      var slot = SLOTS[i % SLOTS.length];
      cat.style.setProperty("--px", slot.x + "%");
      cat.style.setProperty("--py", slot.y + "%");
      var cy = slot.y / 100 * stageH;
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
        if (!f.placed) { f.x = f.homeX; f.y = f.homeY; f.ang = f.homeAng; f.placed = true; }
      });
    });
  }

  var last = 0;
  function step(now) {
    requestAnimationFrame(step);
    if (!wide.matches || document.hidden) { last = now; return; }
    var dt = Math.min(.05, (now - last) / 1000 || 0);
    last = now;
    fishes.forEach(function (f) {
      var active = f.cat === openCat, speed = 0, want;
      var tx = active ? f.slotX : f.homeX, ty = active ? f.slotY : f.homeY;
      var gd = Math.hypot(tx - f.x, ty - f.y);
      if (still.matches) { f.x = tx; f.y = ty; gd = 0; }
      if (f.held || gd <= 4) {
        // Arrived: an active fish faces the stone, a resting fish keeps its own heading.
        want = active ? Math.atan2(-f.y, -f.x) : f.homeAng;
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
      f.sat.classList.toggle("resting", !speed);
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
