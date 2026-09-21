(function () {
  const hall = document.getElementById("hall");
  const statusEl = document.getElementById("status");
  const invitePanel = document.getElementById("invite-panel");
  const goBtn = document.getElementById("invite-go");
  const nameForm = document.getElementById("invite-name-form");
  const nameInput = document.getElementById("invite-name");
  const nameErr = document.getElementById("invite-name-err");
  const waitEl = document.getElementById("invite-wait");
  const safariNote = document.getElementById("invite-safari");
  const homeInstall = document.getElementById("home-install");
  const cabHud = document.getElementById("cab-hud");
  const faceImg = document.getElementById("face-img");
  const readerName = document.getElementById("reader-name");
  const coverInput = document.getElementById("cover-input");
  const backdropInput = document.getElementById("backdrop-input");
  const stageBg = document.getElementById("stage-bg");
  const homeHead = document.getElementById("home-head");
  const rail = document.getElementById("photo-rail");
  const pigBlock = document.getElementById("pig-block");
  const ovTotal = document.getElementById("ovTotal");
  const claimBtn = document.getElementById("claim-apply");
  const ledger = document.getElementById("ledger");
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.8l.6-1.3h3.6l.6 1.3 1.6.7 1.4-.5 2.5 2.5-.5 1.4.7 1.6 1.3.6v3.6l-1.3.6-.7 1.6.5 1.4-2.5 2.5-1.4-.5-1.6.7-.6 1.3h-3.6l-.6-1.3-1.6-.7-1.4.5-2.5-2.5.5-1.4-.7-1.6-1.3-.6v-3.6l1.3-.6.7-1.6-.5-1.4L6.6 4l1.4.5 1.6-.7z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><circle cx="12" cy="11.9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="17" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8l1.4-2.4h5.2L16 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const SCENE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 16.2l4.2-4.6 3 3.2 2.2-2.4 3.6 3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="9" cy="9.2" r="1.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C10.5 18.4 7.3 15.8 5.4 11.9C4 9.1 5.2 6 8.4 6c1.8 0 3 1.1 3.6 2.2C12.6 7.1 13.8 6 15.6 6c3.2 0 4.4 3.1 3 5.9C16.7 15.8 13.5 18.4 12 20Z"/></svg>';
  const HEART_RAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C10.5 18.4 7.3 15.8 5.4 11.9C4 9.1 5.2 6 8.4 6c1.8 0 3 1.1 3.6 2.2C12.6 7.1 13.8 6 15.6 6c3.2 0 4.4 3.1 3 5.9C16.7 15.8 13.5 18.4 12 20Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const PALETTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r="1.2"/><circle cx="13.5" cy="9.2" r="1.2"/><circle cx="15" cy="13" r="1.2"/><circle cx="10.5" cy="14.4" r="1.2"/></svg>';
  const BANK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 11c.3-3.1 2.6-5.3 5.3-5.3 2 0 3.8 1.2 4.6 3h1.6c.8 0 1.4.7 1.4 1.5v1.9c0 2.7-1.8 5.1-4.8 5.9V20H9v-1.9C7.4 17.2 7 14.4 7.2 11z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="14.7" cy="10.7" r="0.85"/><path d="M7.2 11.6H5.3c-.7 0-1.3-.6-1.3-1.3V8.8M11.8 5.7V4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const LEDGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.2" width="12" height="15.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 8.5h6M9 12h6M9 15.5h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const SPEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5h10l-.8 10.3H7.8L7 8.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.4 8.5V7.2a2.6 2.6 0 0 1 5.2 0v1.3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const WRENCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 5.5a3.4 3.4 0 0 1 3.8 3.8l-2.4 2.4-2.2-2.2 2.4-2.4zM13.4 9.8L6.2 17l1.8 1.8 7.2-7.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const SEEN_KEY = "piggybank.lastSeenRevision";
  const DEBUG_KEY = "piggybank.debug";
  const THEME_KEY = "piggybank.theme";
  const GUIDE_KEY = "piggybank.guides";
  const THEMES = [
    ["melody", "Melody"],
    ["kuromi", "Kuromi"],
    ["cinnamoroll", "Cinnamoroll"],
  ];
  let key = "";
  let busy = false;
  let settingsWrap = null;
  let settingsCatch = null;
  let hostTab = "bank";
  let waitBusy = false;
  let waitTimer = 0;
  let ready = false;
  let booting = false;
  let bootTimer = 0;
  let snapshot = null;
  let exStage = "";
  let exAmount = 0;
  let exToken = "";
  let exSettled = false;
  let exPoll = 0;
  let paintedTotal = 0;
  let feedToken = 0;
  let allowTimer = 0;
  let allowServerNow = 0;
  let allowOrigin = 0;
  let allowNext = 0;
  const FEED_MS = 320;
  const FEED_BOUNCE_AT = 193;
  const FEED_SQUASH_MS = 280;
  let guides = { foot: 88, coin: 22, show: false };

  function yen(n) {
    return String(Math.max(0, Math.round(Number(n) || 0))) + " 元";
  }

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      document.documentElement.classList.contains("reduce-motion");
  }

  function seenRevision() {
    try { return Number(sessionStorage.getItem(SEEN_KEY) || 0) || 0; } catch (e) { return 0; }
  }

  function rememberRevision(n) {
    try { sessionStorage.setItem(SEEN_KEY, String(n || 0)); } catch (e) {}
  }

  function shouldAnimate(rev) {
    return !reduceMotion() && Number(rev || 0) > seenRevision();
  }

  function isDebug() {
    try { return sessionStorage.getItem(DEBUG_KEY) === "1"; } catch (e) { return false; }
  }

  function setDebug(on) {
    try {
      if (on) sessionStorage.setItem(DEBUG_KEY, "1");
      else sessionStorage.removeItem(DEBUG_KEY);
    } catch (e) {}
    paintDebugChrome();
    showRail();
  }

  function paintDebugChrome() {
    const row = document.querySelector('.settings-entry[data-job="gm"]');
    if (row) row.classList.toggle("is-host", isDebug());
  }

  function rememberedTheme() {
    try { return localStorage.getItem(THEME_KEY) || ""; } catch (e) { return ""; }
  }

  function rememberTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function loadGuides() {
    try {
      const raw = JSON.parse(localStorage.getItem(GUIDE_KEY) || "null");
      if (!raw || typeof raw !== "object") return;
      const foot = Number(raw.foot);
      const coin = Number(raw.coin);
      if (Number.isFinite(foot)) guides.foot = Math.min(96, Math.max(4, foot));
      if (Number.isFinite(coin)) guides.coin = Math.min(96, Math.max(4, coin));
      guides.show = !!raw.show;
    } catch (e) {}
  }

  function saveGuides() {
    try { localStorage.setItem(GUIDE_KEY, JSON.stringify(guides)); } catch (e) {}
  }

  function clampGuide(n) {
    return Math.min(96, Math.max(4, n));
  }

  function applyGuides() {
    const stage = document.querySelector(".pig-stage");
    if (!stage) return;
    stage.style.setProperty("--pig-foot-y", guides.foot + "%");
    stage.style.setProperty("--pig-coin-y", guides.coin + "%");
    let layer = document.getElementById("pig-guides");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "pig-guides";
      layer.className = "pig-guides";
      layer.setAttribute("aria-hidden", "true");
      [["coin", "投幣點"], ["foot", "腳點"]].forEach(function (pair) {
        const row = document.createElement("div");
        row.className = "pig-guide";
        row.dataset.guide = pair[0];
        const label = document.createElement("span");
        label.textContent = pair[1];
        row.appendChild(label);
        layer.appendChild(row);
      });
      stage.appendChild(layer);
      bindGuideDrag(layer);
    }
    layer.classList.toggle("is-on", !!guides.show);
    layer.querySelectorAll(".pig-guide").forEach(function (row) {
      row.style.top = (row.dataset.guide === "foot" ? guides.foot : guides.coin) + "%";
    });
  }

  function bindGuideDrag(layer) {
    let active = "";
    function yToPct(clientY) {
      const stage = document.querySelector(".pig-stage");
      if (!stage) return 50;
      const box = stage.getBoundingClientRect();
      if (!box.height) return 50;
      return clampGuide(((clientY - box.top) / box.height) * 100);
    }
    function move(ev) {
      if (!active) return;
      const pct = yToPct(ev.clientY);
      if (active === "foot") guides.foot = pct;
      else guides.coin = pct;
      applyGuides();
    }
    function stop() {
      if (!active) return;
      active = "";
      saveGuides();
    }
    layer.addEventListener("pointerdown", function (ev) {
      const row = ev.target.closest(".pig-guide");
      if (!row || !guides.show) return;
      active = row.dataset.guide || "";
      try { row.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
      move(ev);
    });
    layer.addEventListener("pointermove", move);
    layer.addEventListener("pointerup", stop);
    layer.addEventListener("pointercancel", stop);
  }

  function addSwitch(body, label, on, onChange) {
    const lab = document.createElement("label");
    lab.className = "ask-skip";
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.checked = !!on;
    const sw = document.createElement("span");
    sw.className = "ask-sw";
    lab.appendChild(name);
    lab.appendChild(input);
    lab.appendChild(sw);
    input.addEventListener("change", function () { onChange(!!input.checked, input); });
    body.appendChild(lab);
    return input;
  }

  function insButton(className, svg, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ins-icon " + className;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    const ring = document.createElement("span");
    ring.className = "ins-ring";
    const face = document.createElement("span");
    face.className = "ins-face";
    face.innerHTML = svg;
    btn.appendChild(ring);
    btn.appendChild(face);
    return btn;
  }

  function jobBadge(svg) {
    const badge = document.createElement("span");
    badge.className = "ins-icon job-icon";
    badge.setAttribute("aria-hidden", "true");
    const ring = document.createElement("span");
    ring.className = "ins-ring";
    const face = document.createElement("span");
    face.className = "ins-face";
    face.innerHTML = svg;
    badge.appendChild(ring);
    badge.appendChild(face);
    return badge;
  }

  function setJobRun(entry, on) {
    if (!entry) return;
    entry.classList.toggle("is-run", !!on);
    entry.disabled = !!on;
  }

  function setCabRun(on) {
    const cover = document.querySelector("#cab-hud .cab-cover");
    if (cover) cover.classList.toggle("is-run", !!on);
  }

  function showWaitCard(title) {
    const mask = document.getElementById("waitMask");
    const head = document.getElementById("waitTitle");
    const pct = document.getElementById("waitPct");
    if (head) head.textContent = title || "更換背景中";
    if (pct) pct.textContent = "0%";
    if (mask) mask.hidden = false;
  }

  function setWaitPct(n) {
    const pct = document.getElementById("waitPct");
    if (pct) pct.textContent = Math.max(0, Math.min(100, Math.round(n))) + "%";
  }

  function hideWaitCard() {
    const mask = document.getElementById("waitMask");
    if (mask) mask.hidden = true;
    if (waitTimer) {
      window.clearInterval(waitTimer);
      waitTimer = 0;
    }
  }

  function closeSettings() {
    const wrap = settingsWrap || document.getElementById("album-settings");
    if (!wrap) return;
    const menu = wrap.querySelector(".settings-menu") || document.querySelector(".settings-menu");
    const toggle = wrap.querySelector(".settings-toggle");
    if (menu) {
      menu.hidden = true;
      if (menu.parentNode !== wrap) wrap.appendChild(menu);
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.classList.remove("is-live");
    }
    if (settingsCatch) settingsCatch.hidden = true;
    document.documentElement.classList.remove("settings-open");
  }

  function ensureSettingsCatch() {
    if (settingsCatch && settingsCatch.isConnected) return settingsCatch;
    const catcher = document.createElement("div");
    catcher.className = "settings-catch";
    catcher.hidden = true;
    catcher.addEventListener("click", function (ev) {
      ev.preventDefault();
      closeSettings();
    });
    document.body.appendChild(catcher);
    settingsCatch = catcher;
    return catcher;
  }

  function placeSettingsMenu(toggle, menu) {
    if (!toggle || !menu || menu.hidden) return;
    const box = toggle.getBoundingClientRect();
    const pad = 10;
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const vo = vv ? vv.offsetTop : 0;
    const vl = vv ? vv.offsetLeft : 0;
    const mw = menu.offsetWidth || 220;
    const mh = menu.offsetHeight || 200;
    let left = box.right - mw;
    if (left < vl + pad) left = vl + pad;
    if (left + mw > vl + vw - pad) left = Math.max(vl + pad, vl + vw - mw - pad);
    let top = box.bottom + 8;
    if (top + mh > vo + vh - pad) top = box.top - mh - 8;
    if (top < vo + pad) top = vo + pad;
    menu.style.position = "fixed";
    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";
  }

  function closeAct() {
    const mask = document.getElementById("actMask");
    if (mask) mask.hidden = true;
  }

  function openAct(title, fill) {
    const mask = document.getElementById("actMask");
    const head = document.getElementById("actTitle");
    const body = document.getElementById("actBody");
    if (head) head.textContent = title;
    if (body) {
      body.innerHTML = "";
      fill(body);
    }
    if (mask) mask.hidden = false;
  }

  function pinPad(host, onFull) {
    const dots = document.createElement("div");
    dots.className = "gate-dots";
    const pad = document.createElement("div");
    pad.className = "gate-pad act-pin";
    pad.setAttribute("role", "group");
    pad.setAttribute("aria-label", "數字門");
    let typed = "";
    function paint() {
      dots.innerHTML = "";
      for (let i = 0; i < 6; i += 1) {
        const span = document.createElement("span");
        if (i < typed.length) span.className = "is-on";
        dots.appendChild(span);
      }
    }
    function add(ch) {
      if (typed.length >= 6) return;
      typed += ch;
      paint();
      if (typed.length === 6) onFull(typed);
    }
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].forEach(function (ch) {
      if (ch === "") {
        const skip = document.createElement("span");
        skip.className = "gate-skip";
        pad.appendChild(skip);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gate-key" + (ch === "del" ? " gate-del" : "");
      btn.textContent = ch === "del" ? "⌫" : ch;
      btn.addEventListener("click", function () {
        if (ch === "del") {
          typed = typed.slice(0, -1);
          paint();
          return;
        }
        add(ch);
      });
      pad.appendChild(btn);
    });
    paint();
    host.appendChild(dots);
    host.appendChild(pad);
    return function () { return typed; };
  }

  function ensureSettings() {
    const host = document.querySelector("#cab-hud .cab-wrap");
    const wrap = document.getElementById("album-settings");
    if (!wrap) return null;
    settingsWrap = wrap;
    wrap.hidden = false;
    if (host && wrap.parentNode !== host) host.appendChild(wrap);
    if (wrap.dataset.ready) return wrap;
    wrap.dataset.ready = "1";
    let toggle = wrap.querySelector(".settings-toggle");
    if (!toggle) {
      toggle = insButton("settings-toggle", GEAR, "設定");
      wrap.appendChild(toggle);
    }
    toggle.setAttribute("aria-expanded", "false");
    let menu = wrap.querySelector(".settings-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "settings-menu";
      menu.setAttribute("role", "menu");
      wrap.appendChild(menu);
    }
    menu.hidden = true;
    menu.innerHTML = "";
    function gearRow(svg, label, job, onClick) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "settings-entry";
      row.dataset.job = job;
      row.appendChild(jobBadge(svg));
      const text = document.createElement("span");
      text.textContent = label;
      row.appendChild(text);
      row.addEventListener("click", function () {
        closeSettings();
        onClick();
      });
      return row;
    }
    menu.appendChild(gearRow(CAMERA, "更換頭像", "cover", function () { openCoverCard(); }));
    menu.appendChild(gearRow(SCENE, "更換背景", "backdrop", function () { openBackdropCard(); }));
    menu.appendChild(gearRow(PALETTE, "主題選擇", "theme", function () { openThemeCard(); }));
    menu.appendChild(gearRow(WRENCH, "GM功能", "gm", function () { openGmCard(); }));
    paintDebugChrome();
    toggle.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const open = menu.hidden;
      if (open) {
        const catcher = ensureSettingsCatch();
        catcher.hidden = false;
        document.body.appendChild(menu);
        menu.hidden = false;
        document.documentElement.classList.add("settings-open");
        requestAnimationFrame(function () { placeSettingsMenu(toggle, menu); });
      } else closeSettings();
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.classList.toggle("is-live", open);
    });
    return wrap;
  }

  function openCoverCard() {
    openAct("更換頭像", function (body) {
      const p = document.createElement("p");
      p.className = "ex-note";
      p.textContent = "選一張照片當頭像";
      body.appendChild(p);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "tag-apply";
      go.innerHTML = '<span class="tag-apply-face">選擇照片</span>';
      go.addEventListener("click", function () { if (coverInput) coverInput.click(); });
      body.appendChild(go);
    });
  }

  function openBackdropCard() {
    openAct("更換背景", function (body) {
      const p = document.createElement("p");
      p.className = "ex-note";
      p.textContent = "選一張照片當背景";
      body.appendChild(p);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "tag-apply";
      go.innerHTML = '<span class="tag-apply-face">選擇照片</span>';
      go.addEventListener("click", function () { if (backdropInput) backdropInput.click(); });
      body.appendChild(go);
    });
  }

  function openAllowanceCard() {
    openAct("零用金設定", function (body) {
      const err = document.createElement("p");
      err.className = "err";
      const amount = document.createElement("input");
      amount.type = "number";
      amount.min = "1";
      amount.placeholder = "金額";
      amount.inputMode = "numeric";
      const period = document.createElement("select");
      [["daily", "每天"], ["weekly", "每週"], ["monthly", "每月"]].forEach(function (pair) {
        const opt = document.createElement("option");
        opt.value = pair[0];
        opt.textContent = pair[1];
        period.appendChild(opt);
      });
      const extra = document.createElement("input");
      extra.type = "number";
      extra.placeholder = "週幾 0-6 或 月幾 1-28";
      extra.inputMode = "numeric";
      extra.hidden = true;
      period.addEventListener("change", function () {
        extra.hidden = period.value === "daily";
      });
      const date = document.createElement("input");
      date.type = "date";
      const today = new Date();
      date.value = today.toISOString().slice(0, 10);
      body.appendChild(err);
      const aLabel = document.createElement("label");
      aLabel.textContent = "金額";
      body.appendChild(aLabel);
      body.appendChild(amount);
      const pLabel = document.createElement("label");
      pLabel.textContent = "週期";
      body.appendChild(pLabel);
      body.appendChild(period);
      body.appendChild(extra);
      const dLabel = document.createElement("label");
      dLabel.textContent = "生效日";
      body.appendChild(dLabel);
      body.appendChild(date);
      let pin = "";
      pinPad(body, function (value) { pin = value; });
      const go = document.createElement("button");
      go.type = "button";
      go.className = "tag-apply";
      go.innerHTML = '<span class="tag-apply-face">確認</span>';
      go.addEventListener("click", async function () {
        if (busy) return;
        const n = Number(amount.value);
        if (!n || n < 1) {
          err.textContent = "請填金額";
          return;
        }
        if (pin.length !== 6) {
          err.textContent = "請輸入六位數 PIN";
          return;
        }
        const payload = {
          pin: pin,
          amount: n,
          period: period.value,
          effective_date: date.value,
        };
        if (period.value === "weekly") payload.weekday = Number(extra.value);
        if (period.value === "monthly") payload.monthday = Number(extra.value);
        busy = true;
        startWaitCardPct();
        showWaitCard("零用金設定");
        try {
          const x = await window.FamiGate.api("/api/settings/allowance", key, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            timeout: 15000,
          });
          if (!x.res || !x.res.ok) {
            err.textContent = (x.j && x.j.message) || "請再試一次";
            return;
          }
          closeAct();
          await loadState(true);
        } finally {
          hideWaitCard();
          busy = false;
        }
      });
      body.appendChild(go);
    });
  }

  function openThemeCard() {
    openAct("主題選擇", function (body) {
      const picks = document.createElement("div");
      picks.className = "theme-picks";
      const current = document.documentElement.getAttribute("data-theme") || "melody";
      THEMES.forEach(function (pair) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-pick" + (pair[0] === current ? " is-on" : "");
        btn.dataset.theme = pair[0];
        btn.textContent = pair[1];
        btn.addEventListener("click", function () {
          applyTheme(pair[0]);
          rememberTheme(pair[0]);
          picks.querySelectorAll(".theme-pick").forEach(function (el) {
            el.classList.toggle("is-on", el === btn);
          });
        });
        picks.appendChild(btn);
      });
      body.appendChild(picks);
    });
  }

  function openGmCard() {
    openAct("GM功能", function (body) {
      const allow = document.createElement("button");
      allow.type = "button";
      allow.className = "news-row";
      const allowTitle = document.createElement("strong");
      allowTitle.textContent = "零用金設定";
      allow.appendChild(allowTitle);
      allow.addEventListener("click", function () { openAllowanceCard(); });
      body.appendChild(allow);
      addSwitch(body, "切換測試", isDebug(), function (on) {
        setDebug(on);
        const feedBtn = body.querySelector(".gm-feed");
        if (feedBtn) feedBtn.hidden = !on;
      });
      addSwitch(body, "對位線", guides.show, function (on) {
        guides.show = on;
        saveGuides();
        applyGuides();
        if (on) closeAct();
      });
      const feed = document.createElement("button");
      feed.type = "button";
      feed.className = "tag-apply gm-feed";
      feed.hidden = !isDebug();
      feed.innerHTML = '<span class="tag-apply-face">測試加錢</span>';
      feed.addEventListener("click", function () {
        closeAct();
        debugFeed();
      });
      body.appendChild(feed);
    });
  }

  function startWaitCardPct() {
    waitTimer = window.setInterval(function () {
      const pct = document.getElementById("waitPct");
      const n = parseInt((pct && pct.textContent) || "0", 10) || 0;
      if (n < 90) setWaitPct(n + 1);
    }, 280);
  }

  function setBoot(on, text) {
    if (!hall) return;
    hall.classList.toggle("is-booting", !!on);
    hall.classList.toggle("with-feed", true);
    if (statusEl && text != null) statusEl.textContent = text;
  }

  function showInvite() {
    if (!hall) return;
    hall.classList.add("is-invite");
    hall.classList.remove("is-booting");
    if (invitePanel) invitePanel.hidden = false;
    if (window.FamiGate.needsSafari()) {
      if (safariNote) safariNote.hidden = false;
      if (goBtn) goBtn.hidden = true;
    }
  }

  function hideInvite() {
    if (hall) hall.classList.remove("is-invite");
    if (invitePanel) invitePanel.hidden = true;
  }

  function startWait() {
    if (goBtn) goBtn.hidden = true;
    if (nameForm) nameForm.hidden = true;
    if (waitEl) waitEl.hidden = false;
  }

  function layoutStage() {
    if (!stageBg || !hall || stageBg.hidden) return;
    const hallBox = hall.getBoundingClientRect();
    const head = document.getElementById("home-head");
    const startBox = head && !head.hidden ? head.getBoundingClientRect() : null;
    const start = startBox ? Math.max(0, startBox.bottom - hallBox.top) : 180;
    const end = start + 80;
    const fade = "linear-gradient(to bottom, #000 0, #000 " + Math.round(start) + "px, transparent " + Math.round(end) + "px)";
    stageBg.style.height = Math.round(end) + "px";
    stageBg.style.webkitMaskImage = fade;
    stageBg.style.maskImage = fade;
  }

  function applyTheme(theme) {
    const allowed = { melody: 1, kuromi: 1, cinnamoroll: 1 };
    const id = allowed[theme] ? theme : "melody";
    document.documentElement.setAttribute("data-theme", id);
  }

  function pickTheme(theme) {
    const allowed = { melody: 1, kuromi: 1, cinnamoroll: 1 };
    return allowed[theme] ? theme : "";
  }

  function renderMe(reader) {
    if (!reader || !cabHud) return;
    if (readerName) readerName.textContent = reader.display_name || "";
    applyTheme(pickTheme(rememberedTheme()) || reader.theme);
    if (faceImg) {
      faceImg.src = "./face-default.jpg?v=1";
      faceImg.hidden = false;
    }
    cabHud.hidden = false;
    if (homeHead) homeHead.hidden = false;
    ensureSettings();
  }

  function stopRoll(el) {
    if (el && el._roll) {
      window.clearInterval(el._roll);
      el._roll = 0;
    }
  }

  function countByOnes(el, add, durationMs, done) {
    const n = Math.max(0, Math.round(Number(add) || 0));
    if (!el || n === 0) {
      if (done) done();
      return;
    }
    stopRoll(el);
    if (reduceMotion()) {
      const to = (Number(el.dataset.v || 0) || 0) + n;
      el.dataset.v = String(to);
      el.textContent = String(to);
      paintedTotal = to;
      if (done) done();
      return;
    }
    const stepMs = Math.max(16, Math.floor(durationMs / n));
    let left = n;
    el._roll = window.setInterval(function () {
      const cur = (Number(el.dataset.v || 0) || 0) + 1;
      el.dataset.v = String(cur);
      el.textContent = String(cur);
      paintedTotal = cur;
      left -= 1;
      if (left <= 0) {
        stopRoll(el);
        if (done) done();
      }
    }, stepMs);
  }

  function rollNumber(el, next) {
    const to = Math.max(0, Math.round(Number(next) || 0));
    const from = Number(el.dataset.v || 0) || 0;
    stopRoll(el);
    el.dataset.v = String(to);
    if (reduceMotion() || from === to) {
      el.textContent = String(to);
      return;
    }
    let cur = from;
    el._roll = window.setInterval(function () {
      const left = to - cur;
      if (left === 0) {
        stopRoll(el);
        el.textContent = String(to);
        return;
      }
      const span = Math.abs(left);
      const step = span > 500 ? Math.ceil(span / 18) : span > 80 ? Math.ceil(span / 12) : span > 24 ? 2 : 1;
      cur += left > 0 ? Math.min(step, left) : -Math.min(step, -left);
      el.textContent = String(cur);
    }, 40);
  }

  function spawnCoins(host, count) {
    if (!host) return;
    const layer = host.querySelector(".pig-coins") || host;
    for (let i = 0; i < count; i += 1) {
      const coin = document.createElement("span");
      coin.className = "pig-coin";
      coin.style.left = (28 + i * 18) + "%";
      coin.style.top = (18 + (i % 2) * 12) + "%";
      coin.style.setProperty("--dx", ((i % 2 ? 1 : -1) * (36 + i * 12)) + "px");
      coin.style.setProperty("--dy", (-70 - i * 12) + "px");
      layer.appendChild(coin);
      window.setTimeout(function () { coin.remove(); }, 900);
    }
  }

  function bouncePig() {
    if (!pigBlock) return;
    pigBlock.classList.remove("is-feeding");
    void pigBlock.offsetWidth;
    pigBlock.classList.add("is-feeding");
  }

  function playFeedCoins(amount) {
    const ovNum = document.getElementById("ovNum");
    const total = snapshot ? Number(snapshot.total || 0) : 0;
    const add = Math.max(0, Math.round(Number(amount || 0)));
    const n = Math.floor(add / 10);
    const layer = document.querySelector("#active-pig .pig-coins");
    function settle() {
      if (ovNum) {
        const cur = Number(ovNum.dataset.v || 0) || 0;
        countByOnes(ovNum, total - cur, 80, function () {
          ovNum.textContent = String(total);
          ovNum.dataset.v = String(total);
          paintedTotal = total;
        });
      } else paintedTotal = total;
    }
    if (!pigBlock || !layer || !n) {
      if (ovNum && add) countByOnes(ovNum, add, FEED_MS, settle);
      else settle();
      return;
    }
    const token = ++feedToken;
    stopRoll(ovNum);
    function dropOne(i) {
      if (token !== feedToken) return;
      if (i >= n) {
        window.setTimeout(function () {
          if (token === feedToken && pigBlock) pigBlock.classList.remove("is-feeding");
        }, FEED_SQUASH_MS);
        settle();
        return;
      }
      const coin = document.createElement("span");
      coin.className = "pig-coin is-dropping";
      coin.style.setProperty("--pig-coin-y", guides.coin + "%");
      layer.appendChild(coin);
      window.setTimeout(function () {
        if (token !== feedToken) return;
        bouncePig();
      }, FEED_BOUNCE_AT);
      let finished = false;
      let coinDone = false;
      let countDone = false;
      function maybeNext() {
        if (token !== feedToken) return;
        if (coinDone && countDone) dropOne(i + 1);
      }
      countByOnes(ovNum, 10, FEED_MS, function () {
        countDone = true;
        maybeNext();
      });
      function finish() {
        if (finished || token !== feedToken) return;
        finished = true;
        coin.removeEventListener("animationend", onDone);
        if (coin.parentNode) coin.remove();
        coinDone = true;
        maybeNext();
      }
      function onDone(ev) {
        if (ev && ev.target !== coin) return;
        finish();
      }
      coin.addEventListener("animationend", onDone);
      window.setTimeout(finish, FEED_MS + 50);
    }
    dropOne(0);
  }

  function setPigState(name, on) {
    if (!pigBlock) return;
    pigBlock.classList.toggle(name, !!on);
  }

  function clearPigAnim() {
    if (!pigBlock) return;
    ["is-feeding", "is-full", "is-harvesting", "is-hit-1", "is-hit-2", "is-hit-3", "is-hit-4", "is-hit-5", "is-shattered"].forEach(function (name) {
      pigBlock.classList.remove(name);
    });
  }

  function harvestable() {
    const pig = snapshot && snapshot.active_pig;
    return pig ? Number(pig.pending_yield || 0) || 0 : 0;
  }

  function paintOverview(animate) {
    const total = snapshot ? Number(snapshot.total || 0) : 0;
    const ovNum = document.getElementById("ovNum");
    if (ovNum) {
      if (animate) rollNumber(ovNum, total);
      else {
        ovNum.textContent = String(total);
        ovNum.dataset.v = String(total);
      }
    }
    paintedTotal = total;
  }

  function paintActive(animate, feeding, feedAmount) {
    const pig = snapshot && snapshot.active_pig;
    if (pigBlock) {
      pigBlock.classList.toggle("is-harvesting", harvestable() > 0);
      if (feeding && animate && feedAmount > 0) playFeedCoins(feedAmount);
      if (feeding && animate && feedAmount < 0) bouncePig();
    }
    const layer = document.querySelector("#active-pig .pig-coins");
    if (layer && harvestable() > 0 && !layer.querySelector(".pig-coin:not(.is-dropping)")) {
      const coin = document.createElement("span");
      coin.className = "pig-coin";
      coin.style.left = "38%";
      coin.style.top = "12%";
      layer.appendChild(coin);
    } else if (layer && harvestable() <= 0) {
      Array.from(layer.querySelectorAll(".pig-coin:not(.is-dropping)")).forEach(function (el) {
        el.remove();
      });
    }
  }

  function stopAllowClock() {
    if (allowTimer) {
      window.clearInterval(allowTimer);
      allowTimer = 0;
    }
  }

  function startAllowClock(serverNowIso, nextIso) {
    stopAllowClock();
    allowServerNow = Date.parse(serverNowIso || "");
    allowNext = Date.parse(nextIso || "");
    allowOrigin = Date.now();
    function tick() {
      if (!allowNext || Number.isNaN(allowNext) || Number.isNaN(allowServerNow)) return;
      const left = allowNext - (allowServerNow + (Date.now() - allowOrigin));
      if (left <= 0) {
        stopAllowClock();
        if (!busy) loadState(false);
      }
    }
    tick();
    allowTimer = window.setInterval(tick, 1000);
  }

  function paintClaim() {
    if (!claimBtn) return;
    const periods = (snapshot && snapshot.claimable_periods) || [];
    const today = periods.find(function (item) { return item.claim_kind === "on_time"; }) || periods[0];
    const caption = document.getElementById("allowCaption");
    const ready = !!today;
    claimBtn.hidden = false;
    claimBtn.disabled = !ready;
    claimBtn.classList.toggle("is-live", ready);
    claimBtn.classList.toggle("is-ready", ready);
    if (ready) {
      claimBtn.dataset.period = today.period_key;
      claimBtn.setAttribute("aria-label", "領取 " + today.amount + " 元");
      if (caption) caption.textContent = "領取 " + today.amount + " 元";
      stopAllowClock();
    } else {
      claimBtn.removeAttribute("data-period");
      claimBtn.setAttribute("aria-label", "尚未可領");
      if (caption) caption.textContent = "每晚 7 點發放";
      startAllowClock(snapshot && snapshot.now, snapshot && snapshot.next_allowance_at);
    }
  }

  function showRail() {
    if (!rail) return;
    rail.hidden = false;
    document.documentElement.classList.add("has-rail");
    if (!rail.dataset.ready) {
      rail.dataset.ready = "1";
      const bank = insButton("rail-bank", BANK, "銀行");
      bank.dataset.mode = "bank";
      bank.addEventListener("click", function () { pickTab("bank"); });
      const records = insButton("rail-ledger", LEDGER, "紀錄");
      records.dataset.mode = "ledger";
      records.addEventListener("click", function () { pickTab("ledger"); });
      rail.appendChild(bank);
      rail.appendChild(records);
    }
    paintRailModes();
  }

  function paintRailModes() {
    if (!rail) return;
    rail.querySelectorAll(".rail-bank, .rail-ledger").forEach(function (el) {
      const on = el.dataset.mode === hostTab;
      el.classList.toggle("is-off", !on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  async function debugFeed() {
    if (busy || !isDebug()) return;
    busy = true;
    setCabRun(true);
    try {
      const x = await api("/api/debug/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        timeout: 15000,
      });
      if (x.res && x.res.ok) await loadState(true);
    } finally {
      setCabRun(false);
      busy = false;
    }
  }

  function paintLedger(rows) {
    if (!ledger) return;
    ledger.innerHTML = "";
    if (!rows || !rows.length) {
      const empty = document.createElement("p");
      empty.className = "news-empty";
      empty.textContent = "還沒有紀錄";
      ledger.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "news-row";
      const title = document.createElement("strong");
        title.textContent = row.note || row.kind || "紀錄";
      const meta = document.createElement("span");
      const when = String(row.created_at || "").replace("T", " ").slice(0, 16);
      meta.textContent = (row.amount >= 0 ? "+" : "") + yen(row.amount) + "  ·  " + when;
      btn.appendChild(title);
      btn.appendChild(meta);
      ledger.appendChild(btn);
    });
  }

  function paintModes() {
    if (!hall) return;
    hall.classList.toggle("is-mode-bank", hostTab === "bank");
    hall.classList.toggle("is-mode-ledger", hostTab === "ledger");
    const bar = document.getElementById("mode-bar");
    if (bar) {
      bar.querySelectorAll(".mode-btn").forEach(function (el) {
        el.classList.toggle("is-on", el.dataset.mode === hostTab);
      });
    }
    const tagBoard = document.getElementById("tag-board");
    if (tagBoard) tagBoard.hidden = true;
    showRail();
  }

  function pickTab(tab) {
    hostTab = tab || "bank";
    paintModes();
    if (hostTab === "ledger") loadLedger();
  }

  function bindModes() {
    showRail();
    const bar = document.getElementById("mode-bar");
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = "1";
    bar.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { pickTab(btn.dataset.mode); });
    });
  }

  async function api(path, opts) {
    return window.FamiGate.api(path, key, opts || {});
  }

  async function loadState(feeding) {
    const x = await api("/api/state", { timeout: 15000 });
    if (!x.res || !x.res.ok || !x.j) return;
    const prev = snapshot && snapshot.revision;
    snapshot = x.j;
    applyTheme(pickTheme(rememberedTheme()) || snapshot.theme);
    const added = Number(snapshot.total || 0) - paintedTotal;
    const animate = shouldAnimate(snapshot.revision) && feeding;
    const feedUp = !!(feeding && animate && added > 0);
    if (!feedUp) paintOverview(animate);
    paintActive(animate, feeding, added);
    paintClaim();
    showRail();
    rememberRevision(snapshot.revision);
    if (prev != null && snapshot.revision === prev) return;
  }

  async function loadLedger() {
    const x = await api("/api/ledger?limit=50", { timeout: 15000 });
    paintLedger(x.j || []);
  }

  async function harvestPig(id) {
    if (busy) return;
    busy = true;
    try {
      const x = await api("/api/harvest/pig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pig_id: id }),
        timeout: 15000,
      });
      if (x.res && x.res.ok) await loadState(true);
    } finally {
      busy = false;
    }
  }

  function closeExchange() {
    const token = exToken;
    const shouldCancel = !!(token && exStage === "qr" && !exSettled);
    const mask = document.getElementById("exchange-sheet");
    if (mask) mask.hidden = true;
    exStage = "";
    exAmount = 0;
    exToken = "";
    exSettled = false;
    if (exPoll) {
      window.clearInterval(exPoll);
      exPoll = 0;
    }
    if (shouldCancel) {
      api("/api/exchange/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: token }),
        timeout: 8000,
      }).then(function () {
        if (!busy) loadState(false);
      });
    }
  }

  function exApplyFace(text) {
    const btn = document.getElementById("exApply");
    const face = btn && (btn.querySelector(".tag-apply-face") || btn);
    if (face) face.textContent = text;
    if (btn) btn.hidden = !text;
  }

  function collectPickIds() {
    const pig = snapshot && snapshot.active_pig;
    return pig && pig.id ? [pig.id] : [];
  }

  function amountPad(host, onConfirm) {
    const show = document.createElement("p");
    show.className = "money-hero";
    const num = document.createElement("span");
    num.className = "money-num";
    num.textContent = "0";
    show.appendChild(num);
    const err = document.createElement("p");
    err.className = "err";
    err.id = "exErr";
    const pad = document.createElement("div");
    pad.className = "gate-pad act-pin";
    pad.setAttribute("role", "group");
    pad.setAttribute("aria-label", "金額");
    let digits = "";
    function value() {
      return Number(digits) || 0;
    }
    function deposit() {
      return snapshot && typeof snapshot.total === "number" ? snapshot.total : 0;
    }
    function paint() {
      const n = value();
      num.textContent = String(n);
      exAmount = n;
      const over = n > deposit();
      err.textContent = over ? "金額超過存款" : "";
      const bag = pad.querySelector(".ex-bag");
      if (bag) {
        bag.disabled = n < 1 || over;
        bag.classList.toggle("is-live", n >= 1 && !over);
      }
    }
    function add(ch) {
      if (digits.length >= 7) return;
      if (digits === "0") digits = "";
      digits += ch;
      paint();
    }
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bag", "0", "del"].forEach(function (ch) {
      if (ch === "bag") {
        const bag = document.createElement("button");
        bag.type = "button";
        bag.className = "gate-key ex-bag";
        bag.setAttribute("aria-label", "確認");
        bag.innerHTML = SPEND;
        bag.disabled = true;
        bag.addEventListener("click", function () {
          if (bag.disabled) return;
          onConfirm(value(), err);
        });
        pad.appendChild(bag);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gate-key" + (ch === "del" ? " gate-del" : "");
      btn.textContent = ch === "del" ? "⌫" : ch;
      if (ch === "del") btn.setAttribute("aria-label", "刪除");
      btn.addEventListener("click", function () {
        if (ch === "del") {
          digits = digits.slice(0, -1);
          paint();
          return;
        }
        add(ch);
      });
      pad.appendChild(btn);
    });
    paint();
    host.appendChild(show);
    host.appendChild(err);
    host.appendChild(pad);
  }

  function openExchange() {
    const mask = document.getElementById("exchange-sheet");
    const title = document.getElementById("exTitle");
    const tray = document.getElementById("exchange-tray");
    if (title) title.textContent = "消費";
    if (!tray) return;
    tray.innerHTML = "";
    exStage = "form";
    exAmount = 0;
    exToken = "";
    exSettled = false;
    exApplyFace("");
    amountPad(tray, function (n, err) {
      if (busy) return;
      if (n < 1) {
        if (err) err.textContent = "請輸入金額";
        return;
      }
      const total = snapshot && typeof snapshot.total === "number" ? snapshot.total : 0;
      if (n > total) {
        if (err) err.textContent = "金額超過存款";
        return;
      }
      reserveNow(err);
    });
    if (mask) mask.hidden = false;
    loadState(false);
  }

  async function reserveNow(err) {
    if (busy) return;
    busy = true;
    try {
      const x = await api("/api/exchange/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: exAmount,
          child_note: "消費",
          pig_ids: collectPickIds(),
        }),
        timeout: 15000,
      });
      if (!x.res || !x.res.ok || !x.j) {
        if (err) err.textContent = (x.j && x.j.message) || "還沒能產生 QR";
        return;
      }
      const mask = document.getElementById("exchange-sheet");
      if (exStage !== "form" || !mask || mask.hidden) {
        api("/api/exchange/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: x.j.token }),
          timeout: 8000,
        });
        return;
      }
      exStage = "qr";
      paintQr(x.j);
    } finally {
      busy = false;
    }
  }

  function paintQr(result) {
    const tray = document.getElementById("exchange-tray");
    const title = document.getElementById("exTitle");
    if (title) title.textContent = "請給父母掃";
    if (!tray) return;
    tray.innerHTML = "";
    exToken = result.token || "";
    const img = document.createElement("img");
    img.className = "ex-qr";
    img.alt = "消費 QR";
    img.src = window.FamiGate.origin() + "/api/exchange/qr.svg?x=" + encodeURIComponent(result.token) + "&k=" + encodeURIComponent(key);
    tray.appendChild(img);
    const note = document.createElement("p");
    note.className = "ex-note";
    note.textContent = "尚未扣款，關閉即可反悔";
    tray.appendChild(note);
    startPoll(result.id);
  }

  function startPoll(id) {
    if (exPoll) window.clearInterval(exPoll);
    exPoll = window.setInterval(async function () {
      const x = await api("/api/exchange/status?id=" + encodeURIComponent(id), { timeout: 8000 });
      if (!x.j) return;
      if (x.j.status === "completed") {
        window.clearInterval(exPoll);
        exPoll = 0;
        exSettled = true;
        closeExchange();
        await loadState(true);
      } else if (x.j.status === "cancelled" || x.j.status === "expired") {
        window.clearInterval(exPoll);
        exPoll = 0;
        exSettled = true;
        closeExchange();
        await loadState(false);
      }
    }, 1600);
  }

  function bindMaskClose(maskId, closeFn) {
    const mask = document.getElementById(maskId);
    if (!mask) return;
    if (window.FamiGate && window.FamiGate.lockSheetPage) window.FamiGate.lockSheetPage(mask);
    let down = false;
    mask.addEventListener("pointerdown", function (ev) {
      down = ev.target === mask;
    });
    mask.addEventListener("pointerup", function (ev) {
      if (down && ev.target === mask) closeFn();
      down = false;
    });
  }

  function closeAsk() {
    const mask = document.getElementById("askMask");
    if (mask) mask.hidden = true;
  }

  function scheduleReconnect() {
    if (bootTimer) return;
    bootTimer = window.setTimeout(function () {
      bootTimer = 0;
      boot();
    }, 8000);
  }

  async function boot() {
    if (booting) return;
    booting = true;
    if (window.FamiGate) {
      window.FamiGate.blockWebChrome();
      window.FamiGate.bindKeyboard();
    }
    loadGuides();
    applyGuides();
    key = window.PIGGY_VIEW_KEY || (window.FamiGate && window.FamiGate.currentKey()) || "";
    if (!document.getElementById("home-head")) {
      showInvite();
      booting = false;
      return;
    }
    setBoot(true, "正在連接小金庫…");
    try {
      if (!window.FamiGate.origin()) {
        if (statusEl) statusEl.textContent = "正在連接小金庫…";
        scheduleReconnect();
        return;
      }
      if (!key) {
        setBoot(false);
        if (window.PIGGY_FORCE_INVITE || window.PIGGY_URL_KEY) showInvite();
        else if (statusEl) statusEl.textContent = "請用邀請連結打開";
        return;
      }
      const x = await window.FamiGate.api("/api/door", key, { timeout: 20000 });
      if (!x.res || !x.res.ok || !x.j) {
        if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
        scheduleReconnect();
        return;
      }
      if (x.j.kind === "invite") {
        setBoot(false);
        showInvite();
        if (statusEl) statusEl.textContent = "";
        return;
      }
      hideInvite();
      const blobs = document.querySelector(".blobs");
      if (blobs) blobs.hidden = true;
      window.FamiGate.savePersonal(key);
      window.FamiGate.pinKey(key);
      renderMe(x.j.reader);
      bindModes();
      hostTab = "bank";
      paintModes();
      setBoot(false, "");
      if (statusEl) statusEl.textContent = "";
      await loadState(false);
      ready = true;
      if (typeof navigator.standalone === "boolean" && !navigator.standalone) {
        const seen = localStorage.getItem("piggybank.installed");
        if (!seen && homeInstall) homeInstall.hidden = false;
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = "維護中,請5分鐘後再試";
      scheduleReconnect();
    } finally {
      booting = false;
    }
  }

  if (goBtn) goBtn.addEventListener("click", function () {
    if (busy) return;
    if (window.FamiGate.needsSafari()) return;
    goBtn.hidden = true;
    if (!nameForm || !nameInput) return;
    nameForm.hidden = false;
    nameInput.readOnly = true;
    nameInput.addEventListener("touchend", function once(ev) {
      if (Math.hypot(ev.changedTouches[0].clientX - (this._x || 0), ev.changedTouches[0].clientY - (this._y || 0)) > 12) return;
      nameInput.readOnly = false;
      nameInput.focus();
    });
    nameInput.addEventListener("touchstart", function (ev) {
      this._x = ev.touches[0].clientX;
      this._y = ev.touches[0].clientY;
    });
    setTimeout(function () {
      nameInput.readOnly = false;
      nameInput.focus();
    }, 50);
  });

  if (nameForm) nameForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;
    const inviteKey = window.PIGGY_URL_KEY || window.FamiGate.currentKey();
    if (!inviteKey) {
      if (nameErr) nameErr.textContent = "請用邀請連結打開";
      return;
    }
    busy = true;
    startWait();
    const name = (nameInput.value || "").trim();
    try {
      const x = await window.FamiGate.api("/api/join", inviteKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }),
        timeout: 20000,
      });
      if (!x.res.ok || !x.j || !x.j.token) {
        if (nameErr) nameErr.textContent = (x.j && x.j.message) || "請再試一次";
        waitEl.hidden = true;
        nameForm.hidden = false;
        busy = false;
        return;
      }
      window.FamiGate.savePersonal(x.j.token);
      location.href = "./index.html?k=" + encodeURIComponent(x.j.token) + "#k=" + encodeURIComponent(x.j.token);
    } catch (err) {
      if (nameErr) nameErr.textContent = "家裡還沒開";
      waitEl.hidden = true;
      nameForm.hidden = false;
      busy = false;
    }
  });

  const homeInstalled = document.getElementById("home-installed");
  if (homeInstalled) homeInstalled.addEventListener("click", function () {
    try { localStorage.setItem("piggybank.installed", "1"); } catch (e) {}
    if (homeInstall) homeInstall.hidden = true;
  });

  if (coverInput) coverInput.addEventListener("change", function () {
    const file = coverInput.files && coverInput.files[0];
    closeAct();
    if (!file || !faceImg) return;
    faceImg.src = URL.createObjectURL(file);
    coverInput.value = "";
  });

  if (backdropInput) backdropInput.addEventListener("change", function () {
    const file = backdropInput.files && backdropInput.files[0];
    closeAct();
    if (!file || !stageBg || waitBusy) {
      if (backdropInput) backdropInput.value = "";
      return;
    }
    waitBusy = true;
    showWaitCard("更換背景中");
    startWaitCardPct();
    const entry = document.querySelector('.settings-entry[data-job="backdrop"]');
    setJobRun(entry, true);
    setCabRun(true);
    try {
      const url = URL.createObjectURL(file);
      hall.classList.add("has-backdrop");
      stageBg.style.backgroundImage = "url(" + url + ")";
      stageBg.hidden = false;
      if (readerName) readerName.classList.add("is-on-dark");
      requestAnimationFrame(layoutStage);
      setWaitPct(100);
    } finally {
      hideWaitCard();
      setJobRun(entry, false);
      setCabRun(false);
      waitBusy = false;
      backdropInput.value = "";
    }
  });

  if (claimBtn) claimBtn.addEventListener("click", async function () {
    if (busy || claimBtn.hidden || claimBtn.disabled) return;
    const period = claimBtn.dataset.period;
    if (!period) return;
    busy = true;
    setCabRun(true);
    try {
      const x = await api("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_key: period }),
        timeout: 15000,
      });
      if (x.res && x.res.ok) await loadState(true);
    } finally {
      setCabRun(false);
      busy = false;
    }
  });

  if (pigBlock) pigBlock.addEventListener("click", function () {
    const pig = snapshot && snapshot.active_pig;
    if (!pig || harvestable() <= 0) return;
    harvestPig(pig.id);
  });

  const actClose = document.getElementById("actClose");
  if (actClose) actClose.addEventListener("click", closeAct);
  const exClose = document.getElementById("exClose");
  if (exClose) exClose.addEventListener("click", closeExchange);
  bindMaskClose("actMask", closeAct);
  bindMaskClose("waitMask", hideWaitCard);
  bindMaskClose("exchange-sheet", closeExchange);
  if (window.FamiGate && window.FamiGate.lockSheetPage) {
    const askMask = document.getElementById("askMask");
    if (askMask) window.FamiGate.lockSheetPage(askMask);
  }
  if (ovTotal) {
    ovTotal.addEventListener("click", function () {
      if (busy || !ready) return;
      openExchange();
    });
  }

  const askNo = document.getElementById("askNo");
  const askOk = document.getElementById("askOk");
  if (askNo) askNo.addEventListener("click", closeAsk);
  if (askOk) askOk.addEventListener("click", closeAsk);

  window.addEventListener("resize", layoutStage);
  boot();
})();
