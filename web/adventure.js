(function () {
  const screen = document.getElementById("adventure-screen");
  const open = document.getElementById("adventure-open");
  const close = document.getElementById("adventure-close");
  const enemyArea = document.getElementById("enemy-area");
  const handArea = document.getElementById("hand-area");
  const banner = document.getElementById("battle-banner");
  const soundButton = document.getElementById("adventure-sound");
  let state = null;
  let sending = false;
  let soundOn = true;
  let audio = null;
  let drag = null;

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
      tones.forEach(function (tone, i) {
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

  function layoutBoard() {
    document.documentElement.classList.toggle("battle-portrait", isPortrait());
    const cards = Array.prototype.slice.call(handArea.querySelectorAll(".answer-card"));
    const n = cards.length;
    if (!n) return;
    const portrait = isPortrait();
    const area = handArea.getBoundingClientRect();
    const cardW = portrait ? 72 : 96;
    const cardH = portrait ? 102 : 128;
    const spread = Math.min(portrait ? area.width * 0.86 : area.width * 0.72, Math.max(0, n - 1) * (cardW - (portrait ? 28 : 18)));
    const maxAngle = (portrait ? 10 : 16) * Math.min(1, n / 5);
    cards.forEach(function (card, i) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const normalized = t * 2 - 1;
      const x = area.width / 2 + normalized * (spread / 2);
      const arc = (portrait ? 18 : 28) * (1 - normalized * normalized);
      const tilt = normalized * maxAngle;
      card.style.width = cardW + "px";
      card.style.height = cardH + "px";
      card.style.left = (x - cardW / 2) + "px";
      card.style.bottom = (12 + arc) + "px";
      card.style.transform = "rotate(" + tilt + "deg)";
      card.style.zIndex = String(10 + i);
      card.dataset.rest = JSON.stringify({
        left: card.style.left,
        bottom: card.style.bottom,
        transform: card.style.transform,
        z: card.style.zIndex,
      });
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
      const prompt = document.createElement("strong");
      prompt.className = "enemy-prompt";
      prompt.textContent = monster.prompt;
      const bar = document.createElement("div");
      bar.className = "enemy-hp";
      bar.style.setProperty("--hp", String(monster.hp / monster.hp_max));
      const label = document.createElement("span");
      label.textContent = monster.hp + " / " + monster.hp_max;
      bar.appendChild(label);
      unit.append(body, prompt, bar);
      enemyArea.appendChild(unit);
    });
  }

  function restoreCard(card) {
    const rest = JSON.parse(card.dataset.rest || "{}");
    card.classList.remove("is-dragging");
    card.style.position = "";
    card.style.left = rest.left || "";
    card.style.top = "";
    card.style.bottom = rest.bottom || "";
    card.style.transform = rest.transform || "";
    card.style.zIndex = rest.z || "";
    card.style.width = "";
    card.style.height = "";
  }

  function renderHand() {
    handArea.innerHTML = "";
    (state.hand || []).forEach(function (value) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "answer-card";
      card.textContent = String(value);
      card.dataset.value = String(value);
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

  function onCardDown(event) {
    if (sending || !state || state.game_over || state.completed) return;
    const card = event.currentTarget;
    card.setPointerCapture(event.pointerId);
    const box = card.getBoundingClientRect();
    drag = {
      card: card,
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      width: box.width,
      height: box.height,
    };
    card.classList.add("is-dragging");
    card.style.position = "fixed";
    card.style.bottom = "auto";
    card.style.zIndex = "80";
    card.style.width = box.width + "px";
    card.style.height = box.height + "px";
    moveDrag(event);
    card.addEventListener("pointermove", onCardMove);
    card.addEventListener("pointerup", onCardUp);
    card.addEventListener("pointercancel", onCardUp);
  }

  function moveDrag(event) {
    if (!drag) return;
    drag.card.style.left = (event.clientX - drag.dx) + "px";
    drag.card.style.top = (event.clientY - drag.dy) + "px";
    const over = hitMonster(event.clientX, event.clientY);
    enemyArea.querySelectorAll(".enemy-unit").forEach(function (unit) {
      unit.classList.toggle("is-target", unit === over);
    });
  }

  function onCardMove(event) {
    moveDrag(event);
  }

  async function onCardUp(event) {
    const card = drag && drag.card;
    const value = card && Number(card.dataset.value);
    const target = hitMonster(event.clientX, event.clientY);
    if (card) {
      card.removeEventListener("pointermove", onCardMove);
      card.removeEventListener("pointerup", onCardUp);
      card.removeEventListener("pointercancel", onCardUp);
    }
    enemyArea.querySelectorAll(".enemy-unit").forEach(function (unit) {
      unit.classList.remove("is-target");
    });
    drag = null;
    if (!card || !target) {
      if (card) restoreCard(card);
      layoutBoard();
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
        restoreCard(card);
        document.getElementById("player-hp").classList.remove("is-hit");
        void document.getElementById("player-hp").offsetWidth;
        document.getElementById("player-hp").classList.add("is-hit");
        state = await api("/api/adventure");
        draw();
        if (outcome.game_over || state.game_over) {
          showBanner("先回銀行休息", "沒有扣你已經存的錢。待領的金幣也還在，等一下再進森林。", false);
        }
        return;
      }
      cue(outcome.defeated ? "boss" : "correct");
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
      restoreCard(card);
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
      showBanner("今天的探險完成！", "回銀行，點對話框把金幣領進撲滿。", true);
      return;
    }
    if (state.game_over) {
      renderMonsters();
      handArea.innerHTML = "";
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
    try {
      state = await api("/api/adventure/enter", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      draw();
    } catch (_) {
      showBanner("森林地圖暫時連不上", "再試一次連線；進度會保留。", false);
    }
  }

  open.addEventListener("click", launch);
  close.addEventListener("click", function () {
    screen.hidden = true;
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
