/* The Objects section of the Pipeline Layer Inspector (client side). Served by scripts/objects-inspector.ts at /objects/client.js; no external request is made.
   Every string that comes from the server goes through esc() before it is put in the page. */
(function () {
  "use strict";
  var root = document.getElementById("objects-root");
  if (!root) return;

  var css = [
    "#objects-root{flex:1;overflow-y:auto;padding:20px;display:none;flex-direction:column;gap:10px}",
    "#objects-root.vis{display:flex}",
    "#objects-root>*{flex-shrink:0}",
    ".obanner{background:color-mix(in srgb,var(--error) 16%,transparent);border:1px solid var(--error);color:var(--error);border-radius:var(--radius);padding:10px 14px;font-size:13px;font-weight:600;display:flex;gap:12px;align-items:center;flex-wrap:wrap}",
    ".obanner .on{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--text)}",
    ".otoggles{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}",
    ".otoggle{display:flex;gap:8px;align-items:flex-start;font-size:12px;max-width:420px;cursor:pointer}",
    ".otoggle input{margin-top:3px}",
    ".otoggle code,.onote code,td code{font-family:var(--mono);font-size:11px}",
    ".onote{font-size:11px;color:var(--muted);line-height:1.6}",
    ".chip{display:inline-block;font-family:var(--mono);font-size:10px;padding:1px 8px;border-radius:20px;border:1px solid var(--border);white-space:nowrap}",
    ".chip.good{color:var(--success);border-color:color-mix(in srgb,var(--success) 45%,transparent)}",
    ".chip.bad{color:var(--error);border-color:color-mix(in srgb,var(--error) 45%,transparent)}",
    ".chip.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}",
    ".obtn{background:none;border:1px solid var(--border);color:var(--text);border-radius:var(--radius);padding:4px 10px;font-size:11px;font-weight:500;cursor:pointer;width:auto;font-family:var(--mono)}",
    ".obtn:hover{border-color:var(--accent);color:var(--accent)}",
    ".obtn.on{border-color:var(--accent);color:var(--accent)}",
    ".orow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
    ".oframewrap{position:relative;width:100%;max-width:960px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}",
    ".oframewrap iframe{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;background:#fff}",
    ".othumbs{display:flex;flex-wrap:wrap;gap:10px}",
    ".othumb{width:240px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:6px;display:flex;flex-direction:column;gap:4px;cursor:pointer}",
    ".othumb:hover{border-color:var(--accent)}",
    ".othumb .oframewrap{max-width:none}",
    ".othumb .nm{font-family:var(--mono);font-size:10px;word-break:break-all}",
    ".oprob{font-size:10px;color:var(--error);font-family:var(--mono)}",
    ".ocov{height:6px;background:var(--border);border-radius:3px;overflow:hidden;min-width:80px}",
    ".ocov>i{display:block;height:100%;background:var(--success)}",
    "#objects-root textarea,#objects-root input[type=text],#objects-root select{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px;font-family:var(--sans);font-size:12px}",
    "#objects-root textarea{width:100%;min-height:60px;resize:vertical}",
    ".ogrp{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-top:4px}",
    ".ocovers{max-height:120px;overflow-y:auto;font-size:11px;color:var(--muted)}",
    ".scn{display:flex;gap:8px;align-items:baseline;font-size:12px;padding:3px 0}",
    ".scn b{font-weight:500}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var toggles = { v2: false, unrev: false }; // this page only, off on every load
  var data = null;
  var gen = 0;
  var openDrawers = {};

  function q() {
    return "v2=" + (toggles.v2 ? "1" : "0") + "&unrev=" + (toggles.unrev ? "1" : "0");
  }
  function pageUrl(type, id) {
    return "/objects/page?type=" + encodeURIComponent(type) + "&id=" + encodeURIComponent(id) + "&" + q();
  }
  function json(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
        return d;
      });
    });
  }
  function panel(id, num, title, sub, open) {
    return '<div class="panel' + (open ? " open" : "") + '" id="op-' + id + '"><div class="ph" data-toggle="op-' + id + '"><span class="pnum">' + num + '</span><div style="flex:1"><span class="ptitle">' + esc(title) + '</span><span class="psub"> — ' + esc(sub) + '</span></div></div><div class="pb" id="ob-' + id + '"></div></div>';
  }

  // ── a scaled page of the story video ───────────────────────────────────────
  function fit(wrap) {
    var f = wrap.querySelector("iframe");
    if (!f) return;
    var s = wrap.clientWidth / 1920;
    f.style.transform = "scale(" + s + ")";
    wrap.style.height = Math.round(1080 * s) + "px";
  }
  function frameWrap(url, onReady) {
    var wrap = document.createElement("div");
    wrap.className = "oframewrap";
    var f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts allow-same-origin");
    f.setAttribute("title", "drawn figure");
    f.setAttribute("loading", "lazy");
    f.src = url;
    wrap.appendChild(f);
    f.addEventListener("load", function () {
      var tries = 0;
      (function wait() {
        var w = f.contentWindow;
        if (w && w.__ready === true && typeof w.__draw === "function") return onReady && onReady(w);
        if (++tries < 100) setTimeout(wait, 100);
      })();
    });
    setTimeout(function () { fit(wrap); }, 0);
    return wrap;
  }
  window.addEventListener("resize", function () {
    root.querySelectorAll(".oframewrap").forEach(fit);
  });

  // ── the preview (one shared viewer) ────────────────────────────────────────
  var pv = { win: null, info: null, raf: 0, wrap: null };
  function stopPlay() {
    if (pv.raf) cancelAnimationFrame(pv.raf);
    pv.raf = 0;
    var b = document.getElementById("o-play");
    if (b) b.textContent = "Play";
  }
  function seek(i) {
    stopPlay();
    if (!pv.win || !pv.info) return;
    var sc = pv.info.scenes[i];
    if (sc) pv.win.__draw(Math.max(0, sc.endMs - 1800));
    root.querySelectorAll("[data-scene]").forEach(function (b) { b.classList.toggle("on", Number(b.getAttribute("data-scene")) === i); });
  }
  function play() {
    if (!pv.win || !pv.info) return;
    if (pv.raf) return stopPlay();
    var b = document.getElementById("o-play");
    if (b) b.textContent = "Stop";
    var total = pv.info.totalMs;
    var t0 = performance.now();
    (function tick(now) {
      var t = now - t0;
      if (t >= total) { pv.win.__draw(total); return stopPlay(); }
      pv.win.__draw(t);
      pv.raf = requestAnimationFrame(tick);
    })(t0);
  }
  function showPreview(type, id, label) {
    stopPlay();
    var body = document.getElementById("ob-preview");
    document.getElementById("op-preview").classList.add("open");
    body.innerHTML = '<div class="info">Loading ' + esc(label) + "…</div>";
    var my = ++gen;
    json("/objects/api/preview?type=" + encodeURIComponent(type) + "&id=" + encodeURIComponent(id) + "&" + q()).then(function (info) {
      if (my !== gen) return;
      pv.info = info;
      var notes = info.notes.map(function (n) { return '<div class="nbox">' + esc(n) + "</div>"; }).join("");
      var dec = info.decisions.map(function (d) { return '<div class="info">scene ' + (d.scene + 1) + ", object " + (d.index + 1) + ": outcome " + d.outcome + " (" + esc(d.name) + "), " + esc(d.action) + (d.drawer ? " by " + esc(d.drawer) : "") + "</div>"; }).join("");
      var off = !toggles.v2 ? '<div class="pbox">ENGINE_OBJECTS_V2 is off on this page, as it is in the engine by default: the pipeline would not draw these objects, so the frame is empty. Turn it on above to see the drawing.</div>' : "";
      var scenes = info.scenes.map(function (s, i) {
        return '<div class="scn"><button class="obtn" data-scene="' + i + '">scene ' + (i + 1) + '</button><span><b>' + esc(s.heading) + "</b> — " + esc(s.sentences.join(" ")) + "</span></div>";
      }).join("");
      body.innerHTML =
        '<div class="orow"><strong style="font-size:13px">' + esc(info.title) + '</strong><span class="chip">' + esc(label) + '</span><button class="obtn" id="o-play">Play</button></div>' +
        '<div class="onote">Silent preview: no voice, no model, no network. Each sentence is given a nominal four seconds, so the timing is not the video\'s timing. It is drawn by the same page the story video opens.</div>' +
        off + notes + dec +
        '<div class="oframewrap" id="o-main"></div>' + '<div>' + scenes + "</div>";
      var wrap = frameWrap(info.pageUrl, function (w) {
        pv.win = w;
        seek(0);
      });
      wrap.id = "o-main";
      body.replaceChild(wrap, document.getElementById("o-main"));
      fit(wrap);
      pv.wrap = wrap;
      body.querySelectorAll("[data-scene]").forEach(function (b) { b.addEventListener("click", function () { seek(Number(b.getAttribute("data-scene"))); }); });
      document.getElementById("o-play").addEventListener("click", play);
      document.getElementById("op-preview").scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (e) {
      if (my === gen) body.innerHTML = '<div class="err-msg">Could not preview: ' + esc(e.message) + "</div>";
    });
  }

  // ── drawers ────────────────────────────────────────────────────────────────
  function groupOf(d) {
    var figs = data.figures.filter(function (f) { return f.drawer === d.name; });
    if (!figs.length) return d.wraps || d.name === "label_card" ? "wave 0 (existing paths)" : "other";
    var m = /^([a-z]+)-wave/.exec(figs[0].file);
    return m ? m[1] : "other";
  }
  function latestNote(name) {
    var l = (data.notes.drawers[name] || []);
    return l.length ? l[l.length - 1] : null;
  }
  function drawersHtml() {
    var groups = {};
    data.drawers.forEach(function (d) { (groups[groupOf(d)] = groups[groupOf(d)] || []).push(d); });
    var order = ["physics", "chemistry", "biology", "wave 0 (existing paths)", "other"];
    var html = "";
    order.forEach(function (g) {
      if (!groups[g]) return;
      html += '<div class="ogrp">' + esc(g) + " · " + groups[g].length + " drawers</div>";
      html += '<table><thead><tr><th>Drawer</th><th>Kind</th><th>Version</th><th>Licence</th><th>Sources</th><th>Reviewed (code)</th><th>Covers</th><th>Figures</th><th></th></tr></thead><tbody>';
      groups[g].forEach(function (d) {
        var figs = data.figures.filter(function (f) { return f.drawer === d.name; });
        var bad = figs.filter(function (f) { return f.status !== "clean"; }).length;
        var note = latestNote(d.name);
        var rev = d.reviewed ? '<span class="chip good">reviewed</span>' : '<span class="chip warn">unreviewed</span>';
        if (note && note.reviewed) rev += ' <span class="chip" title="a local record in dist/objects-review-notes.json; the code is unchanged">local note: ' + esc(note.reviewer) + "</span>";
        html += '<tr><td><strong>' + esc(d.name) + "</strong>" + (d.wraps ? ' <span class="chip">wraps existing</span>' : "") + "</td><td>" + esc(d.kind) + "</td><td>" + esc(d.version) + "</td><td>" + esc(d.license) + "</td><td>" + d.sources.map(esc).join(", ") + "</td><td>" + rev + "</td><td>" + d.covers.length + "</td><td>" + figs.length + (bad ? ' <span class="chip bad">' + bad + " problem" + (bad > 1 ? "s" : "") + "</span>" : figs.length ? ' <span class="chip good">clean</span>' : "") + '</td><td><button class="obtn' + (openDrawers[d.name] ? " on" : "") + '" data-drawer="' + esc(d.name) + '">' + (openDrawers[d.name] ? "hide" : "open") + "</button></td></tr>";
        if (openDrawers[d.name]) html += '<tr><td colspan="9" id="od-' + esc(d.name) + '"></td></tr>';
      });
      html += "</tbody></table>";
    });
    return html;
  }
  function drawerDetail(d) {
    var cell = document.getElementById("od-" + d.name);
    if (!cell) return;
    var figs = data.figures.filter(function (f) { return f.drawer === d.name; });
    var h = '<div class="onote"><b>Covers:</b></div><div class="ocovers">' + (d.covers.length ? d.covers.map(esc).join("; ") : "no inventory object (a wrapper of an existing path)") + "</div>";
    if (Object.keys(d.toolVersions).length) h += '<div class="onote">Tools: ' + Object.keys(d.toolVersions).map(function (k) { return esc(k) + " " + esc(d.toolVersions[k]); }).join(", ") + "</div>";
    h += '<div class="onote" style="margin-top:8px"><b>Sample figures</b> (fixtures/objects/*-samples.json), drawn by this drawer. Click one to open it in the preview.</div><div class="othumbs" id="ot-' + esc(d.name) + '"></div>';
    var hist = data.notes.drawers[d.name] || [];
    h += '<div class="onote" style="margin-top:10px"><b>Reviewer notes</b> (a local record only, in dist/objects-review-notes.json, which git ignores). Saving one does not change the drawer: it stays ' + (d.reviewed ? "reviewed" : "reviewed: false") + " in the code until the owner edits the registry.</div>";
    h += hist.slice(-5).map(function (e) { return '<div class="info">' + esc(e.at) + " · " + esc(e.reviewer) + " · " + (e.reviewed ? "marked reviewed" : "not reviewed") + " · " + esc(e.note) + "</div>"; }).join("");
    h += '<div class="orow" style="margin-top:6px"><input type="text" id="on-who-' + esc(d.name) + '" placeholder="reviewer name or role" maxlength="80"><label class="otoggle"><input type="checkbox" id="on-ok-' + esc(d.name) + '"> mark reviewed (record only)</label></div><textarea id="on-txt-' + esc(d.name) + '" maxlength="2000" placeholder="what you checked, what is wrong"></textarea><div class="orow"><button class="obtn" data-savenote="' + esc(d.name) + '">Save note</button><span class="info" id="on-msg-' + esc(d.name) + '"></span></div>';
    cell.innerHTML = h;
    var box = document.getElementById("ot-" + d.name);
    figs.forEach(function (f) {
      var t = document.createElement("div");
      t.className = "othumb";
      var wrap = frameWrap(pageUrl("sample", f.id), function (w) { w.__draw(Math.max(0, (w.__inspectorEnd || [14000])[0] - 1800)); });
      t.appendChild(wrap);
      var lab = document.createElement("div");
      lab.innerHTML = '<div class="nm">' + esc(f.name) + '</div><span class="chip ' + (f.status === "clean" ? "good" : "bad") + '">' + (f.status === "clean" ? "read-back: clean" : "read-back: " + esc(f.status)) + "</span>" + f.problems.map(function (p) { return '<div class="oprob">' + esc(p) + "</div>"; }).join("");
      t.appendChild(lab);
      t.addEventListener("click", function () { showPreview("sample", f.id, f.name); });
      box.appendChild(t);
      setTimeout(function () { fit(wrap); }, 0);
    });
    // figures that no drawer drew are listed too
  }
  function renderDrawers() {
    var b = document.getElementById("ob-drawers");
    b.innerHTML = drawersHtml();
    data.drawers.forEach(function (d) { if (openDrawers[d.name]) drawerDetail(d); });
    b.querySelectorAll("[data-drawer]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var n = btn.getAttribute("data-drawer");
        openDrawers[n] = !openDrawers[n];
        renderDrawers();
      });
    });
    b.querySelectorAll("[data-savenote]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var n = btn.getAttribute("data-savenote");
        var msg = document.getElementById("on-msg-" + n);
        json("/objects/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ drawer: n, reviewer: document.getElementById("on-who-" + n).value, note: document.getElementById("on-txt-" + n).value, reviewed: document.getElementById("on-ok-" + n).checked })
        }).then(function (d) {
          data.notes = d.notes;
          renderDrawers();
          var m = document.getElementById("on-msg-" + n);
          if (m) m.textContent = "Saved to dist/objects-review-notes.json.";
        }).catch(function (e) { if (msg) msg.textContent = "Not saved: " + e.message; });
      });
    });
    var orphans = data.figures.filter(function (f) { return !f.drawer; });
    if (orphans.length) b.insertAdjacentHTML("beforeend", '<div class="finding fail">Figures no drawer drew: ' + orphans.map(function (f) { return esc(f.name) + " (" + esc(f.problems[0] || f.status) + ")"; }).join("; ") + "</div>");
  }

  // ── coverage ───────────────────────────────────────────────────────────────
  function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "n/a"; }
  function bar(a, b) { return '<div class="ocov"><i style="width:' + (b ? Math.round(100 * a / b) : 0) + '%"></i></div>'; }
  function renderCoverage() {
    var c = data.coverage;
    var h = '<div class="' + (c.real ? "info" : "pbox") + '">' + (c.real ? "Read from the owner's plan file " + esc(c.source) + " (read-only)." : "The owner's plan file was not found next to this repository, so this is the small invented sample inventory (" + esc(c.source) + "): the numbers below are not the real coverage.") + "</div>";
    h += '<div class="stats"><div class="stat"><span class="sv">' + c.total.pairs + '</span><span class="sl">pairs</span></div><div class="stat"><span class="sv">' + c.total.registered + '</span><span class="sl">drawable</span></div><div class="stat"><span class="sv">' + pct(c.total.registered, c.total.pairs) + '</span><span class="sl">strict</span></div><div class="stat"><span class="sv">' + c.total.reviewed + '</span><span class="sl">reviewed</span></div></div>';
    h += '<div class="onote">drawable = chapter-object pairs whose object a registered drawer covers (computed from the code); reviewed = of those, pairs whose drawer is not registered reviewed: false.</div>';
    h += '<table><thead><tr><th>Subject</th><th>Pairs</th><th>Drawable</th><th>%</th><th></th></tr></thead><tbody>' + c.bySubject.map(function (s) { return "<tr><td>" + esc(s.subject) + "</td><td>" + s.pairs + "</td><td>" + s.registered + "</td><td>" + pct(s.registered, s.pairs) + "</td><td>" + bar(s.registered, s.pairs) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<table><thead><tr><th>Subject</th><th>Class</th><th>Pairs</th><th>Drawable</th><th>%</th><th></th></tr></thead><tbody>' + c.bySubjectClass.map(function (s) { return "<tr><td>" + esc(s.subject) + "</td><td>" + s.class + "</td><td>" + s.pairs + "</td><td>" + s.registered + "</td><td>" + pct(s.registered, s.pairs) + "</td><td>" + bar(s.registered, s.pairs) + "</td></tr>"; }).join("") + "</tbody></table>";
    var subjects = c.bySubject.map(function (s) { return s.subject; });
    h += '<div class="orow"><label class="lbl">Chapters</label><select id="oc-sub"><option value="">all subjects</option>' + subjects.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") + '</select><label class="otoggle"><input type="checkbox" id="oc-gap"> only chapters with a gap</label></div><div id="oc-chap"></div>';
    h += '<div class="ogrp">Gaps: objects no registered drawer covers (' + c.gaps.length + ")</div>" + '<table><thead><tr><th>Subject</th><th>Pairs left undrawn</th><th>Classes</th><th>Object</th></tr></thead><tbody>' + c.gaps.map(function (g) { return "<tr><td>" + esc(g.subject) + "</td><td>" + g.pairs + "</td><td>" + g.classes.join(", ") + "</td><td>" + esc(g.object) + "</td></tr>"; }).join("") + "</tbody></table>";
    document.getElementById("ob-coverage").innerHTML = h;
    function chap() {
      var sub = document.getElementById("oc-sub").value;
      var gap = document.getElementById("oc-gap").checked;
      var rows = c.chapters.filter(function (r) { return (!sub || r.subject === sub) && (!gap || r.registered < r.pairs); });
      document.getElementById("oc-chap").innerHTML = "<table><thead><tr><th>Subject</th><th>Class</th><th>Chapter</th><th>Drawable</th><th>Missing objects</th></tr></thead><tbody>" + rows.map(function (r) { return "<tr><td>" + esc(r.subject) + "</td><td>" + r.class + "</td><td style=\"font-family:var(--sans)\">" + esc(r.chapter) + "</td><td>" + r.registered + "/" + r.pairs + "</td><td style=\"font-family:var(--sans)\">" + r.missing.map(esc).join("; ") + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    document.getElementById("oc-sub").addEventListener("change", chap);
    document.getElementById("oc-gap").addEventListener("change", chap);
    chap();
  }

  // ── story requests ─────────────────────────────────────────────────────────
  function renderStories() {
    var b = document.getElementById("ob-stories");
    var folders = {};
    data.stories.forEach(function (s) { (folders[s.folder] = folders[s.folder] || []).push(s); });
    var h = '<div class="onote">Sample story requests of fixtures/objects/stories*. Play one scene by scene in the preview above: silent, no voice, no model, no network.</div>';
    Object.keys(folders).forEach(function (f) {
      h += '<div class="ogrp">' + esc(f) + "</div><table><thead><tr><th>Story</th><th>Scenes</th><th>Objects</th><th></th></tr></thead><tbody>" + folders[f].map(function (s) {
        var n = s.scenes.reduce(function (a, x) { return a + x.objects; }, 0);
        return '<tr><td style="font-family:var(--sans)">' + esc(s.title) + "</td><td>" + s.scenes.length + "</td><td>" + n + '</td><td><button class="obtn" data-story="' + esc(s.id) + '" data-title="' + esc(s.title) + '">preview</button></td></tr>';
      }).join("") + "</tbody></table>";
    });
    b.innerHTML = h;
    b.querySelectorAll("[data-story]").forEach(function (btn) {
      btn.addEventListener("click", function () { showPreview("story", btn.getAttribute("data-story"), btn.getAttribute("data-title")); });
    });
  }

  // ── the page ───────────────────────────────────────────────────────────────
  function renderBanner() {
    var on = [];
    if (toggles.v2) on.push("ENGINE_OBJECTS_V2 on");
    if (toggles.unrev) on.push("ENGINE_OBJECTS_ALLOW_UNREVIEWED on");
    document.getElementById("o-banner").innerHTML = "<span>" + esc(data.banner) + '</span><span class="on">' + (on.length ? esc(on.join(" · ")) + " (this page only)" : "both switches off (the engine's default)") + "</span>";
  }
  function refreshAll() {
    renderBanner();
    renderDrawers();
    if (pv.info && pv.info.type) showPreview(pv.info.type, pv.info.id, pv.info.title);
  }
  function build() {
    root.innerHTML =
      '<div class="obanner" id="o-banner"></div>' +
      '<div class="panel open"><div class="ph"><span class="pnum">00</span><div style="flex:1"><span class="ptitle">Switches</span><span class="psub"> — local to this page, off by default</span></div></div><div class="pb"><div class="otoggles">' +
      '<label class="otoggle"><input type="checkbox" id="t-v2"><span><code>ENGINE_OBJECTS_V2</code> — lets the router expand typed objects into shapes. Off, a story with objects draws none, as in the engine today.</span></label>' +
      '<label class="otoggle"><input type="checkbox" id="t-unrev"><span><code>ENGINE_OBJECTS_ALLOW_UNREVIEWED</code> — lets the router draw with a drawer registered <code>reviewed: false</code>. Off, such a figure is a label card.</span></label></div>' +
      '<div class="onote">These two switches only change how this inspector renders its previews. They are not read from or written to the process environment, and the engine, the registry and the Pipeline panels are not affected. Read-back results, the coverage and the drawer list do not depend on them.</div></div></div>' +
      panel("preview", "01", "Preview", "a figure or a story, drawn by the page the story video opens", false) +
      panel("drawers", "02", "Drawers", "kind, version, licence, sources, review state, coverage and sample figures", true) +
      panel("coverage", "03", "Coverage", "per subject, class and chapter, and the gaps", false) +
      panel("stories", "04", "Story requests", "scene-by-scene preview of the sample stories", false);
    root.querySelectorAll("[data-toggle]").forEach(function (h) {
      h.addEventListener("click", function () { document.getElementById(h.getAttribute("data-toggle")).classList.toggle("open"); });
    });
    document.getElementById("ob-preview").innerHTML = '<div class="info">Pick a figure under Drawers, or a story under Story requests.</div>';
    document.getElementById("t-v2").addEventListener("change", function (e) { toggles.v2 = e.target.checked; refreshAll(); });
    document.getElementById("t-unrev").addEventListener("change", function (e) { toggles.unrev = e.target.checked; refreshAll(); });
    renderBanner();
    renderDrawers();
    renderCoverage();
    renderStories();
  }
  var loaded = false;
  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    root.innerHTML = '<div class="info">Loading the drawers…</div>';
    json("/objects/api/overview").then(function (d) { data = d; build(); }).catch(function (e) { loaded = false; root.innerHTML = '<div class="err-msg">Could not load the Objects data: ' + esc(e.message) + "</div>"; });
  }

  // ── the two views ──────────────────────────────────────────────────────────
  var tabP = document.getElementById("tab-pipeline");
  var tabO = document.getElementById("tab-objects");
  var sidebar = document.querySelector(".sidebar");
  function view(name) {
    var objects = name === "objects";
    document.getElementById("main").style.display = objects ? "none" : "";
    root.classList.toggle("vis", objects);
    tabP.classList.toggle("on", !objects);
    tabO.classList.toggle("on", objects);
    for (var i = 2; i < sidebar.children.length; i++) sidebar.children[i].style.display = objects ? "none" : "";
    if (objects) ensureLoaded();
    else stopPlay();
  }
  tabP.addEventListener("click", function () { view("pipeline"); });
  tabO.addEventListener("click", function () { view("objects"); });
  if (location.hash === "#objects") view("objects");
})();
