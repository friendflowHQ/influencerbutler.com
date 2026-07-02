/**
 * Summary: Download-guidance popup for Influencer Butler.
 *
 * The moment a visitor clicks a real installer link (/go/download?os=... or
 * /go/trial), a small non-blocking bubble appears in the top-right corner and
 * points an animated arrow at the browser's download tray (top-right of the
 * toolbar in modern Chrome, Edge, Firefox and Safari). It tells them exactly
 * what to click next ("Keep" / "Run anyway" on Windows, "Open anyway" on Mac)
 * so first-time downloaders don't bail at the browser or SmartScreen prompt.
 *
 * Loaded on both worlds:
 *   - React pages: <Script src="/download-guidance.js"> in src/app/layout.tsx
 *   - Static marketing pages: injected by public/js/main.js (runs on all of them)
 *
 * Fully self-contained: it injects its own CSS (prefix "ib-dlg-") because the
 * static pages do not load Tailwind. No em dashes anywhere (project rule).
 *
 * Copy is kept consistent with src/components/welcome/WindowsSmartScreenGuide.tsx
 * ("Keep anyway", "More info -> Run anyway", publisher THE SOCIAL MEDIA POSSE LLC).
 */
(function () {
  "use strict";

  if (window.IBDownloadGuide) return; // guard against double-load

  var STYLE_ID = "ib-dlg-style";
  var AUTO_HIDE_MS = 20000;
  var current = null; // the mounted card element, if any
  var hideTimer = null;

  /* ── Browser + OS detection ── */
  // Mirrors the OS logic in src/app/api/trial/start/route.ts so the bubble only
  // shows when a file actually downloads on the current page.
  function detect() {
    var ua = navigator.userAgent || "";
    var uaData = navigator.userAgentData;
    var os = "other";

    if (uaData && typeof uaData.platform === "string") {
      var p = uaData.platform.toLowerCase();
      if (p.indexOf("windows") !== -1) os = "windows";
      else if (p.indexOf("mac") !== -1) os = "mac";
    }
    if (os === "other") {
      var l = ua.toLowerCase();
      if (l.indexOf("windows") !== -1 || l.indexOf("win64") !== -1 || l.indexOf("win32") !== -1) {
        os = "windows";
      } else if (l.indexOf("macintosh") !== -1 || l.indexOf("mac os x") !== -1) {
        os = "mac";
      }
    }

    // Order matters: Edge and Chromium forks both carry "Chrome" in the UA.
    var browser = "other";
    if (/edg\//i.test(ua)) browser = "edge";
    else if (/firefox\//i.test(ua) || /fxios/i.test(ua)) browser = "firefox";
    else if (/opr\//i.test(ua) || /brave/i.test(ua)) browser = "chromium";
    else if (/chrome\//i.test(ua) || /crios/i.test(ua)) browser = "chromium";
    else if (/safari\//i.test(ua)) browser = "safari";

    return { os: os, browser: browser };
  }

  /* ── Copy, tailored to the detected OS and browser ── */
  function buildCopy(info) {
    var os = info.os;
    var browser = info.browser;
    var steps = [];
    var note = "";

    if (os === "mac") {
      steps = [
        "Open your downloads at the top-right of the browser, then double-click the .dmg file.",
        "Drag Influencer Butler into your Applications folder.",
        "If macOS blocks it, right-click the app and choose <strong>Open</strong>, or go to System Settings, Privacy and Security, then <strong>Open anyway</strong>.",
      ];
    } else {
      // Windows (and any other desktop that gets the .exe): browser prompt first,
      // then the Windows SmartScreen prompt.
      if (browser === "firefox") {
        steps.push("Click the downloads arrow at the top-right, then open the file.");
      } else {
        steps.push('If your browser asks, click <strong>Keep</strong> (or "Keep anyway") to finish the download.');
      }
      steps.push('Open the file. If Windows shows "Windows protected your PC", click <strong>More info</strong>, then <strong>Run anyway</strong>.');
      note = "The publisher will read THE SOCIAL MEDIA POSSE LLC. That is us: it is safe to run.";
    }

    return {
      heading: "Your download is starting",
      subline: "Look at the top-right of your browser for the download.",
      steps: steps,
      note: note,
      fallback: "Do not see it? Check your Downloads folder.",
    };
  }

  /* ── One-time CSS injection ── */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      "@keyframes ib-dlg-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}",
      "@keyframes ib-dlg-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}",
      ".ib-dlg-wrap{position:fixed;top:14px;right:14px;z-index:2147483000;width:330px;max-width:calc(100vw - 28px);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;animation:ib-dlg-in .22s ease-out}",
      ".ib-dlg-arrow{position:absolute;top:-30px;right:26px;color:#f97316;animation:ib-dlg-bounce 1.1s ease-in-out infinite}",
      ".ib-dlg-arrow svg{width:30px;height:30px;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}",
      ".ib-dlg-card{position:relative;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.22);padding:16px 16px 14px;color:#0f172a}",
      ".ib-dlg-close{position:absolute;top:8px;right:8px;width:26px;height:26px;border:0;background:transparent;color:#94a3b8;border-radius:7px;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center}",
      ".ib-dlg-close:hover{background:#f1f5f9;color:#475569}",
      ".ib-dlg-head{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#0f172a;padding-right:22px}",
      ".ib-dlg-dot{flex:none;width:9px;height:9px;border-radius:50%;background:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}",
      ".ib-dlg-sub{margin:6px 0 10px;font-size:12.5px;color:#64748b}",
      ".ib-dlg-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}",
      ".ib-dlg-step{display:flex;gap:8px;font-size:12.5px;line-height:1.45;color:#334155}",
      ".ib-dlg-num{flex:none;width:18px;height:18px;margin-top:1px;border-radius:50%;background:#f97316;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}",
      ".ib-dlg-step strong{color:#0f172a}",
      ".ib-dlg-note{margin-top:10px;font-size:11.5px;line-height:1.4;color:#475569;background:#f8fafc;border:1px solid #eef2f7;border-radius:9px;padding:8px 10px}",
      ".ib-dlg-fallback{margin-top:8px;font-size:11px;color:#94a3b8}",
      "@media (max-width:640px){.ib-dlg-wrap{top:auto;bottom:14px;left:14px;right:14px;width:auto}.ib-dlg-arrow{top:-28px;right:20px}}",
    ].join("");
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Dismissal ── */
  function hide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (current && current.parentNode) current.parentNode.removeChild(current);
    current = null;
    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e) {
    if (e.key === "Escape") hide();
  }

  /* ── Render the bubble ── */
  function show(opts) {
    ensureStyle();
    hide(); // only one instance at a time

    var info = opts && (opts.os || opts.browser) ? { os: opts.os || detect().os, browser: opts.browser || detect().browser } : detect();
    var copy = buildCopy(info);

    var stepsHtml = copy.steps
      .map(function (s) {
        return '<li class="ib-dlg-step"><span class="ib-dlg-num"></span><span>' + s + "</span></li>";
      })
      .join("");

    var wrap = document.createElement("div");
    wrap.className = "ib-dlg-wrap";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-live", "polite");
    wrap.setAttribute("aria-label", "Download guidance");
    wrap.innerHTML =
      '<div class="ib-dlg-arrow" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="M6 11l6-6 6 6"/></svg>' +
      "</div>" +
      '<div class="ib-dlg-card">' +
      '<button class="ib-dlg-close" type="button" aria-label="Close">&times;</button>' +
      '<div class="ib-dlg-head"><span class="ib-dlg-dot"></span>' + copy.heading + "</div>" +
      '<p class="ib-dlg-sub">' + copy.subline + "</p>" +
      '<ul class="ib-dlg-steps">' + stepsHtml + "</ul>" +
      (copy.note ? '<p class="ib-dlg-note">' + copy.note + "</p>" : "") +
      '<p class="ib-dlg-fallback">' + copy.fallback + "</p>" +
      "</div>";

    // Number the steps (1, 2, 3) without hard-coding them into the markup.
    var nums = wrap.querySelectorAll(".ib-dlg-num");
    for (var i = 0; i < nums.length; i++) nums[i].textContent = String(i + 1);

    wrap.querySelector(".ib-dlg-close").addEventListener("click", hide);
    document.body.appendChild(wrap);
    current = wrap;

    document.addEventListener("keydown", onKeydown);
    hideTimer = setTimeout(hide, AUTO_HIDE_MS);

    return info;
  }

  /* ── Decide whether a clicked link will download a file on this page ── */
  function shouldShowFor(anchor) {
    if (!anchor || !anchor.href) return false;
    var url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch (e) {
      return false;
    }
    var path = url.pathname.replace(/\/+$/, "");
    if (path !== "/go/download" && path !== "/go/trial") return false;

    var os = url.searchParams.get("os");
    if (os === "win" || os === "mac-arm" || os === "mac-intel") return true;

    // No explicit os: /api/trial/start only streams a file (page stays put) for
    // Windows. Mac and everyone else navigate to the /download chooser, whose
    // own buttons carry ?os= and will trigger the bubble there.
    return detect().os === "windows";
  }

  /* ── Delegated click listener (capture so other handlers can't hide it) ── */
  document.addEventListener(
    "click",
    function (e) {
      // Ignore modified clicks (open in new tab / download to disk manually).
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      var anchor = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!anchor || !shouldShowFor(anchor)) return;
      // Do NOT preventDefault: let the real download proceed.
      show();
    },
    true,
  );

  // Test / QA seam: trigger the bubble without firing a real download.
  window.IBDownloadGuide = { show: show, hide: hide, detect: detect };
})();
