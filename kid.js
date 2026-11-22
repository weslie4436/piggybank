/* 小豬銀行 v2 孩子主畫面。帳本規則全在 vault-local.js，這裡只負責畫面與動畫。 */
(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const balanceEl = $("balance");
  const balNum = $("bal-num");
  const pig = $("pig");
  const pigWrap = $("pig-wrap");
  const claimBtn = $("claim");
  const claimText = $("claim-text");
  const claimCount = $("claim-count");
  const waitCard = $("wait-card");
  const waitClock = $("wait-clock");
  const fx = $("fx");
  const SAY_HAPPY = ["好飽～", "謝謝你！", "存起來囉", "噗噗！", "我變胖了"];
  const SAY_POKE = ["嘿嘿", "好癢！", "噗～", "要存錢喔", "今天好嗎？"];
  let key = "";
  let snapshot = null;
  let shown = 0;
  let busy = false;
  let claiming = false;
  let clockTimer = 0;
  let parentPin = "";

  /* ---------- 基礎 ---------- */
  function api(path, opts) { return window.FamiGate.api(path, key, opts || {}); }
  function post(path, body, method) {
    return api(path, {
      method: method || "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      timeout: 20000,
    });
  }
  function msgOf(x, fallback) { return (x && x.j && x.j.message) || fallback; }
  function buzz(ms) { if (!cool("buzz", 60)) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  const sounds = {};
  function play(name) {
    if (!cool("snd:" + name, 70)) return;
    try {
      const pool = sounds[name] || (sounds[name] = []);
      let a = pool.find(function (s) { return s.paused || s.ended; });
      if (!a) {
        if (pool.length > 5) return;
        a = new Audio("./sounds/" + name + ".wav");
        pool.push(a);
      }
      a.currentTime = 0;
      a.volume = 0.7;
      const p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  /* 連點防護：同一個效果在冷卻時間內只跑一次 */
  const lastRun = Object.create(null);
  function cool(name, ms) {
    const t = performance.now();
    if (lastRun[name] && t - lastRun[name] < ms) return false;
    lastRun[name] = t;
    return true;
  }
  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function say(list, text) {
    if (!text && !cool("say", 900)) return;
    const old = pigWrap.querySelector(".pig-say");
    if (old) old.remove();
    const b = document.createElement("div");
    b.className = "pig-say";
    b.textContent = text || list[Math.floor(Math.random() * list.length)];
    pigWrap.appendChild(b);
    setTimeout(function () { b.remove(); }, 2700);
  }
  function toast(big, small) {
    document.querySelectorAll(".toast").forEach(function (o) { o.remove(); });
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = big;
    if (small) {
      const s = document.createElement("small");
      s.textContent = small;
      t.appendChild(s);
    }
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2300);
  }

  /* ---------- 數字滾動 ---------- */
  let rollRaf = 0;
  function rollTo(target, ms) {
    cancelAnimationFrame(rollRaf);
    const from = shown;
    if (from === target) { balNum.textContent = String(target); return; }
    const t0 = performance.now();
    const dur = ms || Math.min(1400, 400 + Math.abs(target - from) * 12);
    let lastTick = from;
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (target - from) * e);
      balNum.textContent = String(v);
      if (target > from && v - lastTick >= Math.max(1, Math.round((target - from) / 8))) {
        lastTick = v;
        play("tick");
      }
      if (k < 1) rollRaf = requestAnimationFrame(step);
      else shown = target;
    }
    shown = from;
    rollRaf = requestAnimationFrame(step);
    retrigger(balanceEl, target > from ? "pop" : "drop");
    setTimeout(function () { shown = target; }, dur + 20);
  }

  /* ---------- 彩帶粒子 ---------- */
  const ctx = fx.getContext("2d");
  let dpr = 1;
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let parts = [];
  let fxRaf = 0;
  function sizeFx() {
    const r = Math.min(2, window.devicePixelRatio || 1);
    fx.width = innerWidth * r;
    fx.height = innerHeight * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    dpr = r;
  }
  sizeFx();
  addEventListener("resize", sizeFx);
  const MAX_PARTS = 180;
  function confetti(x, y, n, colors) {
    if (reduced) return;
    n = Math.min(n, MAX_PARTS);
    if (parts.length + n > MAX_PARTS) parts.splice(0, parts.length + n - MAX_PARTS);
    const pal = colors || ["#ff5fa2", "#ffc23d", "#2fd3a0", "#7aa8ff", "#b48cff", "#fff"];
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
        w: 6 + Math.random() * 7, h: 4 + Math.random() * 5,
        r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: pal[i % pal.length], life: 70 + Math.random() * 40,
      });
    }
    if (!fxRaf) fxRaf = requestAnimationFrame(tickFx);
  }
  function tickFx() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < innerHeight + 40; });
    parts.forEach(function (p) {
      p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 1;
      const cs = Math.cos(p.r), sn = Math.sin(p.r);
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.setTransform(dpr * cs, dpr * sn, -dpr * sn, dpr * cs, dpr * p.x, dpr * p.y);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    fxRaf = parts.length ? requestAnimationFrame(tickFx) : 0;
  }

  /* ---------- 金幣飛進小豬 ---------- */
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function flyCoins(fromEl, count, onEach) {
    const a = center(fromEl);
    const pr = pigWrap.getBoundingClientRect();
    const b = { x: pr.left + pr.width * 0.5, y: pr.top + pr.height * 0.3 };
    const n = reduced ? 1 : Math.max(3, Math.min(8, count));
    return new Promise(function (resolve) {
      let landed = 0;
      for (let i = 0; i < n; i += 1) {
        setTimeout(function () {
          const c = document.createElement("img");
          c.src = "./icons/coin.png";
          c.className = "flycoin";
          c.alt = "";
          document.body.appendChild(c);
          const sx = a.x + (Math.random() - .5) * 120;
          const lift = 120 + Math.random() * 80;
          const anim = c.animate([
            { transform: "translate(" + (sx - 22) + "px," + (a.y - 22) + "px) scale(.6) rotate(0deg)", opacity: 0 },
            { transform: "translate(" + ((sx + b.x) / 2 - 22) + "px," + (Math.min(a.y, b.y) - lift - 22) + "px) scale(1.2) rotate(200deg)", opacity: 1, offset: .5 },
            { transform: "translate(" + (b.x - 22) + "px," + (b.y - 22) + "px) scale(.5) rotate(400deg)", opacity: 1 },
          ], { duration: 720, easing: "cubic-bezier(.5,0,.6,1)" });
          anim.onfinish = function () {
            c.remove();
            landed += 1;
            play("coin");
            buzz(12);
            retrigger(pig, "eat");
            if (onEach) onEach(landed, n);
            if (landed === n) resolve();
          };
        }, i * 90);
      }
    });
  }

  /* ---------- 抽屜 ---------- */
  function openSheet(title, fill, onClose) {
    closeSheet(true);
    const mask = document.createElement("div");
    mask.className = "mask";
    mask.id = "sheet-mask";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.innerHTML = '<div class="grip"></div><div class="sheet-head"><h2></h2><button type="button" class="x" aria-label="關閉">×</button></div><div class="sheet-body"></div>';
    sheet.querySelector("h2").textContent = title;
    mask.appendChild(sheet);
    document.body.appendChild(mask);
    mask._onClose = onClose;
    sheet.querySelector(".x").addEventListener("click", function () { closeSheet(); });
    lastRun.open = performance.now();
    let down = false;
    mask.addEventListener("pointerdown", function (e) { down = e.target === mask; });
    mask.addEventListener("pointerup", function (e) { if (down && e.target === mask) closeSheet(); down = false; });
    // 往下滑關閉
    let y0 = null;
    sheet.addEventListener("touchstart", function (e) { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchmove", function (e) {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", function (e) {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      y0 = null;
      sheet.style.transition = "transform .25s ease";
      if (dy > 110) closeSheet();
      else sheet.style.transform = "";
      setTimeout(function () { sheet.style.transition = ""; }, 260);
    });
    fill(sheet.querySelector(".sheet-body"), sheet);
    return sheet;
  }
  function setSheetTitle(t) {
    const h = document.querySelector("#sheet-mask h2");
    if (h) h.textContent = t;
  }
  function closeSheet(now) {
    const mask = $("sheet-mask");
    if (!mask) return;
    mask.id = "";
    const cb = mask._onClose;
    if (cb) cb();
    if (now) { mask.remove(); return; }
    mask.classList.add("closing");
    setTimeout(function () { mask.remove(); }, 220);
  }

  /* ---------- 數字鍵 ---------- */
  function numPad(host, opts) {
    const pad = document.createElement("div");
    pad.className = "pad";
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", opts.left || "", "0", "del"];
    keys.forEach(function (k) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "key" + (k === "del" || k === "C" ? " fn" : "");
      if (!k) { b.style.visibility = "hidden"; pad.appendChild(b); return; }
      b.textContent = k === "del" ? "⌫" : k;
      if (k === "del") b.setAttribute("aria-label", "刪除");
      b.addEventListener("click", function () {
        buzz(6);
        if (k === "del") opts.onDel();
        else if (k === "C") opts.onClear();
        else opts.onDigit(k);
      });
      pad.appendChild(b);
    });
    host.appendChild(pad);
    return pad;
  }
  function pinPad(host, onFull) {
    const dots = document.createElement("div");
    dots.className = "pin-dots";
    for (let i = 0; i < 6; i += 1) dots.appendChild(document.createElement("i"));
    const hint = document.createElement("p");
    hint.className = "hint";
    host.appendChild(dots);
    host.appendChild(hint);
    let v = "";
    function paint() {
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle("on", i < v.length); });
    }
    function reset(msg) {
      v = "";
      paint();
      if (msg) {
        hint.textContent = msg;
        hint.classList.add("bad");
        retrigger(dots, "bad");
        buzz([30, 40, 30]);
      }
    }
    numPad(host, {
      onDigit: function (d) {
        if (v.length >= 6) return;
        v += d;
        paint();
        hint.classList.remove("bad");
        hint.textContent = "";
        if (v.length === 6) setTimeout(function () { onFull(v, reset); }, 120);
      },
      onDel: function () { v = v.slice(0, -1); paint(); },
    });
    return { hint: hint };
  }

  /* ---------- 狀態 ---------- */
  function queue() {
    if (!snapshot) return [];
    const g = snapshot.pending_grants || [];
    return g.filter(function (x) { return x.is_bonus; })
      .concat(g.filter(function (x) { return !x.is_bonus; }))
      .concat(snapshot.claimable_periods || []);
  }
  function paintClaim() {
    const q = queue();
    const first = q[0];
    if (!first) {
      claimBtn.hidden = true;
      waitCard.hidden = false;
      startClock();
      return;
    }
    stopClock();
    waitCard.hidden = true;
    claimBtn.hidden = false;
    const bonus = !!first.is_bonus;
    claimBtn.classList.toggle("bonus", bonus);
    claimText.textContent = bonus
      ? "打開 " + first.amount + " 元獎金"
      : "領取 " + first.amount + " 元";
    claimCount.hidden = q.length < 2;
    claimCount.textContent = String(q.length);
    claimBtn.querySelector("img").src = bonus ? "./icons/coin.png" : "./icons/coin.png";
    claimBtn.dataset.icon = bonus ? "gift" : "coin";
  }
  function startClock() {
    stopClock();
    if (!snapshot || !snapshot.next_allowance_at) { waitClock.textContent = "--:--:--"; return; }
    const serverNow = Date.parse(snapshot.now);
    const next = Date.parse(snapshot.next_allowance_at);
    const origin = Date.now();
    function tick() {
      let left = Math.max(0, next - (serverNow + Date.now() - origin));
      if (left <= 0) { stopClock(); load(); return; }
      left = Math.floor(left / 1000);
      const h = Math.floor(left / 3600), m = Math.floor(left / 60) % 60, s = left % 60;
      waitClock.textContent = [h, m, s].map(function (n) { return String(n).padStart(2, "0"); }).join(":");
    }
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = 0; }

  async function load() {
    const x = await api("/api/state", { timeout: 15000 });
    if (!x.res || !x.res.ok || !x.j) return null;
    snapshot = x.j;
    $("who").textContent = snapshot.display_name || "";
    paintCover();
    paintClaim();
    return snapshot;
  }
  function paintCover() {
    const img = $("face");
    if (!snapshot || !snapshot.has_cover || !window.PiggyLocal || !window.PiggyLocal.portraitUrl) return;
    window.PiggyLocal.portraitUrl("cover", key).then(function (url) { if (url) img.src = url; }).catch(function () {});
  }

  /* ---------- 領錢 ---------- */
  async function claim() {
    if (claiming) return;
    const next = queue()[0];
    if (!next) return;
    claiming = true;
    buzz(15);
    const body = next.id ? { grant_id: next.id } : { period_key: next.period_key };
    const req = post("/api/claim", body);
    const flight = flyCoins(claimBtn, Math.ceil(next.amount / 5));
    try {
      const [x] = await Promise.all([req, flight]);
      if (!x.res || !x.res.ok) {
        retrigger(pig, "sad");
        toast("哎呀", msgOf(x, "等一下再試"));
        await load();
        rollTo(snapshot ? snapshot.total : shown);
        return;
      }
      await load();
      rollTo(snapshot.total);
      retrigger(pig, "jiggle");
      const c = center(pigWrap);
      confetti(c.x, c.y - 40, next.is_bonus ? 140 : 70);
      say(SAY_HAPPY);
      toast("+" + next.amount + " 元", next.is_bonus ? (next.note || "特別獎金") : "存進小豬了！");
    } finally {
      claiming = false;
    }
  }

  /* ---------- 消費 ---------- */
  function openSpend() {
    if (!snapshot) return;
    let digits = "";
    let token = "";
    let settled = false;
    let poll = 0;
    const total = snapshot.total || 0;
    openSheet("要花多少？", function (body) {
      const amt = document.createElement("p");
      amt.className = "amount";
      amt.innerHTML = '<span>0</span><small>元</small>';
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "小豬裡有 " + total + " 元";
      body.appendChild(amt);
      body.appendChild(hint);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "go";
      go.textContent = "請爸媽確認";
      go.disabled = true;
      function paint() {
        const n = Number(digits) || 0;
        amt.firstChild.textContent = String(n);
        const over = n > total;
        if (over) {
          if (!amt.classList.contains("over")) buzz([20, 30, 20]);
          retrigger(amt, "over");
        } else amt.classList.remove("over");
        hint.textContent = over ? "小豬裡只有 " + total + " 元喔" : "小豬裡有 " + total + " 元";
        hint.classList.toggle("bad", over);
        go.disabled = n < 1 || over;
      }
      numPad(body, {
        left: "C",
        onDigit: function (d) {
          if (digits.length >= 6) return;
          digits = (digits === "0" ? "" : digits) + d;
          paint();
        },
        onDel: function () { digits = digits.slice(0, -1); paint(); },
        onClear: function () { digits = ""; paint(); },
      });
      body.appendChild(go);
      go.addEventListener("click", async function () {
        if (go.disabled || busy) return;
        busy = true;
        go.disabled = true;
        go.textContent = "準備中…";
        const n = Number(digits);
        try {
          const x = await post("/api/exchange/reserve", { amount: n, child_note: "消費", pig_ids: snapshot.active_pig && snapshot.active_pig.id ? [snapshot.active_pig.id] : [] });
          if (!x.res || !x.res.ok || !x.j) {
            hint.textContent = msgOf(x, "還不能消費，等一下再試");
            hint.classList.add("bad");
            go.textContent = "請爸媽確認";
            go.disabled = false;
            return;
          }
          if (!$("sheet-mask")) {
            post("/api/exchange/cancel", { x: x.j.token });
            return;
          }
          token = x.j.token;
          showQr(body, x.j, n);
        } finally {
          busy = false;
        }
      });
    }, function () {
      if (poll) clearInterval(poll);
      poll = 0;
      if (token && !settled) {
        const t = token;
        token = "";
        post("/api/exchange/cancel", { x: t }).then(function () { load(); });
      }
    });

    function showQr(body, res, n) {
      setSheetTitle("給爸媽掃一下");
      body.innerHTML = "";
      const box = document.createElement("div");
      box.className = "qr-box";
      const img = document.createElement("img");
      img.alt = "消費 QR";
      const link = res.qr_url || ("https://weslie4436.github.io/piggybank/exchange.html?x=" + encodeURIComponent(res.token));
      const qr = window.qrcode(0, "M");
      qr.addData(link);
      qr.make();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.createSvgTag(4, 0));
      box.appendChild(img);
      body.appendChild(box);
      const a = document.createElement("p");
      a.className = "qr-amt";
      a.textContent = n + " 元";
      body.appendChild(a);
      const w = document.createElement("p");
      w.className = "qr-wait";
      w.innerHTML = '等爸媽同意 <span class="dots3"><i></i><i></i><i></i></span>';
      body.appendChild(w);
      const note = document.createElement("p");
      note.className = "qr-note";
      note.textContent = "還沒扣錢，關掉就取消";
      body.appendChild(note);
      poll = setInterval(async function () {
        const x = await api("/api/exchange/status?id=" + encodeURIComponent(res.id), { timeout: 8000 });
        if (!x.j || !x.j.status) return;
        if (x.j.status === "completed") {
          clearInterval(poll); poll = 0; settled = true; token = "";
          closeSheet();
          await load();
          rollTo(snapshot.total);
          retrigger(pig, "jiggle");
          confetti(innerWidth / 2, innerHeight * .35, 120);
          play("coin");
          buzz([20, 40, 60]);
          toast("買到了！", "花了 " + n + " 元，還有 " + snapshot.total + " 元");
          say(null, "要好好珍惜喔");
        } else if (x.j.status === "cancelled" || x.j.status === "expired") {
          clearInterval(poll); poll = 0; settled = true; token = "";
          closeSheet();
          await load();
          toast(x.j.status === "expired" ? "等太久了" : "取消了", "錢還在小豬裡");
        }
      }, 1600);
    }
  }

  /* ---------- 紀錄 ---------- */
  async function openLedger() {
    openSheet("存錢紀錄", function (body) {
      body.innerHTML = '<p class="empty">讀取中…</p>';
      api("/api/ledger?limit=50", { timeout: 15000 }).then(function (x) {
        const rows = (x && x.j) || [];
        body.innerHTML = "";
        if (!rows.length) { body.innerHTML = '<p class="empty">還沒有紀錄</p>'; return; }
        const list = document.createElement("div");
        list.className = "rows";
        rows.forEach(function (r, i) {
          const out = r.amount < 0;
          const bonus = r.kind === "bonus_claim" || r.kind === "adventure_reward";
          const row = document.createElement("div");
          row.className = "row";
          row.style.animationDelay = Math.min(i, 12) * 35 + "ms";
          const ic = document.createElement("span");
          ic.className = "ic " + (out ? "out" : bonus ? "bonus" : "in");
          ic.textContent = out ? "🛍️" : bonus ? "🎁" : "🪙";
          const tx = document.createElement("div");
          tx.className = "tx";
          const b = document.createElement("b");
          b.textContent = r.note || (out ? "消費" : "零用錢");
          const s = document.createElement("small");
          const d = new Date(r.created_at);
          s.textContent = isNaN(d) ? "" : d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + (typeof r.balance_after === "number" ? " · 餘 " + r.balance_after : "");
          tx.appendChild(b); tx.appendChild(s);
          const amt = document.createElement("span");
          amt.className = "amt " + (out ? "minus" : "plus");
          amt.textContent = (out ? "−" : "+") + Math.abs(r.amount);
          row.appendChild(ic); row.appendChild(tx); row.appendChild(amt);
          list.appendChild(row);
        });
        body.appendChild(list);
      });
    });
  }

  /* ---------- 家長 ---------- */
  function openParent() {
    if (parentPin) { parentMenu(); return; }
    openSheet("家長密碼", function (body) {
      const p = pinPad(body, async function (v, reset) {
        p.hint.textContent = "確認中…";
        const x = await post("/api/settings/read", { pin: v });
        if (!x.res || !x.res.ok) { reset(msgOf(x, "密碼不對")); return; }
        parentPin = v;
        parentRule = x.j && x.j.allowance_rule;
        parentMenu();
      });
    });
  }
  let parentRule = null;
  function parentMenu() {
    openSheet("家長", function (body) {
      const m = document.createElement("div");
      m.className = "menu";
      m.appendChild(item("🎁", "發額外獎金", "孩子打開時會有特別慶祝", openGrant));
      m.appendChild(item("🪙", "每天零用錢", "目前每天 " + ((parentRule && parentRule.amount) || 30) + " 元", openAllowance));
      body.appendChild(m);
    });
    function item(ic, t, s, fn) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item";
      b.innerHTML = '<span class="ic"></span><span><span class="t"></span><small></small></span>';
      b.querySelector(".ic").textContent = ic;
      b.querySelector(".t").textContent = t;
      b.querySelector("small").textContent = s;
      b.addEventListener("click", fn);
      return b;
    }
  }
  function amountForm(title, btnText, initial, withNote, submit) {
    openSheet(title, function (body) {
      let digits = initial ? String(initial) : "";
      const amt = document.createElement("p");
      amt.className = "amount";
      amt.innerHTML = '<span>0</span><small>元</small>';
      body.appendChild(amt);
      const chips = document.createElement("div");
      chips.className = "chips";
      [10, 30, 50, 100].forEach(function (v) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "chip";
        c.textContent = "+" + v;
        c.addEventListener("click", function () { digits = String((Number(digits) || 0) + v); paint(); buzz(6); });
        chips.appendChild(c);
      });
      body.appendChild(chips);
      let note = null;
      if (withNote) {
        const f = document.createElement("label");
        f.className = "field";
        f.innerHTML = "<span>為什麼得到獎金？</span>";
        note = document.createElement("input");
        note.maxLength = 80;
        note.placeholder = "例如：幫忙洗碗";
        f.appendChild(note);
        body.appendChild(f);
      }
      const hint = document.createElement("p");
      hint.className = "hint";
      body.appendChild(hint);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "go mint";
      go.textContent = btnText;
      function paint() {
        amt.firstChild.textContent = String(Number(digits) || 0);
        go.disabled = !(Number(digits) >= 1);
      }
      numPad(body, {
        left: "C",
        onDigit: function (d) { if (digits.length < 6) { digits = (digits === "0" ? "" : digits) + d; paint(); } },
        onDel: function () { digits = digits.slice(0, -1); paint(); },
        onClear: function () { digits = ""; paint(); },
      });
      body.appendChild(go);
      paint();
      go.addEventListener("click", async function () {
        if (go.disabled || busy) return;
        busy = true;
        go.disabled = true;
        const label = go.textContent;
        go.textContent = "處理中…";
        try {
          const x = await submit(Number(digits), note ? note.value.trim() : "");
          if (!x.res || !x.res.ok) {
            if (x.j && x.j.error === "bad_pin") { parentPin = ""; openParent(); return; }
            hint.textContent = msgOf(x, "請再試一次");
            hint.classList.add("bad");
            return;
          }
          closeSheet();
          await load();
        } finally {
          busy = false;
          go.textContent = label;
          paint();
        }
      });
    });
  }
  function openGrant() {
    amountForm("發額外獎金", "送出獎金", "", true, async function (n, note) {
      const x = await post("/api/grant", { pin: parentPin, amount: n, note: note || "特別獎金", is_bonus: true });
      if (x.res && x.res.ok) setTimeout(function () { toast("獎金送出了", "等孩子來打開 🎁"); }, 250);
      return x;
    });
  }
  function openAllowance() {
    amountForm("每天零用錢", "儲存", (parentRule && parentRule.amount) || 30, false, async function (n) {
      const x = await post("/api/settings/allowance", { pin: parentPin, amount: n, period: "daily" }, "PUT");
      if (x.res && x.res.ok) {
        parentRule = Object.assign({}, parentRule || {}, { amount: n });
        setTimeout(function () { toast("改好了", "從今天起每天 " + n + " 元"); }, 250);
      }
      return x;
    });
  }

  /* ---------- 小豬互動 ---------- */
  let pokeAt = 0;
  pig.addEventListener("click", function () {
    if (!cool("poke", 350)) return;
    retrigger(pig, "jiggle");
    buzz(10);
    play("tick");
    if (Date.now() - pokeAt > 1500) say(SAY_POKE);
    pokeAt = Date.now();
    if (cool("pokeFx", 700)) {
      const c = center(pigWrap);
      confetti(c.x, c.y, 8, ["#ff9ac6", "#ffd1e5", "#fff"]);
    }
  });
  function guardOpen(fn) {
    return function () {
      if ($("sheet-mask") || claiming || !cool("open", 500)) return;
      buzz(10);
      fn();
    };
  }
  claimBtn.addEventListener("click", function () { if (!$("sheet-mask")) claim(); });
  $("spend").addEventListener("click", guardOpen(openSpend));
  $("ledger-btn").addEventListener("click", guardOpen(openLedger));
  $("parent-btn").addEventListener("click", guardOpen(openParent));
  balanceEl.addEventListener("click", guardOpen(openSpend));

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && key && !$("sheet-mask")) {
      load().then(function (s) { if (s) rollTo(s.total); });
    }
  });

  /* ---------- 開機 ---------- */
  async function boot() {
    const status = $("boot-text");
    if (window.FamiGate) { window.FamiGate.blockWebChrome(); window.FamiGate.bindKeyboard && window.FamiGate.bindKeyboard(); }
    key = window.PIGGY_VIEW_KEY || (window.FamiGate && window.FamiGate.currentKey()) || "";
    if (!key) { status.textContent = "請用邀請連結打開"; return; }
    try {
      let x = await window.FamiGate.api("/api/door", key, { timeout: 20000 });
      let stored = "";
      try { stored = localStorage.getItem("piggybank.viewKey") || ""; } catch (e) {}
      if (stored && stored !== key && window.FamiGate.KEY_RE.test(stored) && !(x.j && x.j.kind === "personal")) {
        const retry = await window.FamiGate.api("/api/door", stored, { timeout: 20000 });
        if (retry.j && retry.j.kind === "personal") { key = stored; x = retry; }
      }
      if (!x.res || !x.res.ok || !x.j) { status.textContent = msgOf(x, "連不上小豬銀行，等一下再試"); return; }
      if (x.j.kind === "invite") {
        location.replace("./hey.html?k=" + encodeURIComponent(key) + "#k=" + encodeURIComponent(key));
        return;
      }
      window.FamiGate.savePersonal(key);
      window.FamiGate.pinKey(key);
      const s = await load();
      if (!s) { status.textContent = "連不上小豬銀行，等一下再試"; return; }
      $("boot").hidden = true;
      $("app").hidden = false;
      shown = 0;
      rollTo(s.total, 900);
      setTimeout(function () { retrigger(pig, "jiggle"); say(null, "嗨，" + (s.display_name || "") + "！"); }, 300);
    } catch (e) {
      status.textContent = "連不上小豬銀行，等一下再試";
    }
  }
  boot();
})();
