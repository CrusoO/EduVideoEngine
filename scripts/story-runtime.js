/*
 * The story player (ADR 0091): draws one frame of a story from a time alone, window.__draw(T), T in milliseconds. It is read by scripts/story-video.ts, put in a page next to the
 * story as JSON, and driven frame by frame. Nothing here reads the clock or a random number, so any order of times gives the same pictures. It runs no host text: every number
 * that changes is a function compiled from a parsed expression by story-expr.ts, called with (t, x, u, p).
 */
(function () {
  "use strict";
  var DATA = window.__STORY;
  var SVGNS = "http://www.w3.org/2000/svg";
  var W = 100;
  var H = 45;
  var PAL = DATA.palette;
  var ST = DATA.style; // one outline colour and width, and the flood hand-over point, shared with story.ts (ADR 0096)
  var PROPS = DATA.props; // the drawn objects (story-props.ts), the only copy of them
  var cache = {};

  function fn(js) {
    var f = cache[js];
    if (!f) {
      f = new Function("t", "x", "u", "p", '"use strict";return (' + js + ");");
      cache[js] = f;
    }
    return f;
  }
  function val(v, env) {
    if (typeof v === "number") return v;
    var r = fn(v.js)(env.t || 0, env.x || 0, env.u || 0, env.p || 0);
    return isFinite(r) ? r : 0;
  }
  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }
  var EASE = {
    linear: function (k) { return k; },
    ease: function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
    spring: function (k) { return k >= 1 ? 1 : 1 - Math.exp(-6 * k) * Math.cos(11 * k); },
    smooth: function (k) { return 6 * k * k * k * k * k - 15 * k * k * k * k + 10 * k * k * k; },
    ease_in: function (k) { return k * k * k; },
    ease_out: function (k) { var p = 1 - k; return 1 - p * p * p; },
    ease_in_out_sine: function (k) { return -(Math.cos(Math.PI * k) - 1) / 2; },
    back: function (k) { var c = 1.70158, c3 = c + 1; return k < 0.5 ? (Math.pow(2 * k, 2) * ((c3 + 1) * 2 * k - c3)) / 2 : (Math.pow(2 * k - 2, 2) * ((c3 + 1) * (2 * k - 2) + c3) + 2) / 2; },
    elastic: function (k) { return k === 0 || k === 1 ? k : -Math.pow(2, 10 * k - 10) * Math.sin((10 * k - 10.75) * (2 * Math.PI / 3)); },
    bounce: function (k) { var n = 7.5625, d = 2.75, p = 1 - k; var b = p < 1 / d ? n * p * p : p < 2 / d ? n * (p -= 1.5 / d) * p + 0.75 : p < 2.5 / d ? n * (p -= 2.25 / d) * p + 0.9375 : n * (p -= 2.625 / d) * p + 0.984375; return 1 - b; },
    there_and_back: function (k) { var p = k < 0.5 ? 2 * k : 2 * (1 - k); return 6 * p * p * p * p * p - 15 * p * p * p * p + 10 * p * p * p; },
    wiggle: function (k) { return (4 * k - 4 * k * k) * Math.sin(6.2832 * k); },
    rush_into: function (k) { var s = 6 * k * k * k * k * k - 15 * k * k * k * k + 10 * k * k * k; return 2 * (k < 0.5 ? s : 0.5); },
    rush_from: function (k) { var s = 6 * k * k * k * k * k - 15 * k * k * k * k + 10 * k * k * k; return 2 * (k > 0.5 ? s : 0.5) - 1; },
  };
  // Animated style: per-sentence emphasis state (module scope so build and draw share it)
  var emphasisLastSIdx = -1;
  var emphasisStartMs = -Infinity;
  var EMPHASIS_MS = 280;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function col(name) {
    if (!name || name === "none") return "none";
    if (name[0] === "#") return name;
    return PAL[name] || PAL.ink;
  }
  function lerpColor(fromHex, toHex, t) {
    var f = parseInt(fromHex.slice(1), 16), t2 = parseInt(toHex.slice(1), 16);
    var r = ((f >> 16) & 255) + t * (((t2 >> 16) & 255) - ((f >> 16) & 255));
    var g = ((f >> 8) & 255) + t * (((t2 >> 8) & 255) - ((f >> 8) & 255));
    var b = (f & 255) + t * ((t2 & 255) - (f & 255));
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
  }
  function num(n) {
    return Math.round(n * 1000) / 1000;
  }

  /** 0 to 1 with a small overshoot and no dip below 0 (the "back" easing dips first, which would turn a growing shape upside down) */
  function growScale(a) {
    var c = 1.70158, k = clamp(a, 0, 1) - 1;
    return 1 + (c + 1) * k * k * k + c * k * k;
  }

  /** one part of a prop: its colours are palette names ("outline" is the shared charcoal) and its line width is in stage units, so it is divided by the prop's scale */
  function propPart(pt, k) {
    var a = { fill: pt.fill ? col(pt.fill) : "none", stroke: pt.stroke ? (pt.stroke === "outline" ? ST.inkOutline : col(pt.stroke)) : "none", "stroke-width": num((pt.sw || 0) / k), "stroke-linecap": "round", "stroke-linejoin": "round" };
    if (pt.fill && pt.fillOpacity !== undefined) a["fill-opacity"] = pt.fillOpacity;
    if (pt.tag === "path") a.d = pt.d;
    else if (pt.tag === "rect") { a.x = pt.x; a.y = pt.y; a.width = pt.w; a.height = pt.h; if (pt.rx) a.rx = pt.rx; }
    else if (pt.tag === "circle") { a.cx = pt.cx; a.cy = pt.cy; a.r = pt.r; }
    else { a.x1 = pt.x1; a.y1 = pt.y1; a.x2 = pt.x2; a.y2 = pt.y2; }
    return el(pt.tag, a);
  }

  /* ---- flood: the outline traces, then colour pours in from one side (ADR 0096) ---- */
  /** a is how far the shape has appeared, 0 to 1: the outline takes the first part, the colour only starts once the line has closed */
  function floodPhases(a) {
    return { outline: clamp(a / ST.floodSplit, 0, 1), fill: EASE.ease_in_out_sine(clamp((a - ST.floodSplit) / (1 - ST.floodSplit), 0, 1)) };
  }
  var FLOOD_GEOMETRY = ["d", "points", "cx", "cy", "r", "x", "y", "width", "height", "rx"];
  /** gives a shape that will flood its two layers: the shape itself (colour only, clipped) and an outline drawn over it */
  function makeFlood(rec, defs, id, parent) {
    var shape = rec.parts.shape;
    var clip = el("clipPath", { id: id }, defs);
    var rect = el("rect", {}, clip);
    shape.setAttribute("clip-path", "url(#" + id + ")");
    var outline = el(shape.tagName, { fill: "none", stroke: ST.inkOutline, "stroke-width": ST.outlineWidth, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: "1", "stroke-dasharray": "1 1" }, parent);
    rec.flood = { rect: rect, outline: outline };
  }
  /** after the shape's geometry is set for this frame: copy it to the outline, grow the clip over the colour and trace the line */
  function applyFlood(rec, a) {
    var fl = rec.flood;
    var shape = rec.parts.shape;
    var ph = floodPhases(a);
    for (var i = 0; i < FLOOD_GEOMETRY.length; i++) {
      var g = shape.getAttribute(FLOOD_GEOMETRY[i]);
      if (g === null) fl.outline.removeAttribute(FLOOD_GEOMETRY[i]);
      else fl.outline.setAttribute(FLOOD_GEOMETRY[i], g);
    }
    fl.outline.setAttribute("stroke-dashoffset", num(1 - ph.outline));
    var b = shape.getBBox();
    var f = ph.fill;
    var from = rec.v.floodFrom || "bottom";
    var horizontal = from === "left" || from === "right";
    var w = horizontal ? b.width * f : b.width;
    var h = horizontal ? b.height : b.height * f;
    var x = from === "right" ? b.x + b.width - w : b.x;
    var y = from === "bottom" ? b.y + b.height - h : b.y;
    fl.rect.setAttribute("x", num(x));
    fl.rect.setAttribute("y", num(y));
    fl.rect.setAttribute("width", num(w));
    fl.rect.setAttribute("height", num(h));
  }

  /** a "nice" tick step (1, 2 or 5 times a power of ten) giving about 5 to 8 ticks */
  function niceStep(span) {
    var raw = span / 6;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }
  function fmt(n) {
    var r = Math.round(n * 1e6) / 1e6;
    return String(r === 0 ? 0 : r);
  }
  function label(parent, x, y, s, size, anchor, colour) {
    var t = el("text", { x: num(x), y: num(y), "font-size": size, "text-anchor": anchor || "middle", fill: colour || PAL.soft }, parent);
    t.textContent = s;
    return t;
  }
  /** axes, grid and tick labels of a plot window in a box (drawn once) */
  function drawAxes(g, box, win, grid, xlabel, ylabel) {
    var X = function (v) {
      return box.x + ((v - win.xmin) / (win.xmax - win.xmin)) * box.w;
    };
    var Y = function (v) {
      return box.y + box.h - ((v - win.ymin) / (win.ymax - win.ymin)) * box.h;
    };
    var ax = win.ymin <= 0 && win.ymax >= 0 ? Y(0) : box.y + box.h;
    var ay = win.xmin <= 0 && win.xmax >= 0 ? X(0) : box.x;
    var xs = niceStep(win.xmax - win.xmin);
    var ys = niceStep(win.ymax - win.ymin);
    var i;
    for (i = Math.ceil(win.xmin / xs); i * xs <= win.xmax + 1e-9; i++) {
      var xv = i * xs;
      if (grid) el("line", { x1: num(X(xv)), y1: box.y, x2: num(X(xv)), y2: box.y + box.h, stroke: PAL.rule, "stroke-width": 0.12 }, g);
      if (Math.abs(xv) > 1e-9) {
        el("line", { x1: num(X(xv)), y1: num(ax - 0.5), x2: num(X(xv)), y2: num(ax + 0.5), stroke: PAL.soft, "stroke-width": 0.18 }, g);
        label(g, X(xv), Math.min(ax + 2.6, box.y + box.h + 2.6), fmt(xv), 1.5, "middle");
      }
    }
    for (i = Math.ceil(win.ymin / ys); i * ys <= win.ymax + 1e-9; i++) {
      var yv = i * ys;
      if (grid) el("line", { x1: box.x, y1: num(Y(yv)), x2: box.x + box.w, y2: num(Y(yv)), stroke: PAL.rule, "stroke-width": 0.12 }, g);
      if (Math.abs(yv) > 1e-9) {
        el("line", { x1: num(ay - 0.5), y1: num(Y(yv)), x2: num(ay + 0.5), y2: num(Y(yv)), stroke: PAL.soft, "stroke-width": 0.18 }, g);
        label(g, Math.max(ay - 1.2, box.x - 1.2), Y(yv) + 0.5, fmt(yv), 1.5, "end");
      }
    }
    el("line", { x1: box.x, y1: num(ax), x2: box.x + box.w, y2: num(ax), stroke: PAL.soft, "stroke-width": 0.3 }, g);
    el("line", { x1: num(ay), y1: box.y, x2: num(ay), y2: box.y + box.h, stroke: PAL.soft, "stroke-width": 0.3 }, g);
    if (xlabel) label(g, box.x + box.w, Math.min(ax - 1, box.y + box.h - 1), xlabel, 1.9, "end");
    if (ylabel) label(g, Math.max(ay + 1.2, box.x + 1.2), box.y + 2, ylabel, 1.9, "start");
    return { X: X, Y: Y };
  }

  /* ---- building: every shape becomes a group once; a frame only changes attributes ---- */
  var sceneRecs = [];
  var stage = document.getElementById("stage");
  var clipId = 0;

  function build() {
    // Glow filter: applied to shapes with focus:true so they appear lit even when others dim
    var defs = el("defs", {}, stage);
    var filt = el("filter", { id: "fglow", x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
    el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "1.4", result: "blur" }, filt);
    var fm = el("feMerge", {}, filt);
    el("feMergeNode", { in: "blur" }, fm);
    el("feMergeNode", { in: "SourceGraphic" }, fm);
    // Elevation shadow: ambient occlusion lift for primary actors (elements, sun, barriers) in animated style
    var shadowFilt = el("filter", { id: "felev", x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
    el("feDropShadow", { dx: "0", dy: "0.85", stdDeviation: "1.7", "flood-color": "#0f172a", "flood-opacity": "0.08" }, shadowFilt);

    DATA.scenes.forEach(function (sc, si) {
      var sg = el("g", { display: "none" }, stage);
      // Per-scene background: rendered first so it sits behind all shapes
      if (sc.bg) {
        if (sc.bg.kind === "gradient") {
          var bgGId = "scbg_" + si;
          var bgAngle = ((sc.bg.angle || 180) - 90) * Math.PI / 180;
          var bgGrd = el("linearGradient", { id: bgGId, x1: num(0.5 + Math.cos(bgAngle) * 0.5), y1: num(0.5 + Math.sin(bgAngle) * 0.5), x2: num(0.5 - Math.cos(bgAngle) * 0.5), y2: num(0.5 - Math.sin(bgAngle) * 0.5), gradientUnits: "objectBoundingBox" }, defs);
          el("stop", { offset: "0", "stop-color": sc.bg.from }, bgGrd);
          el("stop", { offset: "1", "stop-color": sc.bg.to }, bgGrd);
          el("rect", { x: 0, y: 0, width: 100, height: 45, fill: "url(#" + bgGId + ")" }, sg);
        } else {
          el("rect", { x: 0, y: 0, width: 100, height: 45, fill: sc.bg.color }, sg);
        }
      }
      var shapeLayer = el("g", {}, sg);
      var textLayer = el("g", {}, sg); // words and formulas are always drawn over the shapes
      // Sort visuals by z-order before building DOM (stable: negative z = behind, positive = front)
      var sorted = sc.visuals.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
      var recs = sorted.map(function (v, vi) {
        var outer = el("g", { display: "none" }, v.kind === "text" || v.kind === "math" ? textLayer : shapeLayer);
        var rec = { v: v, outer: outer, center: null, parts: {}, _ambPhase: vi * 0.7, _ambPeriod: 2500 + vi * 317 };
        var k = v.kind;
        if (v.label && k !== "text" && k !== "math" && k !== "angle" && k !== "axes" && k !== "plot" && k !== "curve" && k !== "numberline" && k !== "trace" && k !== "callout") {
          rec.lblG = el("g", { display: "none" }, textLayer);
          var isAnim = DATA.visualStyle === "animated";
          rec.lbl = el("text", { "font-size": isAnim ? 2.6 : 2.2, "font-weight": isAnim ? "800" : "500", "dominant-baseline": "central", "letter-spacing": isAnim ? "0.08em" : "0" }, rec.lblG);
          rec.lbl.textContent = isAnim ? (v.label || "").toUpperCase() : (v.label || "");
        }
        if (k === "circle") rec.parts.shape = el("circle", {}, outer);
        else if (k === "rect") {
          rec.parts.shape = el("rect", {}, outer);
          // decayInside: true — exponential decay gradient (quantum tunneling barrier: left=full, right=~transparent)
          if (v.decayInside) {
            var gradId = "decayg_" + si + "_" + vi;
            var grad = el("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "1", y2: "0", gradientUnits: "objectBoundingBox" }, defs);
            [[0, 1.0], [0.25, 0.6], [0.5, 0.28], [0.75, 0.12], [1.0, 0.04]].forEach(function(s2) { el("stop", { offset: s2[0], "stop-opacity": s2[1] }, grad); });
            rec.decayGradId = gradId;
            rec.decayGradStops = [].slice.call(grad.children);
          }
        }
        else if (k === "line") rec.parts.shape = el("line", {}, outer);
        else if (k === "arrow") {
          rec.parts.shape = el("path", {}, outer);
          rec.parts.head = el("polygon", {}, outer);
          if (v.midLabel) {
            rec.midLbl = el("text", { "font-size": 2.0, "text-anchor": "middle", "dominant-baseline": "central", "font-weight": "600", display: "none" }, textLayer);
            rec.midLbl.textContent = v.midLabel;
          }
        } else if (k === "polygon") rec.parts.shape = el("polygon", {}, outer);
        else if (k === "prop") {
          // a prop is a group of simple parts in its own box; updateShape places and scales the group
          rec.propDef = PROPS[v.name];
          rec.parts.shape = el("g", {}, outer);
          var propK = v.size / rec.propDef.w;
          rec.propDef.parts.forEach(function (pt) { rec.parts.shape.appendChild(propPart(pt, propK)); });
        }
        else if (k === "path") rec.parts.shape = el("path", { d: v.d }, outer);
        else if (k === "text") rec.parts.shape = el("text", { "font-size": v.size, "text-anchor": v.anchor, "font-weight": v.bold ? "700" : "400", "font-style": v.italic ? "italic" : "normal", "dominant-baseline": "central" }, outer);
        else if (k === "math") {
          var foH = v.display ? 22 : 14;
          var fo = el("foreignObject", { width: 90, height: foH }, outer);
          var div = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
          div.className = "math";
          div.style.cssText = "font-size:" + v.size + "px;line-height:1;height:" + foH + "px;display:flex;align-items:center;justify-content:" + (v.anchor === "middle" ? "center" : v.anchor === "end" ? "flex-end" : "flex-start") + ";white-space:nowrap";
          div.innerHTML = DATA.math[si + ":" + vi] || "";
          fo.appendChild(div);
          rec.parts.fo = fo;
          rec.parts.div = div;
          rec.foH = foH;
        } else if (k === "plot" || k === "curve") {
          if (k === "plot") {
            var ag = el("g", {}, outer);
            drawAxes(ag, v.box, v, v.grid, "", "");
            rec.axes = ag;
            var id = "clip" + clipId++;
            var cp = el("clipPath", { id: id }, outer);
            el("rect", { x: v.box.x, y: v.box.y, width: v.box.w, height: v.box.h }, cp);
            rec.parts.shape = el("path", { "clip-path": "url(#" + id + ")", fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, outer);
            rec.scaleFns = {
              X: function (xv) {
                return v.box.x + ((xv - v.xmin) / (v.xmax - v.xmin)) * v.box.w;
              },
              Y: function (yv) {
                return v.box.y + v.box.h - ((yv - v.ymin) / (v.ymax - v.ymin)) * v.box.h;
              },
            };
          } else rec.parts.shape = el("path", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, outer);
        } else if (k === "axes") {
          drawAxes(outer, v.box, v, v.grid, v.xlabel, v.ylabel);
        } else if (k === "spring") rec.parts.shape = el("polyline", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, outer);
        else if (k === "numberline") {
          rec.parts.shape = el("line", { x1: v.x, y1: v.y, x2: v.x + v.w, y2: v.y, "stroke-width": 0.35 }, outer);
          var X = function (n) {
            return v.x + ((n - v.min) / (v.max - v.min)) * v.w;
          };
          for (var tv = Math.ceil(v.min / v.step - 1e-9); tv * v.step <= v.max + 1e-9; tv++) {
            el("line", { x1: num(X(tv * v.step)), y1: v.y - 0.7, x2: num(X(tv * v.step)), y2: v.y + 0.7, stroke: PAL.soft, "stroke-width": 0.2 }, outer);
            label(outer, X(tv * v.step), v.y + 3, fmt(tv * v.step), 1.6, "middle");
          }
          v.marks.forEach(function (m) {
            el("circle", { cx: num(X(m.at)), cy: v.y, r: 0.9, fill: col(m.color) }, outer);
            if (m.label) label(outer, X(m.at), v.y - 2, m.label, 1.9, "middle", col(m.color));
          });
        } else if (k === "angle") {
          rec.parts.shape = el("path", { fill: "none" }, outer);
          rec.parts.text = el("text", { "font-size": 1.9, "text-anchor": "middle", "dominant-baseline": "central" }, outer);
        } else if (k === "trace") {
          rec.parts.shape = el("polyline", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, outer);
          rec.trail = [];
          rec.trailLastT = -Infinity;
        } else if (k === "callout") {
          rec.parts.bg = el("rect", { rx: 1.2, ry: 1.2 }, outer);
          rec.parts.txt = el("text", { "font-size": 2.0, "text-anchor": "middle", "dominant-baseline": "central", "font-weight": "500" }, outer);
          rec.parts.txt.textContent = v.text;
          rec.parts.line = el("line", { "stroke-linecap": "round", "stroke-width": 0.3 }, outer);
        } else if (k === "sun") {
          // Sun: radial-gradient glow halo (center→transparent) + filled body + 8 rounded rays
          var sunGlowId = "sg_" + si + "_" + vi;
          var sunGrad = el("radialGradient", { id: sunGlowId, cx: "50%", cy: "50%", r: "50%", gradientUnits: "objectBoundingBox" }, defs);
          var sunFillC = col(v.fill || "yellow");
          el("stop", { offset: "0%", "stop-color": sunFillC, "stop-opacity": "0.22" }, sunGrad);
          el("stop", { offset: "55%", "stop-color": sunFillC, "stop-opacity": "0.07" }, sunGrad);
          el("stop", { offset: "100%", "stop-color": sunFillC, "stop-opacity": "0" }, sunGrad);
          rec.sunGlowId = sunGlowId;
          rec.parts.glow = el("circle", {}, outer);
          rec.parts.body = el("circle", {}, outer);
          rec.parts.rays = [];
          for (var ri = 0; ri < 8; ri++) { rec.parts.rays.push(el("line", { "stroke-linecap": "round" }, outer)); }
          // Kurzgesagt-style face: big dark eyes + white sparkle highlights + wide smile
          rec.parts.eye1 = el("circle", { fill: "#1c1000" }, outer);
          rec.parts.eye2 = el("circle", { fill: "#1c1000" }, outer);
          rec.parts.eye1hl = el("circle", { fill: "white" }, outer);
          rec.parts.eye2hl = el("circle", { fill: "white" }, outer);
          rec.parts.smile = el("path", { fill: "none", stroke: "#1c1000", "stroke-linecap": "round", "stroke-linejoin": "round" }, outer);
        } else if (k === "element") {
          // Element: radial-gradient glow aura + colored disc + outer charge ring + white symbol
          var elemGlowId = "eg_" + si + "_" + vi;
          var elemGrad = el("radialGradient", { id: elemGlowId, cx: "50%", cy: "50%", r: "50%", gradientUnits: "objectBoundingBox" }, defs);
          var elemFillC = col(v.fill || "blue");
          el("stop", { offset: "0%", "stop-color": elemFillC, "stop-opacity": "0.28" }, elemGrad);
          el("stop", { offset: "60%", "stop-color": elemFillC, "stop-opacity": "0.08" }, elemGrad);
          el("stop", { offset: "100%", "stop-color": elemFillC, "stop-opacity": "0" }, elemGrad);
          rec.elemGlowId = elemGlowId;
          rec.parts.glow = el("circle", {}, outer);
          rec.parts.body = el("circle", {}, outer);
          rec.parts.ring = el("circle", { fill: "none" }, outer);
          rec.parts.sym = el("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-weight": "900" }, outer);
          rec.parts.sym.textContent = v.symbol || "";
        } else if (k === "fuzzy") {
          // Quantum probability wave: organic bezier blob + 3 smooth sine-wave lines inside
          rec.parts.blob = el("path", { "stroke-linejoin": "round", "stroke-linecap": "round" }, outer);
          rec.parts.waves = [];
          for (var wi2 = 0; wi2 < 3; wi2++) { rec.parts.waves.push(el("path", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, outer)); }
        } else if (k === "particles") {
          // Orbital particle cloud: N dots orbiting (cx,cy) with deterministic phases
          rec.parts.particleEls = [];
          rec.particleSeed = [];
          var pn = Math.min(typeof v.n === "number" ? v.n : 14, 40);
          for (var pi = 0; pi < pn; pi++) {
            var pBaseA = (pi / pn) * Math.PI * 2;
            var pDist = 0.3 + ((pi * 7919) % 97) / 97 * 0.7;
            rec.particleSeed.push({ a: pBaseA, d: pDist, phase: pi * 1.3 });
            rec.parts.particleEls.push(el("circle", {}, outer));
          }
        }
        if (v.how === "flood" && (k === "circle" || k === "rect" || k === "polygon" || k === "path")) makeFlood(rec, defs, "flood" + (clipId++), outer);
        if (v.how === "write") {
          var wclipId = "wclip" + (clipId++);
          var wcp = el("clipPath", { id: wclipId }, outer.parentNode || stage);
          rec.writeRect = el("rect", { x: "0", y: "0", width: "0", height: "45" }, wcp);
          outer.setAttribute("clip-path", "url(#" + wclipId + ")");
        }
        if (v.focus) outer.setAttribute("filter", "url(#fglow)");
        // Elevation shadow on primary actors in animated style
        if (DATA.visualStyle === "animated" && !v.focus && (k === "element" || k === "sun" || (k === "rect" && v.label) || (k === "circle" && v.signal))) outer.setAttribute("filter", "url(#felev)");
        return rec;
      });
      // Link trace/callout/toId-arrow shapes to their referenced recs
      recs.forEach(function (trec) {
        if (trec.v.kind === "trace") {
          trec.sourceRec = null;
          for (var li = 0; li < recs.length; li++) { if (recs[li].v.id === trec.v.sourceId) { trec.sourceRec = recs[li]; break; } }
        } else if (trec.v.kind === "callout") {
          trec.targetRec = null;
          for (var li = 0; li < recs.length; li++) { if (recs[li].v.id === trec.v.target) { trec.targetRec = recs[li]; break; } }
        } else if (trec.v.kind === "arrow" && trec.v.toId) {
          trec.toIdRec = null;
          for (var li = 0; li < recs.length; li++) { if (recs[li].v.id === trec.v.toId) { trec.toIdRec = recs[li]; break; } }
        }
      });
      sceneRecs.push({ sc: sc, g: sg, recs: recs });
    });
    // Animated style: iris wipe clipPaths (one per scene except the first)
    if (DATA.visualStyle === "animated") {
      var defs2 = stage.querySelector("defs");
      sceneRecs.forEach(function (sr, si) {
        if (si === 0) return;
        var cpId = "iris" + si;
        var cp = el("clipPath", { id: cpId }, defs2);
        sr.irisCirc = el("circle", { cx: 50, cy: 22.5, r: 0 }, cp);
        sr.g.setAttribute("clip-path", "url(#" + cpId + ")");
      });
    }
  }

  /* ---- one shape at time T ---- */
  function ptsPath(pts) {
    var d = "";
    for (var i = 0; i < pts.length; i++) d += (i === 0 || pts[i] === null ? "M" : "L") + num(pts[i][0]) + " " + num(pts[i][1]) + " ";
    return d;
  }
  function styleOf(rec, over, progress, drawing) {
    var v = rec.v;
    var s = rec.parts.shape;
    if (!s) return;
    var stroke = col(over || v.color);
    var kind = v.kind;
    if (kind === "text" || kind === "math") {
      s.setAttribute("fill", stroke);
      return;
    }
    if (kind === "trace" || kind === "callout" || kind === "prop") return; // handled in updateShape (a prop colours its own parts)
    s.setAttribute("stroke", stroke);
    s.setAttribute("stroke-width", v.width);
    var fillColor = kind === "plot" || kind === "curve" || kind === "spring" || kind === "trace" || (kind === "path" && v.fill === "none") ? "none" : col(v.fill);
    s.setAttribute("fill", fillColor);
    if (fillColor !== "none" && v.fillOpacity !== undefined && v.fillOpacity < 1) s.setAttribute("fill-opacity", num(v.fillOpacity));
    // exponential decay gradient for barrier rects — overrides solid fill
    if (kind === "rect" && rec.decayGradId) {
      var stopC = col(over || v.fill);
      rec.decayGradStops.forEach(function(st) { st.setAttribute("stop-color", stopC); });
      s.setAttribute("fill", "url(#" + rec.decayGradId + ")");
      s.removeAttribute("fill-opacity");
    }
    if (kind === "path" || kind === "polygon" || kind === "circle" || kind === "rect" || kind === "line") s.setAttribute("pathLength", "1");
    if (kind === "path" || kind === "line" || kind === "polygon" || kind === "arrow") s.setAttribute("stroke-linecap", "round");
    if (kind === "path" || kind === "polygon" || kind === "rect") s.setAttribute("stroke-linejoin", "round");
    if (rec.flood) {
      // the colour layer has no line of its own: the outline layer (applyFlood) draws it, in the shared charcoal
      s.setAttribute("stroke", "none");
      s.removeAttribute("stroke-dasharray");
      s.removeAttribute("stroke-dashoffset");
    } else if (drawing && progress < 1) {
      s.setAttribute("stroke-dasharray", "1 1");
      s.setAttribute("stroke-dashoffset", num(1 - progress));
    } else if (v.dash) {
      s.setAttribute("stroke-dasharray", "1.2 1");
      s.removeAttribute("stroke-dashoffset");
    } else {
      s.removeAttribute("stroke-dasharray");
      s.removeAttribute("stroke-dashoffset");
    }
  }

  function updateShape(rec, T, a, env, over) {
    var v = rec.v;
    var p = rec.parts;
    var drawing = v.how === "draw" || v.how === "arc";
    var prog = drawing ? a : 1;
    var k = v.kind;
    styleOf(rec, over, prog, drawing && (k === "circle" || k === "rect" || k === "line" || k === "polygon" || k === "path"));
    if (k === "circle") {
      p.shape.setAttribute("cx", num(val(v.cx, env)));
      p.shape.setAttribute("cy", num(val(v.cy, env)));
      p.shape.setAttribute("r", num(Math.max(0, val(v.r, env))));
    } else if (k === "rect") {
      p.shape.setAttribute("x", num(val(v.x, env)));
      p.shape.setAttribute("y", num(val(v.y, env)));
      p.shape.setAttribute("width", num(Math.max(0, val(v.w, env))));
      p.shape.setAttribute("height", num(Math.max(0, val(v.h, env))));
      var rxVal = v.round != null ? v.round : (DATA.visualStyle === "animated" ? 0.7 : 0);
      if (rxVal) p.shape.setAttribute("rx", rxVal);
    } else if (k === "line") {
      p.shape.setAttribute("x1", num(val(v.x1, env)));
      p.shape.setAttribute("y1", num(val(v.y1, env)));
      p.shape.setAttribute("x2", num(val(v.x2, env)));
      p.shape.setAttribute("y2", num(val(v.y2, env)));
    } else if (k === "arrow") {
      var x1 = val(v.x1, env), y1 = val(v.y1, env);
      var x2, y2;
      if (rec.toIdRec) {
        var tgEnv = { t: Math.max(0, (T - rec.toIdRec.v.inMs) / 1000) };
        var tgG = geomOf(rec.toIdRec.v, tgEnv);
        if (tgG) { x2 = tgG.cx; y2 = tgG.cy; } else { x2 = val(v.x2, env); y2 = val(v.y2, env); }
      } else { x2 = val(v.x2, env); y2 = val(v.y2, env); }
      var ex = x1 + (x2 - x1) * prog, ey = y1 + (y2 - y1) * prog;
      var len = Math.hypot(ex - x1, ey - y1);
      var ang = Math.atan2(ey - y1, ex - x1);
      var hs = Math.min(0.9 + v.width * 3, len * 0.6);
      var bx = ex - Math.cos(ang) * hs, by = ey - Math.sin(ang) * hs;
      var col_ = col(over || v.color);
      p.shape.setAttribute("d", "M" + num(x1) + " " + num(y1) + " L" + num(bx) + " " + num(by));
      p.shape.setAttribute("stroke", col_);
      p.shape.setAttribute("stroke-width", v.width);
      p.shape.setAttribute("fill", "none");
      p.shape.setAttribute("stroke-linecap", "round");
      p.head.setAttribute("points", num(ex) + "," + num(ey) + " " + num(bx - Math.sin(ang) * hs * 0.5) + "," + num(by + Math.cos(ang) * hs * 0.5) + " " + num(bx + Math.sin(ang) * hs * 0.5) + "," + num(by - Math.cos(ang) * hs * 0.5));
      p.head.setAttribute("fill", col_);
      p.head.setAttribute("display", len < 0.05 ? "none" : "");
      // midLabel: text rendered at the arrow's midpoint, offset perpendicular to the arrow
      if (rec.midLbl && prog >= 0.5) {
        var mx = (x1 + ex) / 2, my = (y1 + ey) / 2;
        var perpX = -Math.sin(ang), perpY = Math.cos(ang);
        rec.midLbl.setAttribute("x", num(mx + perpX * 2));
        rec.midLbl.setAttribute("y", num(my + perpY * 2));
        rec.midLbl.setAttribute("fill", col_);
        rec.midLbl.removeAttribute("display");
      } else if (rec.midLbl) {
        rec.midLbl.setAttribute("display", "none");
      }
    } else if (k === "polygon") {
      p.shape.setAttribute("points", v.points.map(function (q) { return num(val(q[0], env)) + "," + num(val(q[1], env)); }).join(" "));
    } else if (k === "prop") {
      // the group's box is placed so its anchor (bottom middle, or the centre) sits on (cx, cy); scaling it later is about that same point
      var pd = rec.propDef;
      var pk = v.size / pd.w;
      var pcx = val(v.cx, env), pcy = val(v.cy, env);
      var pox = pcx - (pd.w * pk) / 2;
      var poy = pd.anchor === "bottom" ? pcy - pd.h * pk : pcy - (pd.h * pk) / 2;
      p.shape.setAttribute("transform", "translate(" + num(pox) + " " + num(poy) + ") scale(" + num(pk) + ")");
      rec.center = [pcx, pcy];
    } else if (k === "text") {
      var s = v.text;
      for (var i = 0; i < v.values.length; i++) s = s.split("{" + i + "}").join(val(v.values[i], env).toFixed(v.decimals));
      p.shape.setAttribute("x", num(val(v.x, env)));
      var ty = val(v.y, env);
      // Clamp text to avoid the caption band at the bottom in animated style
      if (DATA.visualStyle === "animated") ty = Math.min(36, ty);
      p.shape.setAttribute("y", num(ty));
      if (p.shape.textContent !== s) p.shape.textContent = s;
    } else if (k === "math") {
      var mx = val(v.x, env), my = val(v.y, env);
      p.fo.setAttribute("x", num(v.anchor === "middle" ? mx - 45 : v.anchor === "end" ? mx - 90 : mx));
      p.fo.setAttribute("y", num(my - (rec.foH || 14) / 2));
      p.div.style.color = col(over || v.color);
    } else if (k === "plot") {
      var n = v.samples;
      // sweep: true grows the graph left-to-right using elapsed t (2 s to full curve)
      var sweepProg = v.sweep ? Math.min(1, env.t / 2) : prog;
      var upto = Math.max(1, Math.round(n * sweepProg));
      var pen = false;
      var d = "";
      for (var j = 0; j <= upto; j++) {
        var xv = v.xmin + ((v.xmax - v.xmin) * j) / n;
        var yv = fn(v.fn.js)(env.t, xv, 0, 0);
        if (!isFinite(yv) || yv < v.ymin - (v.ymax - v.ymin) || yv > v.ymax + (v.ymax - v.ymin)) {
          pen = false;
          continue;
        }
        d += (pen ? "L" : "M") + num(rec.scaleFns.X(xv)) + " " + num(rec.scaleFns.Y(yv)) + " ";
        pen = true;
      }
      p.shape.setAttribute("d", d);
    } else if (k === "curve") {
      var dd = "";
      var up = Math.max(1, Math.round(v.samples * prog));
      for (var m = 0; m <= up; m++) {
        var uu = v.u0 + ((v.u1 - v.u0) * m) / v.samples;
        var cx = fn(v.xfn.js)(env.t, 0, uu, 0), cy = fn(v.yfn.js)(env.t, 0, uu, 0);
        if (isFinite(cx) && isFinite(cy)) dd += (m === 0 ? "M" : "L") + num(cx) + " " + num(cy) + " ";
      }
      p.shape.setAttribute("d", dd);
    } else if (k === "spring") {
      var sx1 = val(v.x1, env), sy1 = val(v.y1, env), sx2 = val(v.x2, env), sy2 = val(v.y2, env);
      var dx = sx2 - sx1, dy = sy2 - sy1;
      var L = Math.hypot(dx, dy) || 1e-6;
      var ux = dx / L, uy = dy / L;
      var nx = -uy, ny = ux;
      var segs = v.coils * 2;
      var effAmp = Math.min(v.amp, L * 0.22);
      var pts2 = [[sx1, sy1], [sx1 + ux * L * 0.08, sy1 + uy * L * 0.08]];
      for (var c = 1; c <= segs; c++) {
        var f = 0.08 + (0.84 * (c - 0.5)) / segs;
        var side = c % 2 ? 1 : -1;
        pts2.push([sx1 + ux * L * f + nx * effAmp * side, sy1 + uy * L * f + ny * effAmp * side]);
      }
      pts2.push([sx1 + ux * L * 0.92, sy1 + uy * L * 0.92], [sx2, sy2]);
      var take = Math.max(2, Math.round(pts2.length * prog));
      p.shape.setAttribute("points", pts2.slice(0, take).map(function (q) { return num(q[0]) + "," + num(q[1]); }).join(" "));
    } else if (k === "numberline") {
      p.shape.setAttribute("stroke", col(over || v.color));
    } else if (k === "angle") {
      var ax0 = val(v.cx, env), ay0 = val(v.cy, env);
      var r0 = v.r;
      var a0 = (v.from * Math.PI) / 180, a1 = (v.from + (v.to - v.from) * prog) * Math.PI / 180;
      var angSweep = v.to >= v.from ? 1 : 0;
      var large = Math.abs((a1 - a0) * 180 / Math.PI) > 180 ? 1 : 0;
      p.shape.setAttribute("d", "M" + num(ax0 + r0 * Math.cos(a0)) + " " + num(ay0 + r0 * Math.sin(a0)) + " A" + r0 + " " + r0 + " 0 " + large + " " + angSweep + " " + num(ax0 + r0 * Math.cos(a1)) + " " + num(ay0 + r0 * Math.sin(a1)));
      p.shape.setAttribute("stroke", col(over || v.color));
      p.shape.setAttribute("stroke-width", v.width);
      var mid = (a0 + a1) / 2;
      p.text.setAttribute("x", num(ax0 + (r0 + 2.4) * Math.cos(mid)));
      p.text.setAttribute("y", num(ay0 + (r0 + 2.4) * Math.sin(mid)));
      p.text.setAttribute("fill", col(over || v.color));
      if (p.text.textContent !== v.label) p.text.textContent = v.label;
    } else if (k === "trace") {
      // Trail is updated in updateVisual before this call; just draw it
      if (rec.trail && rec.trail.length > 1) {
        p.shape.setAttribute("points", rec.trail.map(function (q) { return num(q[0]) + "," + num(q[1]); }).join(" "));
        p.shape.setAttribute("stroke", col(over || v.color));
        p.shape.setAttribute("stroke-width", v.width);
        p.shape.setAttribute("opacity", String(v.opacity));
      }
    } else if (k === "callout") {
      if (!rec.targetRec) return;
      var tg = geomOf(rec.targetRec.v, env);
      if (!tg) return;
      var boxW = Math.min(v.text.length * 1.3 + 3, 26), boxH = 4.0;
      var bx, by;
      if (v.side === "above") { bx = clamp(tg.cx, boxW / 2 + 2, 98 - boxW / 2); by = tg.cy - tg.hy - 5; }
      else if (v.side === "below") { bx = clamp(tg.cx, boxW / 2 + 2, 98 - boxW / 2); by = tg.cy + tg.hy + 5; }
      else if (v.side === "left") { bx = tg.cx - tg.hx - boxW / 2 - 3; by = tg.cy; }
      else { bx = tg.cx + tg.hx + boxW / 2 + 3; by = tg.cy; }
      by = clamp(by, boxH / 2 + 2, 43 - boxH / 2);
      bx = clamp(bx, boxW / 2 + 1, 99 - boxW / 2);
      var callC = col(v.color);
      p.bg.setAttribute("x", num(bx - boxW / 2)); p.bg.setAttribute("y", num(by - boxH / 2));
      p.bg.setAttribute("width", num(boxW)); p.bg.setAttribute("height", num(boxH));
      p.bg.setAttribute("fill", PAL.panel || PAL.soft); p.bg.setAttribute("stroke", callC); p.bg.setAttribute("stroke-width", 0.3);
      p.txt.setAttribute("x", num(bx)); p.txt.setAttribute("y", num(by)); p.txt.setAttribute("fill", callC);
      var ddx = tg.cx - bx, ddy = tg.cy - by, ddist = Math.hypot(ddx, ddy) || 1;
      var lx = bx + (ddx / ddist) * (boxW / 2 + 0.3), ly = by + (ddy / ddist) * (boxH / 2 + 0.2);
      p.line.setAttribute("x1", num(lx)); p.line.setAttribute("y1", num(ly));
      p.line.setAttribute("x2", num(tg.cx)); p.line.setAttribute("y2", num(tg.cy));
      p.line.setAttribute("stroke", callC);
    } else if (k === "sun") {
      var sunCx = val(v.cx, env), sunCy = val(v.cy, env);
      var sr = Math.max(0, val(v.r, env));
      var rayInner = sr * 1.28, rayOuter = sr * 1.75;
      var fillC = col(v.fill || "yellow");
      var sw = v.width || 0.5;
      // Geometry — shared for both flood and fade branches
      p.glow.setAttribute("cx", num(sunCx)); p.glow.setAttribute("cy", num(sunCy)); p.glow.setAttribute("r", num(sr * 2.4));
      p.glow.setAttribute("fill", "url(#" + rec.sunGlowId + ")");
      p.body.setAttribute("cx", num(sunCx)); p.body.setAttribute("cy", num(sunCy)); p.body.setAttribute("r", num(sr));
      var faceEr = sr * 0.20, faceEx = sr * 0.28, faceEy = sr * 0.22;
      var e1x = sunCx - faceEx, e1y = sunCy - faceEy;
      var e2x = sunCx + faceEx, e2y = sunCy - faceEy;
      p.eye1.setAttribute("cx", num(e1x)); p.eye1.setAttribute("cy", num(e1y)); p.eye1.setAttribute("r", num(faceEr));
      p.eye2.setAttribute("cx", num(e2x)); p.eye2.setAttribute("cy", num(e2y)); p.eye2.setAttribute("r", num(faceEr));
      var hlR = faceEr * 0.38;
      p.eye1hl.setAttribute("cx", num(e1x + faceEr * 0.36)); p.eye1hl.setAttribute("cy", num(e1y - faceEr * 0.36)); p.eye1hl.setAttribute("r", num(hlR));
      p.eye2hl.setAttribute("cx", num(e2x + faceEr * 0.36)); p.eye2hl.setAttribute("cy", num(e2y - faceEr * 0.36)); p.eye2hl.setAttribute("r", num(hlR));
      var smileHalf = sr * 0.52, smileBaseline = sunCy + sr * 0.32, arcR = sr * 0.62;
      p.smile.setAttribute("d", "M " + num(sunCx - smileHalf) + " " + num(smileBaseline) + " A " + num(arcR) + " " + num(arcR) + " 0 0 0 " + num(sunCx + smileHalf) + " " + num(smileBaseline));
      p.smile.setAttribute("stroke-width", num(sr * 0.11));
      p.rays.forEach(function (ray, ri) {
        var angle = (ri / 8) * Math.PI * 2 - Math.PI / 2;
        ray.setAttribute("x1", num(sunCx + Math.cos(angle) * rayInner));
        ray.setAttribute("y1", num(sunCy + Math.sin(angle) * rayInner));
        ray.setAttribute("x2", num(sunCx + Math.cos(angle) * rayOuter));
        ray.setAttribute("y2", num(sunCy + Math.sin(angle) * rayOuter));
      });
      if (v.how === "flood") {
        // the outline traces first; the colour, the rays and the face follow once the line has closed (same phases as every flooded shape)
        var ph = floodPhases(a);
        p.glow.setAttribute("opacity", num(ph.fill));
        p.body.setAttribute("fill", fillC);
        p.body.setAttribute("fill-opacity", num(ph.fill));
        p.body.setAttribute("stroke", ST.inkOutline);
        p.body.setAttribute("stroke-width", ST.outlineWidth);
        p.body.setAttribute("pathLength", "1");
        p.body.setAttribute("stroke-dasharray", "1 1");
        p.body.setAttribute("stroke-dashoffset", num(1 - ph.outline));
        p.body.removeAttribute("opacity");
        p.rays.forEach(function (ray) {
          ray.setAttribute("stroke", fillC); ray.setAttribute("stroke-width", num(sw * 1.5));
          ray.setAttribute("pathLength", "1");
          ray.setAttribute("stroke-dasharray", "1 1");
          ray.setAttribute("stroke-dashoffset", num(1 - ph.fill));
          ray.removeAttribute("opacity");
        });
        p.eye1.setAttribute("opacity", num(ph.fill)); p.eye2.setAttribute("opacity", num(ph.fill));
        p.eye1hl.setAttribute("opacity", num(ph.fill)); p.eye2hl.setAttribute("opacity", num(ph.fill));
        p.smile.setAttribute("opacity", num(ph.fill));
      } else {
        // Standard fade: dark outline always visible for a clean bordered look
        p.glow.setAttribute("opacity", num(a));
        p.body.setAttribute("fill", fillC); p.body.setAttribute("stroke", ST.inkOutline); p.body.setAttribute("stroke-width", num(sw * 1.5));
        p.body.removeAttribute("stroke-dasharray"); p.body.removeAttribute("stroke-dashoffset"); p.body.removeAttribute("pathLength");
        p.body.setAttribute("fill-opacity", "1"); p.body.setAttribute("opacity", num(a));
        p.rays.forEach(function (ray) {
          ray.setAttribute("stroke", fillC); ray.setAttribute("stroke-width", num(sw * 1.5));
          ray.removeAttribute("stroke-dasharray"); ray.removeAttribute("stroke-dashoffset"); ray.removeAttribute("pathLength");
          ray.setAttribute("opacity", num(a));
        });
        p.eye1.setAttribute("opacity", num(a)); p.eye2.setAttribute("opacity", num(a));
        p.eye1hl.setAttribute("opacity", num(a)); p.eye2hl.setAttribute("opacity", num(a));
        p.smile.setAttribute("opacity", num(a));
      }
    } else if (k === "element") {
      var ecx = val(v.cx, env), ecy = val(v.cy, env);
      var er = Math.max(0, val(v.r, env));
      var efill = col(v.fill || "blue");
      var esw = v.width || 0.5;
      // Geometry — shared
      p.glow.setAttribute("cx", num(ecx)); p.glow.setAttribute("cy", num(ecy)); p.glow.setAttribute("r", num(er * 2.0));
      p.glow.setAttribute("fill", "url(#" + rec.elemGlowId + ")");
      p.body.setAttribute("cx", num(ecx)); p.body.setAttribute("cy", num(ecy)); p.body.setAttribute("r", num(er));
      p.ring.setAttribute("cx", num(ecx)); p.ring.setAttribute("cy", num(ecy)); p.ring.setAttribute("r", num(er + 0.8));
      p.sym.setAttribute("x", num(ecx)); p.sym.setAttribute("y", num(ecy));
      p.sym.setAttribute("font-size", num(er * 0.82)); p.sym.setAttribute("fill", "#ffffff");
      if (v.how === "flood") {
        var eph = floodPhases(a);
        p.glow.setAttribute("opacity", num(eph.fill));
        p.body.setAttribute("fill", efill); p.body.setAttribute("fill-opacity", num(eph.fill));
        p.body.setAttribute("stroke", ST.inkOutline); p.body.setAttribute("stroke-width", ST.outlineWidth);
        p.body.setAttribute("pathLength", "1");
        p.body.setAttribute("stroke-dasharray", "1 1");
        p.body.setAttribute("stroke-dashoffset", num(1 - eph.outline));
        p.body.removeAttribute("opacity");
        p.ring.setAttribute("stroke", efill); p.ring.setAttribute("stroke-width", "0.3"); p.ring.setAttribute("opacity", "0");
        p.sym.setAttribute("opacity", num(eph.fill));
      } else {
        // Standard fade with dark outline
        p.glow.setAttribute("opacity", num(a));
        p.body.setAttribute("fill", efill); p.body.setAttribute("fill-opacity", "1");
        p.body.setAttribute("stroke", ST.inkOutline); p.body.setAttribute("stroke-width", num(esw * 1.5));
        p.body.removeAttribute("stroke-dasharray"); p.body.removeAttribute("stroke-dashoffset"); p.body.removeAttribute("pathLength");
        p.body.setAttribute("opacity", num(a));
        p.ring.setAttribute("stroke", efill); p.ring.setAttribute("stroke-width", "0.3"); p.ring.setAttribute("opacity", num(a * 0.4));
        p.sym.setAttribute("opacity", num(a));
      }
    } else if (k === "fuzzy") {
      var fcx = val(v.cx, env), fcy = val(v.cy, env), fr = Math.max(0, val(v.r, env));
      // Organic blob: 10 control points with varied radii connected via Catmull-Rom cubic bezier
      var fbumps = [1.20, 0.82, 1.28, 0.78, 1.16, 0.85, 1.24, 0.80, 1.18, 0.84];
      var fn_ = fbumps.length;
      var fpts = [];
      for (var fi = 0; fi < fn_; fi++) {
        var fangle = (fi / fn_) * Math.PI * 2 - Math.PI / 2;
        fpts.push([fcx + Math.cos(fangle) * fr * fbumps[fi], fcy + Math.sin(fangle) * fr * fbumps[fi]]);
      }
      // Build smooth closed cubic bezier path through all control points (Catmull-Rom → cubic)
      var blobD = "M" + num(fpts[0][0]) + " " + num(fpts[0][1]) + " ";
      for (var fi2 = 0; fi2 < fn_; fi2++) {
        var fp0 = fpts[(fi2 - 1 + fn_) % fn_];
        var fp1 = fpts[fi2];
        var fp2 = fpts[(fi2 + 1) % fn_];
        var fp3 = fpts[(fi2 + 2) % fn_];
        var fc1x = fp1[0] + (fp2[0] - fp0[0]) * 0.20;
        var fc1y = fp1[1] + (fp2[1] - fp0[1]) * 0.20;
        var fc2x = fp2[0] - (fp3[0] - fp1[0]) * 0.20;
        var fc2y = fp2[1] - (fp3[1] - fp1[1]) * 0.20;
        blobD += "C" + num(fc1x) + " " + num(fc1y) + " " + num(fc2x) + " " + num(fc2y) + " " + num(fp2[0]) + " " + num(fp2[1]) + " ";
      }
      blobD += "Z";
      var fc = col(v.fill || "purple");
      var fFillOp = v.fillOpacity !== undefined ? v.fillOpacity : 0.25;
      p.blob.setAttribute("d", blobD);
      p.blob.setAttribute("fill", fc); p.blob.setAttribute("fill-opacity", num(fFillOp));
      p.blob.setAttribute("stroke", fc); p.blob.setAttribute("stroke-width", v.width || 0.5);
      p.blob.setAttribute("opacity", num(a));
      // Smooth sine waves using cubic bezier — 2 complete half-periods across blob interior
      p.waves.forEach(function (wave, wi) {
        // Animated style: wave lines oscillate per frame (~3 Hz) — makes the blob feel alive
        var wyBase = fcy + fr * (-0.30 + wi * 0.30);
        var wy = wyBase + (DATA.visualStyle === "animated" ? fr * 0.08 * Math.sin(T / 300 + wi * Math.PI) : 0);
        var wx0 = fcx - fr * 0.65, wx1 = fcx + fr * 0.65;
        var wamp = fr * 0.14;
        var half = (wx1 - wx0) / 2;
        var ctrl = half * 0.44;
        var wpath = "M" + num(wx0) + " " + num(wy) +
          " C" + num(wx0 + ctrl) + " " + num(wy - wamp) + " " + num(wx0 + half - ctrl) + " " + num(wy + wamp) + " " + num(wx0 + half) + " " + num(wy) +
          " C" + num(wx0 + half + ctrl) + " " + num(wy - wamp) + " " + num(wx1 - ctrl) + " " + num(wy + wamp) + " " + num(wx1) + " " + num(wy);
        wave.setAttribute("d", wpath); wave.setAttribute("stroke", fc); wave.setAttribute("stroke-width", 0.32);
        wave.setAttribute("opacity", num(a));
      });
    } else if (k === "particles") {
      var pcx2 = val(v.cx, env), pcy2 = val(v.cy, env), pr2 = Math.max(0, val(v.r, env));
      var pSpeed2 = v.speed !== undefined ? v.speed : 0.3;
      var pSz = v.size !== undefined ? v.size : 0.5;
      var pCol = col(over || v.color);
      for (var pj = 0; pj < (rec.parts.particleEls || []).length; pj++) {
        var pseed2 = rec.particleSeed[pj];
        var pAng = pseed2.a + (T / 1000) * pSpeed2 + pseed2.phase;
        var pDx = pcx2 + Math.cos(pAng) * pr2 * pseed2.d;
        var pDy = pcy2 + Math.sin(pAng) * pr2 * pseed2.d * 0.55;
        rec.parts.particleEls[pj].setAttribute("cx", num(pDx));
        rec.parts.particleEls[pj].setAttribute("cy", num(pDy));
        rec.parts.particleEls[pj].setAttribute("r", num(pSz));
        rec.parts.particleEls[pj].setAttribute("fill", pCol);
        rec.parts.particleEls[pj].setAttribute("opacity", num(a * (0.5 + 0.5 * ((Math.sin(pseed2.phase + T / 800) + 1) / 2))));
      }
    }
  }

  /** the centre and half size of a shape in stage units, for placing its label */
  function geomOf(v, env) {
    var k = v.kind;
    if (k === "path") {
      return { cx: v.cx !== undefined ? val(v.cx, env) : 50, cy: v.cy !== undefined ? val(v.cy, env) : 22.5, hx: 5, hy: 5 };
    }
    if (k === "circle") {
      var r = Math.max(0, val(v.r, env));
      return { cx: val(v.cx, env), cy: val(v.cy, env), hx: r, hy: r };
    }
    if (k === "rect") {
      var w = val(v.w, env), h = val(v.h, env);
      return { cx: val(v.x, env) + w / 2, cy: val(v.y, env) + h / 2, hx: Math.abs(w) / 2, hy: Math.abs(h) / 2 };
    }
    if (k === "line" || k === "arrow" || k === "spring") {
      var a = val(v.x1, env), b = val(v.y1, env), c = val(v.x2, env), d = val(v.y2, env);
      return { cx: (a + c) / 2, cy: (b + d) / 2, hx: Math.abs(c - a) / 2, hy: Math.abs(d - b) / 2 };
    }
    if (k === "polygon") {
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (var i = 0; i < v.points.length; i++) {
        var px = val(v.points[i][0], env), py = val(v.points[i][1], env);
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2 };
    }
    // sun, element, fuzzy, particles all use cx/cy/r
    if (k === "sun" || k === "element" || k === "fuzzy" || k === "particles") {
      var gr = Math.max(0, val(v.r, env));
      var outerR = k === "sun" ? gr * 1.65 : gr;
      return { cx: val(v.cx, env), cy: val(v.cy, env), hx: outerR, hy: outerR };
    }
    return null;
  }
  function placeLabel(rec, env) {
    var v = rec.v;
    var g = geomOf(v, env);
    // a path or a prop has no centre or size in its numbers, so its label is anchored to what is drawn (ADR 0097, 0098)
    if ((v.kind === "path" || v.kind === "prop") && rec.parts.shape) {
      var pb = v.kind === "prop" ? rec.outer.getBBox() : rec.parts.shape.getBBox();
      g = { cx: pb.x + pb.width / 2, cy: pb.y + pb.height / 2, hx: pb.width / 2, hy: pb.height / 2 };
    }
    if (!g) return;
    var x = g.cx, y = g.cy, anchor = "middle", fill = PAL.ink;
    // the label keeps one gap (16 px) from the shape: the gap, plus half the text height when the label sits above or below
    var halfText = (parseFloat(rec.lbl.getAttribute("font-size")) || 2.2) / 2;
    var gap = ST.labelGap;
    if (v.labelPos === "above") { y = g.cy - g.hy - gap - halfText; }
    else if (!v.labelPos || v.labelPos === "below") { y = g.cy + g.hy + gap + halfText; }
    else if (v.labelPos === "left") { x = g.cx - g.hx - gap; anchor = "end"; }
    else if (v.labelPos === "right") { x = g.cx + g.hx + gap; anchor = "start"; }
    else if (v.labelPos === "center") { /* label stays at shape center */ }
    x = Math.max(2, Math.min(98, x));
    // Cap at y=38 for animated style to stay clear of the bottom caption band (caption covers ~y40-45)
    var yMax = DATA.visualStyle === "animated" ? 38 : 43;
    y = Math.max(1.5, Math.min(yMax, y));
    rec.lbl.setAttribute("x", num(x));
    rec.lbl.setAttribute("y", num(y));
    rec.lbl.setAttribute("text-anchor", anchor);
    rec.lbl.setAttribute("fill", fill);
  }

  function deconflictLabels(recs) {
    var labels = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r.lbl || !r.lblG || r.lblG.getAttribute("display") === "none") continue;
      labels.push({ x: parseFloat(r.lbl.getAttribute("x")), y: parseFloat(r.lbl.getAttribute("y")), rec: r });
    }
    for (var pass = 0; pass < 3; pass++) {
      for (var a = 0; a < labels.length; a++) {
        for (var b = a + 1; b < labels.length; b++) {
          var dy = Math.abs(labels[a].y - labels[b].y);
          var dx = Math.abs(labels[a].x - labels[b].x);
          if (dy < 2.5 && dx < 6) {
            var push = (2.5 - dy) / 2 + 0.3;
            if (labels[a].y <= labels[b].y) { labels[a].y -= push; labels[b].y += push; }
            else { labels[b].y -= push; labels[a].y += push; }
          }
        }
      }
    }
    for (var j = 0; j < labels.length; j++) {
      labels[j].y = clamp(labels[j].y, 2, 43);
      labels[j].rec.lbl.setAttribute("y", num(labels[j].y));
    }
  }

  function updateVisual(rec, T, activeSIdx, isLastScene) {
    var v = rec.v;
    var a = v.inMs > T ? 0 : clamp((T - v.inMs) / v.appearMs, 0, 1);
    var outA = v.outMs === null ? 1 : 1 - clamp((T - v.outMs) / 350, 0, 1);
    if (a <= 0 || outA <= 0) {
      rec.outer.setAttribute("display", "none");
      if (rec.lblG) rec.lblG.setAttribute("display", "none");
      return;
    }
    rec.outer.removeAttribute("display");
    if (rec.lblG) rec.lblG.removeAttribute("display");
    var env = { t: Math.max(0, (T - v.inMs) / 1000) };
    var tx = 0, ty = 0, rot = 0, sc = 1, over = null, opMul = 1;
    for (var i = 0; i < v.moves.length; i++) {
      var m = v.moves[i];
      var kk = T < m.atMs ? 0 : m.dur <= 0 ? 1 : clamp((T - m.atMs) / m.dur, 0, 1);
      var e = EASE[m.ease](kk);
      tx += m.dx * e;
      ty += m.dy * e;
      rot += m.rotate * e;
      sc *= 1 + (m.scale - 1) * e;
      if (m.opacity !== undefined && kk > 0) opMul = 1 + (m.opacity - 1) * e;
      if (m.color && kk > 0) {
        var baseHex = col(over || v.color);
        var targHex = col(m.color);
        if (baseHex !== "none" && targHex !== "none") over = kk >= 1 ? m.color : lerpColor(baseHex, targHex, e);
      }
    }
    var how = v.how;
    var fade = how === "draw" || how === "arc" || how === "write" || how === "indicate" || how === "flood" || how === "grow" ? 1 : EASE.ease(a);
    // animated style: squash+stretch pop — overshoots to ~1.18x then settles (Kurzgesagt character principle)
    if (how === "pop") sc *= a < 1 ? (DATA.visualStyle === "animated" ? EASE.back(a) : 0.55 + 0.45 * (1 - Math.pow(1 - a, 3)) + 0.12 * Math.sin(a * Math.PI)) : 1;
    if (how === "slide") ty += (1 - EASE.ease(a)) * 3;
    if (how === "grow") sc *= growScale(a); // from nothing, a little past its size, then settled, about its anchor
    if (how === "indicate") sc *= 1 + 0.2 * EASE.there_and_back(clamp(a, 0, 1));
    if (how === "write" && rec.writeRect) rec.writeRect.setAttribute("width", num(100 * EASE.ease_in_out_sine(a)));
    // Animated style: spring pop for shapes using plain fade-in; per-sentence emphasis pulse
    if (DATA.visualStyle === "animated") {
      if (a < 1 && how !== "draw" && how !== "write" && how !== "arc" && how !== "indicate" && how !== "pop" && how !== "flood" && how !== "grow") {
        sc *= 0.55 + 0.45 * EASE.spring(a);
      }
      if (a >= 1 && v.inS === activeSIdx && T >= emphasisStartMs) {
        // signal: true shapes get a stronger pulse (15% over 500ms) when their sentence activates
        var sigMs = v.signal ? 500 : EMPHASIS_MS;
        if ((T - emphasisStartMs) < sigMs) {
          sc *= 1 + (v.signal ? 0.15 : 0.07) * EASE.there_and_back((T - emphasisStartMs) / sigMs);
        }
      }
      // Ambient idle breathing: gentle 1.8% scale oscillation so shapes feel alive between sentences
      if (a >= 1 && rec._ambPeriod && v.kind !== "text" && v.kind !== "math" && v.kind !== "curve" && v.kind !== "arrow" && v.kind !== "line" && v.kind !== "particles") {
        sc *= 1 + 0.018 * Math.sin(T / rec._ambPeriod * Math.PI * 2 + rec._ambPhase);
      }
    }
    // Update trace ring buffer before drawing
    if (v.kind === "trace" && rec.sourceRec) {
      var srcV = rec.sourceRec.v;
      if (T < rec.trailLastT) rec.trail = []; // rewind: clear trail
      rec.trailLastT = T;
      if (T >= srcV.inMs + v.tStart * 1000) {
        var srcEnv = { t: Math.max(0, (T - srcV.inMs) / 1000) };
        var srcG = geomOf(srcV, srcEnv);
        var srcCx = srcG ? srcG.cx : null;
        var srcCy = srcG ? srcG.cy : null;
        if (srcCx !== null && isFinite(srcCx) && isFinite(srcCy)) {
          var last = rec.trail[rec.trail.length - 1];
          if (!last || Math.hypot(srcCx - last[0], srcCy - last[1]) > 0.08) {
            rec.trail.push([srcCx, srcCy]);
            if (rec.trail.length > 600) rec.trail.shift();
          }
        }
      }
    }
    updateShape(rec, T, a, env, over);
    if (rec.flood) applyFlood(rec, a);
    var focusDim = 1;
    // animated style: raise minimum dim so shapes stay legible; in the payoff (last) scene everything is essential — no dimming at all
    var gentleDim = DATA.visualStyle === "animated" || DATA.chrome === "none"; // the clean frame keeps earlier shapes as vivid as the animated style does (ADR 0096)
    var minFocusDim = gentleDim ? (isLastScene ? 1.0 : 0.72) : 0.35;
    if (activeSIdx >= 0 && a >= 1 && !v.focus) {
      var hasActiveMove = false;
      for (var mi = 0; mi < v.moves.length; mi++) {
        var mm = v.moves[mi];
        if (T >= mm.atMs && T <= mm.atMs + mm.dur) { hasActiveMove = true; break; }
      }
      if (v.inS !== activeSIdx && !hasActiveMove) focusDim = minFocusDim;
    }
    rec.outer.setAttribute("opacity", num(v.opacity * outA * fade * focusDim * opMul));
    var xf = "";
    if (tx || ty || rot || sc !== 1) {
      if (rec.center === null) {
        var b = rec.outer.getBBox();
        rec.center = [b.x + b.width / 2, b.y + b.height / 2];
      }
      xf = "translate(" + num(tx) + " " + num(ty) + ") translate(" + num(rec.center[0]) + " " + num(rec.center[1]) + ") rotate(" + num(rot) + ") scale(" + num(sc) + ") translate(" + num(-rec.center[0]) + " " + num(-rec.center[1]) + ")";
    }
    if (xf) rec.outer.setAttribute("transform", xf);
    else rec.outer.removeAttribute("transform");
    if (rec.lbl) {
      placeLabel(rec, env);
      rec.lblG.setAttribute("opacity", num(v.opacity * outA * fade * focusDim * opMul));
      if (xf) rec.lblG.setAttribute("transform", xf);
      else rec.lblG.removeAttribute("transform");
    }
    if (rec.midLbl && rec.midLbl.getAttribute("display") !== "none") {
      rec.midLbl.setAttribute("opacity", num(v.opacity * outA * fade * focusDim * opMul));
    }
  }

  /* ---- the page around the stage: heading, counter, caption ---- */
  var elHead = document.getElementById("heading");
  var elCount = document.getElementById("count");
  var elCapDiv = document.getElementById("caption");
  var elCap = document.getElementById("cap-text");
  var elBar = document.getElementById("bar");

  var TRANS_MS = 450;
  window.__draw = function (T) {
    var cur = DATA.scenes.length - 1;
    for (var i = 0; i < DATA.scenes.length; i++) {
      if (T < DATA.scenes[i].endMs) {
        cur = i;
        break;
      }
    }
    var scene = DATA.scenes[cur];
    // Cross-fade: during the first TRANS_MS of a scene, also show the outgoing scene fading out
    var inProg = clamp((T - scene.startMs) / TRANS_MS, 0, 1);
    var fadeIn = EASE.smooth(inProg);
    var fadeOut = EASE.smooth(clamp((scene.endMs - T) / TRANS_MS, 0, 1));
    var sceneOpacity = Math.min(fadeIn, fadeOut);
    for (var s = 0; s < sceneRecs.length; s++) {
      if (s === cur) {
        sceneRecs[s].g.removeAttribute("display");
        sceneRecs[s].g.setAttribute("opacity", num(sceneOpacity));
      } else if (s === cur - 1 && inProg < 1) {
        // Previous scene: fade out as current fades in
        var prevFade = EASE.smooth(1 - inProg);
        sceneRecs[s].g.removeAttribute("display");
        sceneRecs[s].g.setAttribute("opacity", num(prevFade));
      } else {
        sceneRecs[s].g.setAttribute("display", "none");
      }
    }
    // Update animated shapes in the outgoing scene so they don't freeze during cross-fade
    if (cur > 0 && inProg < 1) {
      var prevScene = DATA.scenes[cur - 1];
      var prevSr = sceneRecs[cur - 1];
      var prevActiveSIdx = -1;
      for (var pq = prevScene.sentences.length - 1; pq >= 0; pq--) {
        if (T >= prevScene.sentences[pq].startMs) { prevActiveSIdx = pq; break; }
      }
      for (var pr = 0; pr < prevSr.recs.length; pr++) updateVisual(prevSr.recs[pr], T, prevActiveSIdx);
    }
    var sr = sceneRecs[cur];
    // Animated style: iris wipe — expand clip circle as scene fades in
    if (DATA.visualStyle === "animated" && sr.irisCirc) {
      sr.irisCirc.setAttribute("r", inProg >= 1 ? "80" : num(EASE.ease(inProg) * 80));
    }
    // Camera: zoom/pan by transforming the scene group to frame the specified viewport rectangle
    if (scene.camera) {
      var cam = scene.camera;
      var sc = Math.min(100 / cam.w, 45 / cam.h);
      var ox = -cam.x * sc + (100 - cam.w * sc) / 2;
      var oy = -cam.y * sc + (45 - cam.h * sc) / 2;
      // Ease in over TRANS_MS so the zoom arrives smoothly
      var camProg = EASE.smooth(clamp((T - scene.startMs) / TRANS_MS, 0, 1));
      var curSc = 1 + (sc - 1) * camProg;
      var curOx = ox * camProg;
      var curOy = oy * camProg;
      sr.g.setAttribute("transform", "translate(" + num(curOx) + " " + num(curOy) + ") scale(" + num(curSc) + ")");
    } else {
      sr.g.removeAttribute("transform");
    }
    var activeSIdx = -1;
    for (var q2 = scene.sentences.length - 1; q2 >= 0; q2--) {
      if (T >= scene.sentences[q2].startMs) { activeSIdx = q2; break; }
    }
    // Animated style: detect sentence change for emphasis pulse
    if (DATA.visualStyle === "animated" && activeSIdx !== emphasisLastSIdx && activeSIdx >= 0) {
      emphasisLastSIdx = activeSIdx;
      emphasisStartMs = T;
    }
    var isLastScene = cur === DATA.scenes.length - 1;
    for (var r = 0; r < sr.recs.length; r++) updateVisual(sr.recs[r], T, activeSIdx, isLastScene);
    deconflictLabels(sr.recs);
    if (elHead.textContent !== scene.heading) elHead.textContent = scene.heading;
    var cnt = String(cur + 1) + " / " + String(DATA.scenes.length);
    if (elCount.textContent !== cnt) elCount.textContent = cnt;
    var line = "";
    var started = 0;
    for (var q = 0; q < scene.sentences.length; q++) {
      if (T >= scene.sentences[q].startMs) {
        line = scene.sentences[q].text;
        started = scene.sentences[q].startMs;
      }
    }
    if (elCap.textContent !== line) {
      // NFC normalization for Devanagari (hi-IN, ne-NP) prevents matra rendering artifacts
      var displayLine = (DATA.locale === "hi-IN" || DATA.locale === "ne-NP") && line.normalize ? line.normalize("NFC") : line;
      elCap.textContent = displayLine;
      elCap.style.fontSize = (line.length > 140 ? 32 : line.length > 80 ? 38 : 44) + "px";
    }
    elCapDiv.style.opacity = line ? num(clamp((T - started) / 200, 0, 1) * Math.min(fadeOut * 3, 1)) : "0";
    // animated style matches reference: zero chrome — no progress bar
    if (DATA.visualStyle !== "animated") elBar.style.width = num((T / DATA.totalMs) * 100) + "%";
  };

  build();
  window.__ready = true;
})();
