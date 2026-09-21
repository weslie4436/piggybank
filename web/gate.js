/**
 * FamiGate kernel — config-driven vault door helpers (Wave2).
 *
 * Contract:
 * - Set window.FAMIGATE_CONFIG before this script runs (typically in config.js).
 * - Per-app knobs: appId, viewKeyStorage, productLabel.
 * - Shared runtime: window.VAULT_ORIGIN (vault base URL, trailing slash stripped).
 * - Public API on window.FamiGate must stay stable for door.js / hey.html.
 * - Each app keeps its own viewKeyStorage namespace; do not share keys across apps.
 */
(function () {
  const CFG = Object.assign(
    {
      appId: "piggybank",
      viewKeyStorage: "piggybank.viewKey",
      productLabel: "小金庫",
    },
    typeof window !== "undefined" && window.FAMIGATE_CONFIG ? window.FAMIGATE_CONFIG : {}
  );
  const VIEW_KEY = String(CFG.viewKeyStorage || "piggybank.viewKey");
  const COOKIE_KEY_RE = new RegExp("(?:^|; )" + VIEW_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)");

  const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
  const origin = () => {
    const o = String(window.VAULT_ORIGIN || "").replace(/\/$/, "");
    if (o) return o;
    if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
    return "";
  };

  function api(path, key, opts) {
    const url = origin() + path + (path.indexOf("?") >= 0 ? "&" : "?") + "k=" + encodeURIComponent(key);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 8000);
    const init = Object.assign({ signal: ctrl.signal }, opts || {});
    return fetch(url, init)
      .then((res) => res.json().then((j) => ({ res: res, j: j })).catch(() => ({ res: res, j: null })))
      .finally(() => clearTimeout(t));
  }

  function savePersonal(token) {
    try { localStorage.setItem(VIEW_KEY, token); } catch (e) {}
    try {
      const path = location.pathname.replace(/[^/]+$/, "") || "/";
      document.cookie = VIEW_KEY + "=" + encodeURIComponent(token) + "; path=" + path + "; max-age=31536000; SameSite=Lax";
    } catch (e) {}
  }

  function pinKey(token) {
    if (typeof navigator.standalone === "boolean" && !navigator.standalone) {
      const pin = location.pathname + "?k=" + encodeURIComponent(token) + "#k=" + encodeURIComponent(token);
      if (location.pathname + location.search + location.hash !== pin) {
        history.replaceState({}, "", pin);
      }
    }
  }

  function currentKey() {
    const q = new URLSearchParams(location.search).get("k") || "";
    let h = "";
    try {
      const raw = (location.hash || "").replace(/^#/, "");
      h = raw.indexOf("k=") === 0 ? decodeURIComponent((raw.slice(2).split("&")[0] || "").replace(/\+/g, " ")) : (new URLSearchParams(raw).get("k") || "");
    } catch (e) {}
    let stored = "";
    try { stored = localStorage.getItem(VIEW_KEY) || ""; } catch (e) {}
    let cookie = "";
    try {
      const m = document.cookie.match(COOKIE_KEY_RE);
      cookie = m ? decodeURIComponent(m[1]) : "";
    } catch (e) {}
    const fromUrl = KEY_RE.test(q) ? q : KEY_RE.test(h) ? h : "";
    return fromUrl || (KEY_RE.test(stored) ? stored : "") || (KEY_RE.test(cookie) ? cookie : "");
  }

  function blockWebChrome() {
    function stopZoom(e) { e.preventDefault(); }
    document.addEventListener("contextmenu", stopZoom);
    document.addEventListener("selectstart", (e) => {
      if (e.target && e.target.closest && e.target.closest("input, textarea")) return;
      e.preventDefault();
    });
    document.addEventListener("gesturestart", stopZoom, { passive: false });
    document.addEventListener("gesturechange", stopZoom, { passive: false });
    document.addEventListener("dblclick", stopZoom);
  }

  function bindKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    let painted = -1;
    let kbOn = false;
    let lastHeight = -1;
    let lastTop = -1;
    function apply() {
      const lift = Math.max(0, window.innerHeight - vv.height);
      const height = Math.round(vv.height);
      const top = Math.round(vv.offsetTop);
      if (Math.abs(height - lastHeight) >= 2 || lastHeight < 0) {
        lastHeight = height;
        document.documentElement.style.setProperty("--vvh", height + "px");
      }
      if (Math.abs(top - lastTop) >= 2 || lastTop < 0) {
        lastTop = top;
        document.documentElement.style.setProperty("--vv-top", top + "px");
      }
      if (Math.abs(lift - painted) >= 8) {
        painted = lift;
        document.documentElement.style.setProperty("--kb", Math.round(lift) + "px");
      }
      if (lift > 100) kbOn = true;
      else if (lift < 40) kbOn = false;
      document.documentElement.classList.toggle("kb-up", kbOn);
    }
    function fieldCovered(el) {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      const top = vv.offsetTop;
      const bottom = vv.offsetTop + vv.height;
      return r.top < top + 8 || r.bottom > bottom - 8;
    }
    function reveal() {
      const focused = document.activeElement;
      if (!focused || (focused.tagName !== "INPUT" && focused.tagName !== "TEXTAREA")) return;
      if (!fieldCovered(focused) || !focused.scrollIntoView) return;
      focused.scrollIntoView({ block: "nearest" });
    }
    vv.addEventListener("resize", apply);
    window.addEventListener("focusin", function () {
      apply();
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(reveal);
      });
    });
    apply();
  }

  function lockSheetPage(mask) {
    if (!mask || mask.dataset.sheetLock) return;
    mask.dataset.sheetLock = "1";
    let lastY = 0;
    function paintOpen() {
      const open = !!document.querySelector(".batch-tag-mask:not([hidden]), .ask-mask:not([hidden]), .list-tag-mask:not([hidden])");
      document.documentElement.classList.toggle("tag-modal-open", open);
    }
    paintOpen();
    if (window.MutationObserver) {
      new MutationObserver(paintOpen).observe(mask, { attributes: true, attributeFilter: ["hidden"] });
    }
    mask.addEventListener("touchstart", function (ev) {
      if (ev.touches && ev.touches[0]) lastY = ev.touches[0].clientY;
    }, { passive: true });
    mask.addEventListener("touchmove", function (ev) {
      const node = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target && ev.target.parentElement;
      const scroller = node && node.closest && node.closest(".list-tag-body, .tag-picker-suggest");
      const y = ev.touches && ev.touches[0] ? ev.touches[0].clientY : lastY;
      const dy = y - lastY;
      lastY = y;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
        const atTop = scroller.scrollTop <= 0 && dy > 0;
        const atBot = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && dy < 0;
        if (!atTop && !atBot) return;
      }
      ev.preventDefault();
    }, { passive: false });
  }

  function needsSafari() {
    const ua = navigator.userAgent || "";
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
    return ios && !safari && !window.navigator.standalone;
  }

  window.FamiGate = {
    KEY_RE: KEY_RE,
    origin: origin,
    api: api,
    savePersonal: savePersonal,
    pinKey: pinKey,
    currentKey: currentKey,
    blockWebChrome: blockWebChrome,
    bindKeyboard: bindKeyboard,
    lockSheetPage: lockSheetPage,
    needsSafari: needsSafari,
  };
})();
