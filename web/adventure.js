(function () {
  const screen = document.getElementById("adventure-screen");
  const open = document.getElementById("adventure-open");
  const close = document.getElementById("adventure-close");
  const enemyArea = document.getElementById("enemy-area");
  const handArea = document.getElementById("hand-area");
  const banner = document.getElementById("battle-banner");
  const soundButton = document.getElementById("adventure-sound");
  const arrowSvg = document.getElementById("target-arrow");
  const arrowPath = document.getElementById("target-arrow-path");
  const arrowHead = document.getElementById("target-arrow-head");
  // CardGame BattleConfig @ 177ef059 (HandFanLayout / CardView)
  const CARD_HOVER_SCALE = 1.25;
  const CARD_DRAG_SCALE = 1.0;
  const HAND_HOVER_LIFT_RATIO = 90 / 300;
  const HAND_CARD_MAX_TILT_DEG = 10;
  const HAND_FAN_ARC_RATIO = 36 / 300;
  const HAND_DRAG_THRESHOLD_PX = 6;
  const HAND_DRAG_CANCEL_MIN_SCREEN_Y_RATIO = 0.65;
  const CARD_HOVER_TWEEN_SEC = 0.12;
  const CARD_LAYOUT_TWEEN_SEC = 0.25;
  const CUBIC_OUT = "cubic-bezier(0.33, 1, 0.68, 1)";
  let state = null;
  let sending = false;
  let soundOn = true;
  let audio = null;
  let drag = null;
  let hovered = null;

  async function api(path, options) {
    const key = window.PIGGY_VIEW_KEY || "";
    const result = await window.FamiGate.api(path, key, options || {});
    if (!result.res || !result.res.ok) {
      const err = new Error(result.j && result.j.message || "小豬暫時連不上探險");
      err.code = result.j && result.j.code;
      throw err;
    }
    return result.j;
  }

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function buzz(pattern) {
    if (reduceMotion()) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) { /* desktop / iOS 可能沒有 */ }
  }

  function cue(kind) {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = audio || new Ctx();
      if (audio.state === "suspended") audio.resume();
      const tones = kind === "correct" ? [[523, 0], [659, .1], [784, .2]]
        : kind === "boss" ? [[392, 0], [494, .12], [587, .24], [784, .4]]
          : [[240, 0], [210, .12]];
      const now = audio.currentTime;
      tones.forEach(function (tone) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const start = now + tone[1];
        osc.type = "triangle";
        osc.frequency.setValueAtTime(tone[0], start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === "wrong" ? .035 : .055, start + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, start + (kind === "wrong" ? .15 : .23));
        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(start + .25);
      });
    } catch (_) { /* optional */ }
  }

  function isPortrait() {
    return window.matchMedia("(orientation: portrait)").matches;
  }

  function tweenMs(sec) {
    return reduceMotion() ? 0 : Math.round(sec * 1000);
  }

  function killAnims(el) {
    el.getAnimations().forEach(function (anim) { anim.cancel(); });
  }

  function restOf(card) {
    try {
      return JSON.parse(card.dataset.rest || "{}");
    } catch (_) {
      return {};
    }
  }

  function restTransform(rotate) {
    return "rotate(" + rotate + "deg) scale(1)";
  }

  function hoverTransform(card) {
    const rest = restOf(card);
    const lift = Number(rest.lift || 0);
    return "translateY(-" + lift + "px) rotate(0deg) scale(" + CARD_HOVER_SCALE + ")";
  }

  function applyStyle(card, next, ms) {
    const from = {
      left: card.style.left || next.left,
      bottom: card.style.bottom || next.bottom,
      transform: card.style.transform || next.transform,
    };
    killAnims(card);
    card._pose = (card._pose || 0) + 1;
    const token = card._pose;
    if (!ms) {
      card.style.left = next.left;
      card.style.bottom = next.bottom;
      card.style.transform = next.transform;
      return;
    }
    card.animate([from, next], { duration: ms, easing: CUBIC_OUT, fill: "forwards" }).addEventListener("finish", function () {
      if (card._pose !== token) return;
      card.style.left = next.left;
      card.style.bottom = next.bottom;
      card.style.transform = next.transform;
    });
  }

  function tweenToRest(card) {
    const rest = restOf(card);
    card.classList.remove("is-hover", "is-dragging");
    card.style.position = "";
    card.style.top = "";
    card.style.width = rest.width || "";
    card.style.height = rest.height || "";
    card.style.zIndex = rest.z || "";
    applyStyle(card, {
      left: rest.left || "",
      bottom: rest.bottom || "",
      transform: restTransform(rest.rotate || 0),
    }, tweenMs(CARD_LAYOUT_TWEEN_SEC));
  }

  function tweenToHover(card) {
    const rest = restOf(card);
    card.classList.add("is-hover");
    card.style.zIndex = "1000";
    applyStyle(card, {
      left: rest.left || "",
      bottom: rest.bottom || "",
      transform: hoverTransform(card),
    }, tweenMs(CARD_HOVER_TWEEN_SEC));
  }

  function layoutBoard() {
    document.documentElement.classList.toggle("battle-portrait", isPortrait());
    if (drag && drag.active) return;
    const cards = Array.prototype.slice.call(handArea.querySelectorAll(".answer-card"));
    const n = cards.length;
    if (!n) return;
    const portrait = isPortrait();
    const area = handArea.getBoundingClientRect();
    const cardW = portrait ? 72 : 96;
    const cardH = portrait ? 102 : 128;
    const minGap = cardW * (60 / 220);
    const spread = Math.min(
      portrait ? area.width * 0.86 : area.width * 0.72,
      Math.max(0, n - 1) * (cardW - minGap)
    );
    const maxAngle = HAND_CARD_MAX_TILT_DEG * Math.min(1, Math.max(0.4, n / 7));
    const arcH = HAND_FAN_ARC_RATIO * cardH;
    const lift = HAND_HOVER_LIFT_RATIO * cardH;
    cards.forEach(function (card, i) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const normalized = t * 2 - 1;
      const x = area.width / 2 + normalized * (spread / 2);
      const arc = arcH * (1 - normalized * normalized);
      const tilt = normalized * maxAngle;
      const rest = {
        left: (x - cardW / 2) + "px",
        bottom: (12 + arc) + "px",
        rotate: tilt,
        width: cardW + "px",
        height: cardH + "px",
        z: String(10 + i),
        lift: lift,
      };
      card.dataset.rest = JSON.stringify(rest);
      card.style.width = rest.width;
      card.style.height = rest.height;
      if (card === hovered) {
        card.style.left = rest.left;
        card.style.bottom = rest.bottom;
        card.style.zIndex = "1000";
        card.style.transform = hoverTransform(card);
        return;
      }
      card.style.zIndex = rest.z;
      applyStyle(card, {
        left: rest.left,
        bottom: rest.bottom,
        transform: restTransform(tilt),
      }, tweenMs(CARD_LAYOUT_TWEEN_SEC));
    });
  }

  function paintHp(current, max) {
    const wrap = document.getElementById("player-hp");
    wrap.innerHTML = "";
    wrap.setAttribute("aria-label", "生命 " + current + " / " + max);
    for (let i = 0; i < max; i += 1) {
      const pip = document.createElement("i");
      if (i < current) pip.className = "is-on";
      wrap.appendChild(pip);
    }
    wrap.classList.toggle("is-hurt", current < max && current > 0);
  }

  function showBanner(title, message, done) {
    banner.hidden = false;
    banner.innerHTML = "";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "adventure-next";
    button.textContent = "返回銀行";
    button.addEventListener("click", function () { close.click(); });
    banner.append(heading, copy, button);
    if (done) window.dispatchEvent(new Event("piggy:adventure-reward"));
  }

  function hideBanner() {
    banner.hidden = true;
    banner.innerHTML = "";
  }

  function renderMonsters() {
    enemyArea.innerHTML = "";
    (state.monsters || []).forEach(function (monster) {
      const unit = document.createElement("div");
      unit.className = "enemy-unit" + (monster.elite ? " is-elite" : "");
      unit.dataset.id = monster.id;
      const body = document.createElement("div");
      body.className = "enemy-placeholder";
      const highlight = document.createElement("span");
      highlight.className = "enemy-highlight";
      highlight.setAttribute("aria-hidden", "true");
      const prompt = document.createElement("strong");
      prompt.className = "enemy-prompt";
      prompt.textContent = monster.prompt;
      const bar = document.createElement("div");
      bar.className = "enemy-hp";
      bar.style.setProperty("--hp", String(monster.hp / monster.hp_max));
      const label = document.createElement("span");
      label.textContent = monster.hp + " / " + monster.hp_max;
      bar.appendChild(label);
      unit.append(body, highlight, prompt, bar);
      unit.addEventListener("pointerenter", function () {
        if (drag && drag.active) return;
        unit.classList.add("is-target");
      });
      unit.addEventListener("pointerleave", function () {
        if (drag && drag.active) return;
        unit.classList.remove("is-target");
      });
      enemyArea.appendChild(unit);
    });
  }

  function renderHand() {
    hovered = null;
    drag = null;
    hideArrow();
    handArea.innerHTML = "";
    (state.hand || []).forEach(function (value) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "answer-card";
      card.textContent = String(value);
      card.dataset.value = String(value);
      card.addEventListener("pointerenter", onCardEnter);
      card.addEventListener("pointerleave", onCardLeave);
      card.addEventListener("pointerdown", onCardDown);
      handArea.appendChild(card);
    });
    layoutBoard();
  }

  function hitMonster(x, y) {
    const units = enemyArea.querySelectorAll(".enemy-unit");
    for (let i = 0; i < units.length; i += 1) {
      const box = units[i].getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        return units[i];
      }
    }
    return null;
  }

  function hideArrow() {
    if (!arrowSvg) return;
    arrowSvg.classList.remove("is-on");
    arrowSvg.setAttribute("hidden", "");
    arrowPath.setAttribute("d", "");
  }

  function drawArrow(fromX, fromY, toX, toY) {
    if (!arrowSvg) return;
    const board = document.getElementById("battle-board").getBoundingClientRect();
    arrowSvg.removeAttribute("hidden");
    arrowSvg.classList.add("is-on");
    arrowSvg.setAttribute("viewBox", "0 0 " + board.width + " " + board.height);
    const x1 = fromX - board.left;
    const y1 = fromY - board.top;
    const x2 = toX - board.left;
    const y2 = toY - board.top;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25;
    arrowPath.setAttribute("d", "M " + x1 + " " + y1 + " Q " + cx + " " + cy + " " + x2 + " " + y2);
    const dx = x2 - cx;
    const dy = y2 - cy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const size = 28;
    const leftX = x2 - ux * size + px * size * 0.5;
    const leftY = y2 - uy * size + py * size * 0.5;
    const rightX = x2 - ux * size - px * size * 0.5;
    const rightY = y2 - uy * size - py * size * 0.5;
    arrowHead.setAttribute("points", x2 + "," + y2 + " " + leftX + "," + leftY + " " + rightX + "," + rightY);
  }

  function markTarget(over) {
    enemyArea.querySelectorAll(".enemy-unit").forEach(function (unit) {
      const on = unit === over;
      if (on && !unit.classList.contains("is-target")) buzz(16);
      unit.classList.toggle("is-target", on);
    });
  }

  function onCardEnter(event) {
    if (sending || (drag && drag.active)) return;
    const card = event.currentTarget;
    if (hovered && hovered !== card) {
      hovered.classList.remove("is-hover");
      tweenToRest(hovered);
    }
    hovered = card;
    tweenToHover(card);
  }

  function onCardLeave(event) {
    if (drag && drag.active) return;
    const card = event.currentTarget;
    if (hovered !== card) return;
    hovered = null;
    tweenToRest(card);
  }

  function onCardDown(event) {
    if (sending || !state || state.game_over || state.completed) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const card = event.currentTarget;
    try { card.setPointerCapture(event.pointerId); } catch (_) {}
    if (hovered !== card) {
      if (hovered) tweenToRest(hovered);
      hovered = card;
      tweenToHover(card);
    }
    drag = {
      card: card,
      id: event.pointerId,
      ox: event.clientX,
      oy: event.clientY,
      active: false,
      lastTarget: null,
    };
    card.addEventListener("pointermove", onCardMove);
    card.addEventListener("pointerup", onCardUp);
    card.addEventListener("pointercancel", onCardUp);
  }

  function beginDrag(event) {
    const card = drag.card;
    const box = card.getBoundingClientRect();
    drag.active = true;
    drag.width = box.width;
    drag.height = box.height;
    const rest = restOf(card);
    const area = handArea.getBoundingClientRect();
    drag.fromX = area.left + parseFloat(rest.left) + box.width / 2;
    drag.fromY = area.bottom - parseFloat(rest.bottom) - box.height / 2;
    card._pose = (card._pose || 0) + 1;
    killAnims(card);
    card.classList.add("is-dragging");
    card.classList.remove("is-hover");
    card.style.position = "fixed";
    card.style.bottom = "auto";
    card.style.zIndex = "2000";
    card.style.width = box.width + "px";
    card.style.height = box.height + "px";
    card.style.transform = "rotate(0deg) scale(" + CARD_DRAG_SCALE + ")";
    buzz(12);
    moveDrag(event);
  }

  function moveDrag(event) {
    if (!drag || !drag.active) return;
    const w = drag.width;
    const h = drag.height;
    drag.card.style.left = (event.clientX - w / 2) + "px";
    drag.card.style.top = (event.clientY - h / 2) + "px";
    const over = hitMonster(event.clientX, event.clientY);
    if (over !== drag.lastTarget) {
      drag.lastTarget = over;
      markTarget(over);
    }
    const originX = drag.fromX;
    const originY = drag.fromY;
    drawArrow(originX, originY, event.clientX, event.clientY);
  }

  function onCardMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.active) {
      const dist = Math.hypot(event.clientX - drag.ox, event.clientY - drag.oy);
      if (dist > HAND_DRAG_THRESHOLD_PX) beginDrag(event);
      return;
    }
    moveDrag(event);
  }

  function isCancelDrop(y) {
    const board = document.getElementById("battle-board").getBoundingClientRect();
    return (y - board.top) / board.height >= HAND_DRAG_CANCEL_MIN_SCREEN_Y_RATIO;
  }

  async function onCardUp(event) {
    const session = drag;
    const card = session && session.card;
    if (card) {
      card.removeEventListener("pointermove", onCardMove);
      card.removeEventListener("pointerup", onCardUp);
      card.removeEventListener("pointercancel", onCardUp);
    }
    hideArrow();
    enemyArea.querySelectorAll(".enemy-unit").forEach(function (unit) {
      unit.classList.remove("is-target");
    });
    drag = null;
    if (!session || !card) return;
    if (!session.active) {
      return;
    }
    const value = Number(card.dataset.value);
    const cancel = isCancelDrop(event.clientY);
    const target = cancel ? null : hitMonster(event.clientX, event.clientY);
    if (!target) {
      hovered = null;
      tweenToRest(card);
      return;
    }
    await play(target.dataset.id, value, card, target);
  }

  async function play(monsterId, answer, card, unit) {
    if (sending) return;
    sending = true;
    try {
      const outcome = await api("/api/adventure/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monster_id: monsterId, answer: answer }),
      });
      if (!outcome.correct) {
        cue("wrong");
        buzz([20, 40, 20]);
        hovered = null;
        tweenToRest(card);
        document.getElementById("player-hp").classList.remove("is-hit");
        void document.getElementById("player-hp").offsetWidth;
        document.getElementById("player-hp").classList.add("is-hit");
        state = await api("/api/adventure");
        paintHp(state.player_hp, state.player_hp_max || 5);
        if (outcome.game_over || state.game_over) {
          renderMonsters();
          handArea.innerHTML = "";
          showBanner("先回銀行休息", "沒有扣你已經存的錢。待領的金幣也還在，等一下再進森林。", false);
        }
        return;
      }
      cue(outcome.defeated ? "boss" : "correct");
      buzz(outcome.defeated ? 30 : 18);
      unit.classList.add("is-hit");
      if (outcome.defeated) {
        window.dispatchEvent(new Event("piggy:adventure-reward"));
      }
      state = await api("/api/adventure");
      draw();
      if (state.completed) {
        showBanner("今天的探險完成！", "回銀行，點對話框把金幣領進撲滿。", true);
      }
    } catch (error) {
      hovered = null;
      tweenToRest(card);
      showBanner("暫時連不上", error.message || "請再試一次。", false);
    } finally {
      sending = false;
    }
  }

  function draw() {
    if (!state) return;
    const wave = (state.current_wave || 0) + 1;
    document.getElementById("adventure-room-title").textContent = state.completed
      ? "今天打完了"
      : "第 " + wave + " / " + state.wave_count + " 波";
    document.getElementById("adventure-earned").textContent =
      (state.earned_today || 0) + " / " + (state.loot_total || 30) + " 元";
    paintHp(state.player_hp, state.player_hp_max || 5);
    if (state.completed) {
      renderMonsters();
      handArea.innerHTML = "";
      hideArrow();
      showBanner("今天的探險完成！", "回銀行，點對話框把金幣領進撲滿。", true);
      return;
    }
    if (state.game_over) {
      renderMonsters();
      handArea.innerHTML = "";
      hideArrow();
      showBanner("先回銀行休息", "沒有扣你已經存的錢。待領的金幣也還在，等一下再進森林。", false);
      return;
    }
    hideBanner();
    renderMonsters();
    renderHand();
  }

  async function launch() {
    if (!window.PIGGY_VIEW_KEY) return;
    screen.hidden = false;
    document.documentElement.classList.add("adventure-open");
    hideBanner();
    hideArrow();
    try {
      state = await api("/api/adventure/enter", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      draw();
    } catch (error) {
      showBanner("森林暫時連不上", error.message || "再試一次連線；進度會保留。", false);
    }
  }

  open.addEventListener("click", launch);
  close.addEventListener("click", function () {
    screen.hidden = true;
    hovered = null;
    drag = null;
    hideArrow();
    document.documentElement.classList.remove("adventure-open", "battle-portrait");
    window.dispatchEvent(new Event("piggy:adventure-reward"));
  });
  soundButton.addEventListener("click", function () {
    soundOn = !soundOn;
    soundButton.textContent = soundOn ? "音效 開" : "音效 關";
    soundButton.setAttribute("aria-label", soundOn ? "音效開啟" : "音效關閉");
    if (soundOn) cue("correct");
  });
  window.addEventListener("resize", layoutBoard);
  window.addEventListener("orientationchange", function () {
    window.setTimeout(layoutBoard, 80);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", layoutBoard);
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !screen.hidden) close.click();
  });
})();
