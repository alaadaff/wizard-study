/* ============================================================
   Remediation-wizard study — shared client-side framework.

   Within-subjects design: each participant completes BOTH
   wizard walkthroughs in a randomly assigned order.

   Every click, wizard function call, screen transition and
   final outcome is buffered in localStorage and (optionally)
   POSTed in batches to LOG_ENDPOINT below.

   Privacy: typed input values are NEVER recorded — only that a
   field was focused and how many characters it held on blur.
   ============================================================ */
var Study = (function () {

  /* ── configuration ──────────────────────────────────────── */
  // Paste your Google Apps Script web-app URL between the quotes to
  // stream events to a Google Sheet (see apps-script/Code.gs).
  // Leave empty to keep data in the browser only — participants then
  // download a JSON file on the final page.
  var LOG_ENDPOINT = "";

  var WIZARDS = {
    A: { file: "wizard-a.html", label: "high-security" }, // guided / nudging design
    B: { file: "wizard-b.html", label: "high-agency" }    // open / user-choice design
  };
  var KEY = "asw-study-v1";

  /* ── session state ──────────────────────────────────────── */
  var state = null;
  var page = "unknown";      // "A" | "B" | "index" | "interlude" | "done"
  var t0 = Date.now();       // page-load time, for relative timestamps

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function randomId() {
    return "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  function getParam(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&]+)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function newState(pid, firstCode) {
    var first = firstCode || (Math.random() < 0.5 ? "A" : "B");
    return {
      pid: pid || randomId(),
      order: [first, first === "A" ? "B" : "A"],
      part: 0,
      test: false,
      startedAt: new Date().toISOString(),
      events: [],
      sent: 0
    };
  }

  /* ── event logging ──────────────────────────────────────── */
  function activeScreen() {
    var el = document.querySelector(".screen.active");
    return el ? el.id : "";
  }

  function log(type, name, detail) {
    if (!state) return;
    state.events.push({
      i: state.events.length,
      t: Date.now(),
      rel: Date.now() - t0,
      page: page,
      screen: activeScreen(),
      type: type,
      name: name,
      detail: detail || null
    });
    saveState();
  }

  // Short human-readable description of a DOM element for the log.
  function desc(el) {
    if (!el || !el.tagName) return "";
    var d = el.tagName.toLowerCase();
    if (el.id) d += "#" + el.id;
    else if (el.className && typeof el.className === "string" && el.className.trim())
      d += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    var t = el.tagName === "INPUT"
      ? (el.placeholder || el.type)
      : (el.innerText || "").trim().replace(/\s+/g, " ");
    if (t.length > 50) t = t.slice(0, 47) + "…";
    if (t) d += " \"" + t + "\"";
    return d;
  }

  function argStr(a) {
    if (a && a.tagName) return desc(a);
    if (a === null || a === undefined) return String(a);
    if (typeof a === "object") { try { return JSON.stringify(a); } catch (e) { return "[object]"; } }
    return String(a);
  }

  /* ── sending data ───────────────────────────────────────── */
  function flush() {
    if (!LOG_ENDPOINT || !state) return;
    var pending = state.events.slice(state.sent || 0);
    if (!pending.length) return;
    var payload = JSON.stringify({
      pid: state.pid,
      order: state.order.map(function (c) { return WIZARDS[c].label; }),
      test: !!state.test,
      events: pending
    });
    var ok = false;
    // text/plain avoids a CORS preflight, which Apps Script can't answer
    if (navigator.sendBeacon) {
      ok = navigator.sendBeacon(LOG_ENDPOINT, new Blob([payload], { type: "text/plain" }));
    }
    if (!ok) {
      fetch(LOG_ENDPOINT, {
        method: "POST", mode: "no-cors", keepalive: true,
        headers: { "Content-Type": "text/plain" }, body: payload
      }).catch(function () {});
    }
    state.sent = state.events.length;
    saveState();
  }

  /* ── instrumentation hooks ──────────────────────────────── */
  function installHooks() {
    // Wrap the wizard's own functions so choices are logged semantically.
    ["go", "markBtn", "resetPw", "togglePanel", "selDiag", "contDiag",
     "selAction", "confirmAction", "toggleSess", "togSessFlag",
     "closeModal", "markDone"
    ].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== "function") return;
      window[name] = function () {
        var args = Array.prototype.slice.call(arguments).map(argStr);
        if (name === "go") {
          log("screen", "transition", { from: activeScreen(), to: args[0] });
          flush(); // screen changes are natural batch points
        } else {
          log("action", name, { args: args });
        }
        return orig.apply(this, arguments);
      };
    });

    // Every click, captured before the page handles it.
    document.addEventListener("click", function (ev) {
      var el = ev.target && ev.target.closest
        ? (ev.target.closest("[onclick],button,a,input,label") || ev.target)
        : ev.target;
      log("click", desc(el), {
        onclick: (el.getAttribute && el.getAttribute("onclick")) || ""
      });
    }, true);

    // Form fields: focus + character count only — never the typed value.
    document.addEventListener("focusin", function (ev) {
      if (ev.target.tagName === "INPUT") log("field_focus", desc(ev.target), null);
    }, true);
    document.addEventListener("focusout", function (ev) {
      if (ev.target.tagName === "INPUT")
        log("field_blur", desc(ev.target), { chars: (ev.target.value || "").length });
    }, true);

    // Flush whatever we have if the tab is hidden or closed mid-task.
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
  }

  /* ── public API ─────────────────────────────────────────── */
  return {

    // part1.html — assign (or resume) a session, then drop the
    // participant straight onto their first wizard's opening screen.
    // Optional URL params: ?pid=P-07 (invisible id), ?w=a|b (force
    // which wizard comes first instead of randomizing).
    enterPart1: function () {
      page = "part1";
      var pid = getParam("pid");
      var w = getParam("w").toUpperCase();
      var s = loadState();
      var samePerson = s && !s.test && (!pid || pid === s.pid);
      if (samePerson && s.part === 0 && s.events.length) {
        // Re-opened the part-1 link mid-walkthrough: resume, don't wipe.
        state = s;
        log("study", "part1_resumed", null);
        saveState();
        flush();
        location.replace(WIZARDS[state.order[0]].file);
        return;
      }
      if (samePerson && s.part === 1) { location.replace("interlude.html"); return; }
      if (samePerson && s.part >= 2 && pid) { location.replace("done.html"); return; }
      state = newState(pid, WIZARDS[w] ? w : "");
      log("study", "begin", {
        order: state.order.map(function (c) { return WIZARDS[c].label; }),
        userAgent: navigator.userAgent,
        viewport: window.innerWidth + "x" + window.innerHeight
      });
      saveState();
      flush();
      location.replace(WIZARDS[state.order[0]].file);
    },

    // part2.html — continue the session in the same browser (the other
    // wizard). Falls back gracefully if part 1's state is missing, with
    // ?w=a|b forcing which wizard part 2 shows in that case.
    enterPart2: function () {
      page = "part2";
      var pid = getParam("pid");
      var w = getParam("w").toUpperCase();
      var s = loadState();
      var samePerson = s && !s.test && (!pid || pid === s.pid);
      if (samePerson && s.part >= 2) { location.replace("done.html"); return; }
      if (samePerson) {
        state = s;
        if (state.part === 0) log("study", "part2_opened_before_part1_finished", null);
        state.part = 1;
        log("study", "part2_started", null);
        saveState();
        flush();
        location.replace(WIZARDS[state.order[1]].file);
        return;
      }
      // No session found (different browser/device than part 1):
      // reconstruct one so part 2 still runs, flagged for analysis.
      var second = WIZARDS[w] ? w : (Math.random() < 0.5 ? "A" : "B");
      state = newState(pid, second === "A" ? "B" : "A");
      state.part = 1;
      log("study", "part2_without_part1_state", {
        order: state.order.map(function (c) { return WIZARDS[c].label; })
      });
      saveState();
      flush();
      location.replace(WIZARDS[state.order[1]].file);
    },

    // Called at the bottom of each wizard page.
    initWizard: function (code) {
      page = code;
      state = loadState();
      if (!state || state.part >= state.order.length || state.completedAt) {
        // Wizard opened directly (e.g. researcher testing) —
        // start a session flagged as test data.
        state = {
          pid: randomId(),
          order: [code, code === "A" ? "B" : "A"],
          part: 0,
          test: true,
          startedAt: new Date().toISOString(),
          events: [],
          sent: 0
        };
      }
      log("wizard", "start", { wizard: WIZARDS[code].label, part: state.part + 1 });
      saveState();
      installHooks();
    },

    // Wired to each wizard's terminal buttons.
    finish: function (endpoint) {
      var snapshot = {};
      // Capture the wizard's final outcome variables where they exist.
      ["suspiciousDone", "touched", "diagSel"].forEach(function (k) {
        if (typeof window[k] !== "undefined") snapshot[k] = window[k];
      });
      log("wizard", "end", {
        wizard: WIZARDS[page] ? WIZARDS[page].label : page,
        endpoint: endpoint,
        finalState: snapshot
      });
      state.part += 1;
      saveState();
      flush();
      location.href = state.part < state.order.length ? "interlude.html" : "done.html";
    },

    // done.html — mark complete, final flush.
    complete: function () {
      page = "done";
      state = loadState();
      if (!state) return null;
      if (!state.completedAt) {
        state.completedAt = new Date().toISOString();
        log("study", "complete", { totalEvents: state.events.length });
        flush();
        saveState();
      }
      return { pid: state.pid, endpointConfigured: !!LOG_ENDPOINT };
    },

    // Recovery tool (not exposed in the UI): run Study.download() in the
    // browser console to save the session in localStorage as a JSON file.
    download: function () {
      if (!state) state = loadState();
      if (!state) return;
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "study-" + state.pid + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };
})();
