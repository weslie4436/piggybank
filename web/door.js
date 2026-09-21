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
  const pigValue = document.getElementById("pig-value");
  const progressFill = document.getElementById("pig-progress-fill");
  const progressText = document.getElementById("pig-progress-text");
  const claimBtn = document.getElementById("claim-apply");
  const warehouse = document.getElementById("warehouse");
  const pageBonus = document.getElementById("page-bonus");
  const ledger = document.getElementById("ledger");
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.8l.6-1.3h3.6l.6 1.3 1.6.7 1.4-.5 2.5 2.5-.5 1.4.7 1.6 1.3.6v3.6l-1.3.6-.7 1.6.5 1.4-2.5 2.5-1.4-.5-1.6.7-.6 1.3h-3.6l-.6-1.3-1.6-.7-1.4.5-2.5-2.5.5-1.4-.7-1.6-1.3-.6v-3.6l1.3-.6.7-1.6-.5-1.4L6.6 4l1.4.5 1.6-.7z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><circle cx="12" cy="11.9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="17" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8l1.4-2.4h5.2L16 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const SCENE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 16.2l4.2-4.6 3 3.2 2.2-2.4 3.6 3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="9" cy="9.2" r="1.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C10.5 18.4 7.3 15.8 5.4 11.9C4 9.1 5.2 6 8.4 6c1.8 0 3 1.1 3.6 2.2C12.6 7.1 13.8 6 15.6 6c3.2 0 4.4 3.1 3 5.9C16.7 15.8 13.5 18.4 12 20Z"/></svg>';
  const HEART_RAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C10.5 18.4 7.3 15.8 5.4 11.9C4 9.1 5.2 6 8.4 6c1.8 0 3 1.1 3.6 2.2C12.6 7.1 13.8 6 15.6 6c3.2 0 4.4 3.1 3 5.9C16.7 15.8 13.5 18.4 12 20Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.8v8.4M10 9.4c.6-.7 1.4-1 2-1 1.2 0 2.1.7 2.1 1.8S13.2 12 12 12h-.8C10 12 9.1 12.7 9.1 13.8S10 15.6 12 15.6c.7 0 1.5-.3 2.1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const PALETTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r="1.2"/><circle cx="13.5" cy="9.2" r="1.2"/><circle cx="15" cy="13" r="1.2"/><circle cx="10.5" cy="14.4" r="1.2"/></svg>';
  const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.4" r="3.1" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6.2 18.6c.9-3.3 3.2-5 5.8-5s4.9 1.7 5.8 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const FAV_KEY = "piggybank.favs";
  const SEEN_KEY = "piggybank.lastSeenRevision";
  const DEBUG_KEY = "piggybank.debug";
  const THEMES = [
    ["melody", "Melody"],
    ["kuromi", "Kuromi"],
    ["cinnamoroll", "Cinnamoroll"],
  ];
  let key = "";
  let busy = false;
  let settingsWrap = null;
  let settingsCatch = null;
  let hostTab = "fav";
  let waitBusy = false;
  let waitTimer = 0;
  let ready = false;
  let booting = false;
  let bootTimer = 0;
  let holdTimer = 0;
  let holdFired = false;
  let selected = new Set();
  let selectMode = false;
  let snapshot = null;
  let pageNo = 1;
  let catalog = {};
  let favs = new Set();
  let askUnfavId = "";
  let exStage = "";
  let exAmount = 0;
  let exNote = "";
  let exPicks = [];
  let exPickIds = [];
  let exHits = 0;
  let exPreview = null;
  let exPoll = 0;
  let paintedTotal = 0;
  let paintedPig = 0;
  let feedToken = 0;
  const FEED_MS = 480;
  const FEED_BOUNCE_AT = 290;
  const FEED_SQUASH_MS = 420;

  try {
    favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  } catch (e) {
    favs = new Set();
  }

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

  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs))); } catch (e) {}
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
    const row = document.querySelector('.settings-entry[data-job="debug"]');
    if (row) row.classList.toggle("is-host", isDebug());
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
    menu.appendChild(gearRow(COIN, "零用金設定", "allowance", function () { openAllowanceCard(); }));
    menu.appendChild(gearRow(PALETTE, "主題選擇", "theme", function () { openThemeCard(); }));
    menu.appendChild(gearRow(PERSON, "切換測試", "debug", function () { setDebug(!isDebug()); }));
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
      const err = document.createElement("p");
      err.className = "err";
      body.appendChild(err);
      let chosen = "melody";
      THEMES.forEach(function (pair) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "news-row";
        btn.textContent = pair[1];
        btn.addEventListener("click", function () {
          chosen = pair[0];
          body.querySelectorAll(".news-row").forEach(function (el) {
            el.classList.toggle("is-on", el === btn);
          });
        });
        body.appendChild(btn);
      });
      let pin = "";
      pinPad(body, function (value) { pin = value; });
      const go = document.createElement("button");
      go.type = "button";
      go.className = "tag-apply";
      go.innerHTML = '<span class="tag-apply-face">確認</span>';
      go.addEventListener("click", async function () {
        if (pin.length !== 6) {
          err.textContent = "請輸入六位數 PIN";
          return;
        }
        const x = await window.FamiGate.api("/api/settings/theme", key, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: chosen, pin: pin }),
          timeout: 15000,
        });
        if (!x.res || !x.res.ok) {
          err.textContent = (x.j && x.j.message) || "請再試一次";
          return;
        }
        applyTheme(chosen);
        closeAct();
      });
      body.appendChild(go);
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
    const tags = document.getElementById("tag-board");
    const startBox = tags && !tags.hidden ? tags.getBoundingClientRect() : null;
    const start = startBox ? Math.max(0, startBox.top - hallBox.top) : 180;
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

  function renderMe(reader) {
    if (!reader || !cabHud) return;
    if (readerName) readerName.textContent = reader.display_name || "";
    applyTheme(reader.theme);
    if (faceImg) {
      faceImg.src = "./face-default.jpg?v=1";
      faceImg.hidden = false;
    }
    cabHud.hidden = false;
    if (homeHead) homeHead.hidden = false;
    ensureSettings();
  }

  function rollNumber(el, next, suffix) {
    const to = Math.max(0, Math.round(Number(next) || 0));
    const from = Number(el.dataset.v || 0) || 0;
    el.dataset.v = String(to);
    const unit = suffix == null ? " 元" : suffix;
    if (reduceMotion() || from === to) {
      el.textContent = to + unit;
      return;
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / 420);
      el.textContent = Math.round(from + (to - from) * t) + unit;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
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
    const n = Math.max(0, Math.floor(Number(amount || 0) / 10));
    const layer = document.querySelector("#active-pig .pig-coins");
    if (!pigBlock || !layer || !n) return;
    const token = ++feedToken;
    function dropOne(i) {
      if (token !== feedToken) return;
      if (i >= n) {
        window.setTimeout(function () {
          if (token === feedToken && pigBlock) pigBlock.classList.remove("is-feeding");
        }, FEED_SQUASH_MS);
        return;
      }
      const coin = document.createElement("span");
      coin.className = "pig-coin is-dropping";
      layer.appendChild(coin);
      window.setTimeout(function () {
        if (token !== feedToken) return;
        bouncePig();
      }, FEED_BOUNCE_AT);
      let finished = false;
      function finish() {
        if (finished || token !== feedToken) return;
        finished = true;
        coin.removeEventListener("animationend", onDone);
        if (coin.parentNode) coin.remove();
        dropOne(i + 1);
      }
      function onDone(ev) {
        if (ev && ev.target !== coin) return;
        finish();
      }
      coin.addEventListener("animationend", onDone);
      window.setTimeout(finish, FEED_MS + 80);
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

  function fullPigs() {
    const pages = (snapshot && snapshot.warehouse_pages) || [];
    const out = [];
    pages.forEach(function (page) {
      (page.pigs || []).forEach(function (pig) {
        if (pig.status === "full") out.push(pig);
      });
    });
    return out;
  }

  function harvestable() {
    let n = 0;
    ((snapshot && snapshot.warehouse_pages) || []).forEach(function (page) {
      n += Number(page.pending_bonus || 0) || 0;
      (page.pigs || []).forEach(function (pig) {
        n += Number(pig.pending_yield || 0) || 0;
      });
    });
    return n;
  }

  function paintOverview(animate) {
    const total = snapshot ? Number(snapshot.total || 0) : 0;
    const yieldN = harvestable();
    const fullN = fullPigs().length;
    const grow = snapshot && snapshot.active_pig ? Number(snapshot.active_pig.value || 0) : 0;
    const ovTotal = document.getElementById("ovTotal");
    const ovGain = document.getElementById("ovGain");
    const ovFull = document.getElementById("ovFull");
    const ovGrow = document.getElementById("ovGrow");
    const ovYield = document.getElementById("ovYield");
    if (ovTotal) {
      if (animate) rollNumber(ovTotal, total, " 元");
      else {
        ovTotal.textContent = yen(total);
        ovTotal.dataset.v = String(total);
      }
    }
    if (ovGain) ovGain.textContent = yen(yieldN);
    if (ovFull) ovFull.textContent = String(fullN);
    if (ovGrow) ovGrow.textContent = yen(grow);
    if (ovYield) ovYield.textContent = "可收收益  " + yen(yieldN);
    paintedTotal = total;
  }

  function paintActive(animate, feeding, feedAmount) {
    const pig = snapshot && snapshot.active_pig;
    const value = pig ? Number(pig.value || 0) : 0;
    const cap = pig ? Number(pig.capacity || 150) : 150;
    if (pigValue) {
      if (animate) rollNumber(pigValue, value, " 元");
      else {
        pigValue.textContent = yen(value);
        pigValue.dataset.v = String(value);
      }
    }
    if (progressFill) progressFill.style.width = Math.max(0, Math.min(100, cap ? (value / cap) * 100 : 0)) + "%";
    if (progressText) progressText.textContent = value + " / " + cap + " 元";
    if (pigBlock) {
      pigBlock.classList.toggle("is-full", !!(pig && pig.status === "full"));
      if (feeding && animate) playFeedCoins(feedAmount);
    }
    paintedPig = value;
  }

  function paintClaim() {
    if (!claimBtn) return;
    const periods = (snapshot && snapshot.claimable_periods) || [];
    const today = periods.find(function (item) { return item.claim_kind === "on_time"; }) || periods[0];
    if (!today) {
      claimBtn.hidden = true;
      claimBtn.disabled = true;
      return;
    }
    const face = claimBtn.querySelector(".tag-apply-face") || claimBtn;
    face.textContent = "領取今日 " + today.amount + " 元";
    claimBtn.hidden = false;
    claimBtn.disabled = false;
    claimBtn.dataset.period = today.period_key;
  }

  function currentPage() {
    const pages = (snapshot && snapshot.warehouse_pages) || [];
    return pages.find(function (page) { return page.page_no === pageNo; }) || pages[0] || { page_no: 1, pigs: [], pending_bonus: 0 };
  }

  function paintWarehouse() {
    if (!warehouse) return;
    catalog = {};
    warehouse.innerHTML = "";
    const favMode = hostTab === "fav";
    const page = currentPage();
    const bySlot = {};
    (page.pigs || []).forEach(function (pig) {
      bySlot[pig.slot_no] = pig;
    });
    if (favMode) {
      const loved = fullPigs().filter(function (pig) { return favs.has(pig.id); });
      warehouse.hidden = loved.length === 0;
      loved.forEach(function (pig) { warehouse.appendChild(tileEl(pig, true)); });
      if (pageBonus) pageBonus.hidden = true;
      return;
    }
    warehouse.hidden = false;
    for (let slot = 1; slot <= 6; slot += 1) {
      const pig = bySlot[slot];
      warehouse.appendChild(pig ? tileEl(pig, true) : emptyTile());
    }
    if (pageBonus) {
      const pending = Number(page.pending_bonus || 0) || 0;
      pageBonus.hidden = pending <= 0;
      pageBonus.classList.toggle("is-harvesting", pending > 0);
    }
    paintPageNav();
  }

  function paintPageNav() {
    let nav = document.getElementById("page-nav");
    const pages = (snapshot && snapshot.warehouse_pages) || [];
    if (pages.length <= 1) {
      if (nav) nav.remove();
      return;
    }
    if (!nav) {
      nav = document.createElement("div");
      nav.id = "page-nav";
      warehouse.after(nav);
    }
    nav.innerHTML = "";
    pages.forEach(function (page) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-btn" + (page.page_no === pageNo ? " is-on" : "");
      btn.textContent = "第 " + page.page_no + " 頁";
      btn.addEventListener("click", function () {
        pageNo = page.page_no;
        paintWarehouse();
      });
      nav.appendChild(btn);
    });
  }

  function emptyTile() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile is-empty";
    return btn;
  }

  function tileEl(pig, allowHold) {
    catalog[pig.id] = pig;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile" + (pig.status === "full" ? " is-full" : "");
    btn.dataset.id = pig.id;
    const mini = document.createElement("span");
    mini.className = "pig-mini";
    mini.textContent = yen(pig.value);
    btn.appendChild(mini);
    const shield = document.createElement("span");
    shield.className = "tile-shield";
    btn.appendChild(shield);
    if (favs.has(pig.id)) {
      const heart = document.createElement("span");
      heart.className = "tile-heart";
      heart.innerHTML = HEART;
      btn.appendChild(heart);
    }
    if (Number(pig.pending_yield || 0) > 0) {
      btn.classList.add("is-harvesting");
      const coin = document.createElement("span");
      coin.className = "pig-coin";
      coin.style.left = "38%";
      coin.style.top = "12%";
      btn.appendChild(coin);
    }
    btn.addEventListener("pointerdown", function (ev) {
      if (!allowHold || (ev.button && ev.button !== 0)) return;
      holdFired = false;
      holdTimer = window.setTimeout(function () {
        holdFired = true;
        if (hostTab === "fav") {
          openUnfavAsk(pig.id);
          return;
        }
        if (selectMode && selected.has(pig.id) && selected.size === 1) {
          selected.delete(pig.id);
          selectMode = false;
        } else enterSelect(pig.id);
        paintPicks();
      }, 480);
    });
    function cancelHold() {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
      }
    }
    btn.addEventListener("pointerup", function () {
      cancelHold();
      if (holdFired) return;
      if (selectMode) {
        togglePick(pig.id);
        return;
      }
      if (exStage === "pick" && pig.status === "full") {
        toggleExPick(pig);
        return;
      }
      if (Number(pig.pending_yield || 0) > 0) harvestPig(pig.id);
    });
    btn.addEventListener("pointercancel", cancelHold);
    btn.addEventListener("pointerleave", cancelHold);
    return btn;
  }

  function paintPicks() {
    document.querySelectorAll("#warehouse .tile").forEach(function (el) {
      el.classList.toggle("is-pick", selected.has(el.dataset.id));
    });
    showRail();
    document.documentElement.classList.toggle("is-select", selectMode);
  }

  function enterSelect(id) {
    selectMode = true;
    if (id) selected.add(id);
    paintPicks();
  }

  function togglePick(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selectMode = selected.size > 0;
    paintPicks();
  }

  function clearSelect() {
    selected = new Set();
    selectMode = false;
    paintPicks();
  }

  function showRail() {
    if (!rail) return;
    const selectOn = selectMode && selected.size > 0;
    const debugOn = isDebug();
    if (!selectOn && !debugOn) {
      rail.hidden = true;
      rail.innerHTML = "";
      document.documentElement.classList.remove("has-rail");
      return;
    }
    rail.hidden = false;
    document.documentElement.classList.add("has-rail");
    rail.innerHTML = "";
    if (debugOn) {
      const feed = insButton("rail-feed", COIN, "測試加錢");
      feed.addEventListener("click", debugFeed);
      rail.appendChild(feed);
    }
    if (selectOn) {
      const heart = insButton("rail-heart", HEART_RAIL, "愛心");
      const allOn = Array.from(selected).every(function (id) { return favs.has(id); });
      if (allOn) heart.classList.add("is-on");
      heart.addEventListener("click", function () {
        const turnOn = !allOn;
        selected.forEach(function (id) {
          if (turnOn) favs.add(id);
          else favs.delete(id);
        });
        saveFavs();
        clearSelect();
        paintWarehouse();
      });
      rail.appendChild(heart);
    }
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
      empty.textContent = "還沒有帳本";
      ledger.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "news-row";
      const title = document.createElement("strong");
      title.textContent = row.note || row.kind || "帳本";
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
    hall.classList.toggle("is-mode-fav", hostTab === "fav");
    hall.classList.toggle("is-mode-warehouse", hostTab === "warehouse");
    hall.classList.toggle("is-mode-ledger", hostTab === "ledger");
    const bar = document.getElementById("mode-bar");
    if (bar) {
      bar.hidden = false;
      bar.querySelectorAll(".mode-btn").forEach(function (el) {
        el.classList.toggle("is-on", el.dataset.mode === hostTab);
      });
    }
    const tagBoard = document.getElementById("tag-board");
    if (tagBoard) tagBoard.hidden = false;
  }

  function pickTab(tab) {
    if (tab === "exchange") {
      openExchange();
      return;
    }
    hostTab = tab || "fav";
    clearSelect();
    paintModes();
    if (hostTab === "ledger") loadLedger();
    else paintWarehouse();
  }

  function bindModes() {
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
    if (snapshot.theme) applyTheme(snapshot.theme);
    const added = Number(snapshot.total || 0) - paintedTotal;
    const animate = shouldAnimate(snapshot.revision) && feeding;
    paintOverview(animate);
    paintActive(animate, feeding, added);
    paintClaim();
    paintWarehouse();
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

  async function harvestPage() {
    if (busy) return;
    busy = true;
    try {
      const x = await api("/api/harvest/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_no: pageNo }),
        timeout: 15000,
      });
      if (x.res && x.res.ok) await loadState(true);
    } finally {
      busy = false;
    }
  }

  function closeExchange() {
    const mask = document.getElementById("exchange-sheet");
    if (mask) mask.hidden = true;
    exStage = "";
    exPicks = [];
    exPickIds = [];
    exHits = 0;
    exPreview = null;
    if (exPoll) {
      window.clearInterval(exPoll);
      exPoll = 0;
    }
    if (progressText && snapshot && snapshot.active_pig) {
      const pig = snapshot.active_pig;
      progressText.textContent = pig.value + " / " + (pig.capacity || 150) + " 元";
    }
  }

  function exApplyFace(text) {
    const btn = document.getElementById("exApply");
    const face = btn && (btn.querySelector(".tag-apply-face") || btn);
    if (face) face.textContent = text;
    if (btn) btn.hidden = text === "";
  }

  function openExchange() {
    const mask = document.getElementById("exchange-sheet");
    const title = document.getElementById("exTitle");
    const tray = document.getElementById("exchange-tray");
    if (title) title.textContent = "兌換";
    if (!tray) return;
    tray.innerHTML = "";
    exStage = "form";
    exAmount = 0;
    exNote = "";
    exPicks = [];
    exPickIds = [];
    const err = document.createElement("p");
    err.className = "err";
    err.id = "exErr";
    const amount = document.createElement("input");
    amount.type = "number";
    amount.min = "1";
    amount.placeholder = "金額";
    amount.inputMode = "numeric";
    const note = document.createElement("input");
    note.maxLength = 80;
    note.placeholder = "說明";
    tray.appendChild(err);
    const aLabel = document.createElement("label");
    aLabel.textContent = "要兌換多少";
    tray.appendChild(aLabel);
    tray.appendChild(amount);
    const nLabel = document.createElement("label");
    nLabel.textContent = "說明";
    tray.appendChild(nLabel);
    tray.appendChild(note);
    amount.addEventListener("input", function () { exAmount = Number(amount.value) || 0; });
    note.addEventListener("input", function () { exNote = (note.value || "").trim(); });
    exApplyFace("確認");
    if (mask) mask.hidden = false;
    pickTabWarehouseQuiet();
  }

  function pickTabWarehouseQuiet() {
    hostTab = "warehouse";
    paintModes();
    paintWarehouse();
  }

  function toggleExPick(pig) {
    const idx = exPicks.findIndex(function (item) { return item.id === pig.id; });
    if (idx >= 0) exPicks.splice(idx, 1);
    else exPicks.push(pig);
    paintExPicks();
  }

  function paintExPicks() {
    document.querySelectorAll("#warehouse .tile").forEach(function (el) {
      el.classList.toggle("is-pick", exPicks.some(function (pig) { return pig.id === el.dataset.id; }));
    });
  }

  function paintKnock() {
    const tray = document.getElementById("exchange-tray");
    const title = document.getElementById("exTitle");
    if (title) title.textContent = "敲撲滿";
    if (!tray) return;
    tray.innerHTML = "";
    const pig = exPicks[0];
    const note = document.createElement("p");
    note.className = "ex-note";
    note.textContent = pig ? "點這隻滿豬，敲 5 下" : "請先點滿豬";
    tray.appendChild(note);
    const stage = document.createElement("div");
    stage.className = "pig-block";
    stage.id = "ex-block";
    const label = document.createElement("span");
    label.className = "pig-label";
    label.textContent = "基礎撲滿";
    const value = document.createElement("strong");
    value.className = "pig-value";
    value.textContent = pig ? yen(pig.value) : "—";
    const coins = document.createElement("span");
    coins.className = "pig-coins";
    stage.appendChild(label);
    stage.appendChild(value);
    stage.appendChild(coins);
    stage.addEventListener("click", function () { knockOnce(stage); });
    tray.appendChild(stage);
    exHits = 0;
    if (progressText) progressText.textContent = "0 / 5 下";
    if (progressFill) progressFill.style.width = "0%";
    exApplyFace("");
  }

  function knockOnce(stage) {
    if (exStage !== "knock" || !exPicks.length) return;
    if (exHits >= 5) return;
    exHits += 1;
    ["is-hit-1", "is-hit-2", "is-hit-3", "is-hit-4", "is-hit-5"].forEach(function (name, idx) {
      stage.classList.toggle(name, exHits === idx + 1);
    });
    if (progressText) progressText.textContent = exHits + " / 5 下";
    if (progressFill) progressFill.style.width = (exHits / 5) * 100 + "%";
    if (exHits === 5) {
      spawnCoins(stage, 6);
      stage.classList.add("is-shattered");
      window.setTimeout(function () { afterKnock(); }, reduceMotion() ? 80 : 720);
    }
  }

  async function afterKnock() {
    exPicks = exPicks.slice(1);
    if (exPicks.length) {
      paintKnock();
      return;
    }
    await showPreview();
  }

  async function showPreview() {
    const tray = document.getElementById("exchange-tray");
    const title = document.getElementById("exTitle");
    if (title) title.textContent = "確認兌換";
    const ids = collectPickIds();
    const x = await api("/api/exchange/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: exAmount, pig_ids: ids }),
      timeout: 15000,
    });
    if (!x.res || !x.res.ok || !x.j) {
      const err = document.createElement("p");
      err.className = "err";
      err.textContent = (x.j && x.j.message) || "這筆兌換還不能確認";
      if (tray) {
        tray.innerHTML = "";
        tray.appendChild(err);
      }
      exApplyFace("");
      return;
    }
    exPreview = x.j;
    exStage = "confirm";
    if (!tray) return;
    tray.innerHTML = "";
    const change = document.createElement("p");
    change.className = "ex-note";
    change.textContent = "找零 " + yen(x.j.change_amount) + " 會灌回正在養的豬";
    tray.appendChild(change);
    if (x.j.bonus_pages_at_risk && x.j.bonus_pages_at_risk.length) {
      const risk = document.createElement("p");
      risk.className = "ex-note";
      risk.textContent = "這頁完整六隻會暫停 Bonus";
      tray.appendChild(risk);
    }
    exApplyFace("確認");
  }

  function collectPickIds() {
    if (exPreview && exPreview.pig_ids) return exPreview.pig_ids;
    if (exPickIds.length) return exPickIds.slice();
    if (exPicks.length) return exPicks.map(function (pig) { return pig.id; });
    return Array.from(document.querySelectorAll("#warehouse .tile.is-pick"))
      .map(function (el) { return el.dataset.id; })
      .filter(Boolean);
  }

  async function reserveNow() {
    const ids = collectPickIds();
    const x = await api("/api/exchange/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: exAmount,
        child_note: exNote,
        pig_ids: ids,
      }),
      timeout: 15000,
    });
    const tray = document.getElementById("exchange-tray");
    if (!x.res || !x.res.ok || !x.j) {
      if (tray) {
        tray.innerHTML = "";
        const err = document.createElement("p");
        err.className = "err";
        err.textContent = (x.j && x.j.message) || "還沒能產生 QR";
        tray.appendChild(err);
      }
      return;
    }
    exStage = "qr";
    paintQr(x.j);
  }

  function paintQr(result) {
    const tray = document.getElementById("exchange-tray");
    const title = document.getElementById("exTitle");
    if (title) title.textContent = "請給父母掃";
    if (!tray) return;
    tray.innerHTML = "";
    const img = document.createElement("img");
    img.className = "ex-qr";
    img.alt = "兌換 QR";
    img.src = window.FamiGate.origin() + "/api/exchange/qr.svg?x=" + encodeURIComponent(result.token) + "&k=" + encodeURIComponent(key);
    tray.appendChild(img);
    const note = document.createElement("p");
    note.className = "ex-note";
    note.textContent = "等待父母核准";
    tray.appendChild(note);
    exApplyFace("");
    startPoll(result.id, result.change_amount);
  }

  function startPoll(id, changeAmount) {
    if (exPoll) window.clearInterval(exPoll);
    exPoll = window.setInterval(async function () {
      const x = await api("/api/exchange/status?id=" + encodeURIComponent(id), { timeout: 8000 });
      if (!x.j) return;
      if (x.j.status === "completed") {
        window.clearInterval(exPoll);
        exPoll = 0;
        closeExchange();
        await loadState(true);
        if (changeAmount) paintedPig = paintedPig;
      } else if (x.j.status === "cancelled" || x.j.status === "expired") {
        window.clearInterval(exPoll);
        exPoll = 0;
        closeExchange();
        await loadState(false);
      }
    }, 1600);
  }

  async function onExApply() {
    if (busy) return;
    if (exStage === "form") {
      const err = document.getElementById("exErr");
      if (exAmount < 1) {
        if (err) err.textContent = "請填金額";
        return;
      }
      if (!exNote) {
        if (err) err.textContent = "請填說明";
        return;
      }
      exStage = "pick";
      const tray = document.getElementById("exchange-tray");
      const title = document.getElementById("exTitle");
      if (title) title.textContent = "選滿豬";
      if (tray) {
        tray.innerHTML = "";
        const note = document.createElement("p");
        note.className = "ex-note";
        note.textContent = "點倉庫裡的滿豬，再確認開始敲";
        tray.appendChild(note);
      }
      exApplyFace("開始敲");
      pickTabWarehouseQuiet();
      return;
    }
    if (exStage === "pick") {
      if (!exPicks.length) return;
      exPickIds = exPicks.map(function (pig) { return pig.id; });
      exStage = "knock";
      paintKnock();
      return;
    }
    if (exStage === "confirm") {
      busy = true;
      try { await reserveNow(); } finally { busy = false; }
    }
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

  function openUnfavAsk(id) {
    askUnfavId = id;
    const mask = document.getElementById("askMask");
    const text = document.getElementById("askText");
    const yes = document.getElementById("askYes");
    const ok = document.getElementById("askOk");
    if (text) text.textContent = "是否取消最愛";
    if (yes) yes.hidden = true;
    if (ok) ok.hidden = false;
    if (mask) mask.hidden = false;
  }

  function closeAsk() {
    const mask = document.getElementById("askMask");
    if (mask) mask.hidden = true;
    askUnfavId = "";
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
      hostTab = "fav";
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

  const bonusHit = document.getElementById("page-bonus-hit");
  if (bonusHit) bonusHit.addEventListener("click", harvestPage);

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
  const exApply = document.getElementById("exApply");
  if (exApply) exApply.addEventListener("click", onExApply);

  const askNo = document.getElementById("askNo");
  const askOk = document.getElementById("askOk");
  if (askNo) askNo.addEventListener("click", closeAsk);
  if (askOk) askOk.addEventListener("click", function () {
    const id = askUnfavId;
    closeAsk();
    if (!id) return;
    favs.delete(id);
    saveFavs();
    paintWarehouse();
  });

  window.addEventListener("resize", layoutStage);
  boot();
})();
