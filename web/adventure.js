(function () {
  const screen = document.getElementById("adventure-screen");
  const open = document.getElementById("adventure-open");
  const close = document.getElementById("adventure-close");
  const map = document.getElementById("adventure-map");
  const question = document.getElementById("adventure-question");
  const result = document.getElementById("adventure-result");
  const speech = document.getElementById("adventure-speech");
  const progress = document.getElementById("adventure-progress");
  const fill = document.getElementById("adventure-progress-fill");
  const collection = document.getElementById("adventure-collection");
  const soundButton = document.getElementById("adventure-sound");
  const poiNames = ["樹根空地", "石門洞窟", "莓果小徑", "月亮池", "樹冠高台"];
  const badgeNames = { "forest-1": "苔森林徽章", "forest-2": "月光池徽章" };
  let state = null;
  let selectedPoi = -1;
  let currentQuestion = null;
  let sending = false;
  let soundOn = true;
  let audio = null;

  async function api(path, options) {
    const key = window.PIGGY_VIEW_KEY || "";
    const result = await window.FamiGate.api(path, key, options || {});
    if (!result.res || !result.res.ok) {
      const err = new Error(result.j && result.j.message || "小豬暫時連不上冒險地圖");
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
      const tones = kind === "find" ? [[523, 0], [659, .1], [784, .2], [1046, .34]]
        : kind === "correct" ? [[523, 0], [659, .1], [784, .2]]
          : kind === "boss" ? [[392, 0], [494, .12], [587, .24], [784, .4]]
            : [[240, 0], [210, .12]];
      const now = audio.currentTime;
      tones.forEach(function (tone, i) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const start = now + tone[1];
        osc.type = i === 0 && kind === "wrong" ? "sine" : "triangle";
        osc.frequency.setValueAtTime(tone[0], start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === "wrong" ? .035 : .055, start + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, start + (kind === "wrong" ? .15 : .23));
        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(start + .25);
      });
    } catch (_) { /* Sound is optional; the game remains usable without it. */ }
  }

  function drawState() {
    if (!state) return;
    const count = state.correct_count || 0;
    const health = document.getElementById("adventure-creature-health");
    const healthText = document.getElementById("adventure-creature-hp");
    const creature = document.querySelector(".adventure-creature");
    const remaining = Math.max(0, 5 - count);
    health.style.width = (remaining * 20) + "%";
    healthText.textContent = remaining + " / 5";
    creature.classList.toggle("is-defeated", remaining === 0);
    progress.textContent = (state.questions_revealed || 0) + " / 10 題";
    fill.style.width = Math.min(100, (state.questions_revealed || 0) * 10) + "%";
    document.getElementById("adventure-badge-total").textContent = "徽章碎片 " +
      Object.values(state.badges || {}).reduce(function (sum, pair) { return sum + pair.left + pair.right; }, 0);
    map.querySelectorAll(".adventure-poi").forEach(function (button, i) {
      const poi = state.pois[i];
      button.classList.toggle("is-selected", selectedPoi === i);
      button.classList.toggle("is-cleared", !!(poi && poi.cleared));
      button.setAttribute("aria-label", poiNames[i] + (poi && poi.cleared ? "，已找到徽章碎片" : "，探索地點"));
    });
    collection.innerHTML = "";
    Object.keys(badgeNames).forEach(function (id) {
      const pair = (state.badges && state.badges[id]) || { left: 0, right: 0 };
      const complete = Math.min(pair.left, pair.right);
      const card = document.createElement("div");
      card.className = "adventure-badge" + (complete ? " is-complete" : "");
      const mark = document.createElement("span"); mark.className = "adventure-badge-mark";
      const label = document.createElement("span");
      label.textContent = badgeNames[id] + " " + complete + " 對 · 碎片 " + pair.left + "/" + pair.right;
      card.append(mark, label); collection.appendChild(card);
    });
    if (count >= 5 && state.reward_ready && !state.reward_claimed) showReward();
  }

  function showPrompt(title, message, kicker) {
    result.hidden = true;
    question.hidden = false;
    question.innerHTML = "";
    const small = document.createElement("p"); small.className = "adventure-question-kicker"; small.textContent = kicker || "冒險隊長";
    const heading = document.createElement("h2"); heading.textContent = title;
    const copy = document.createElement("p"); copy.textContent = message;
    question.append(small, heading, copy);
  }

  function showReward() {
    result.hidden = false;
    result.innerHTML = "";
    const heading = document.createElement("h2"); heading.textContent = "頭目打倒了！";
    const text = document.createElement("p"); text.textContent = "今天的冒險獎勵已放進寶箱。";
    const button = document.createElement("button"); button.type = "button"; button.textContent = "領取 5 元獎勵";
    let returnToBank = false;
    button.addEventListener("click", async function () {
      if (returnToBank) { close.click(); return; }
      button.disabled = true;
      try {
        await api("/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_id: state.reward_grant_id }) });
        state.reward_claimed = true;
        cue("boss");
        result.innerHTML = "";
        const done = document.createElement("h2"); done.textContent = "5 元存進撲滿了！";
        const note = document.createElement("p"); note.textContent = "徽章和今天的探索進度也都留下來了。";
        result.append(done, note);
        if (window.dispatchEvent) window.dispatchEvent(new Event("piggy:adventure-reward"));
      } catch (error) {
        button.disabled = false;
        const note = document.createElement("p");
        note.textContent = error.code === "bonus_waiting"
          ? "銀行裡還有較早領到的獎金，先回銀行領取後，再回來收下這筆冒險獎勵。"
          : error.message;
        result.appendChild(note);
        if (error.code === "bonus_waiting") {
          returnToBank = true;
          button.textContent = "先回銀行領獎";
        }
      }
    });
    result.append(heading, text, button);
  }

  async function loadQuestion(poiNo, slot) {
    selectedPoi = poiNo;
    drawState();
    speech.textContent = poiNames[poiNo] + "裡傳來一陣窸窣聲……";
    try {
      currentQuestion = await api("/api/adventure/question?poi=" + poiNo + "&slot=" + slot);
      state = await api("/api/adventure");
      drawState();
      renderQuestion(currentQuestion);
    } catch (error) {
      showPrompt("這個地方先休息一下", error.message, "森林小提醒");
    }
  }

  function renderQuestion(item) {
    question.hidden = false;
    result.hidden = true;
    question.innerHTML = "";
    const kicker = document.createElement("p"); kicker.className = "adventure-question-kicker";
    kicker.textContent = poiNames[selectedPoi] + " · 小怪物挑戰";
    const heading = document.createElement("h2"); heading.textContent = item.prompt;
    const answers = document.createElement("div"); answers.className = "adventure-answers";
    const next = document.createElement("button"); next.type = "button"; next.className = "adventure-next";
    next.textContent = item.question_no % 2 === 0 ? "繼續探索這裡" : "回到地圖找線索";
    next.hidden = !item.solved;
    next.addEventListener("click", function () {
      if (item.question_no % 2 === 0) loadQuestion(selectedPoi, 1);
      else {
        state = null;
        refresh().then(function () { showPrompt("還有發亮的地方", "地圖上還有其他 POI，想去哪裡都可以。", "自由探索"); });
      }
    });
    item.options.forEach(function (option) {
      const button = document.createElement("button"); button.type = "button"; button.className = "adventure-answer"; button.textContent = String(option);
      button.addEventListener("click", function () { submitAnswer(button, option, item, answers, next); });
      answers.appendChild(button);
    });
    if (item.solved) answers.querySelectorAll("button").forEach(function (button) { button.disabled = true; });
    question.append(kicker, heading, answers, next);
  }

  async function submitAnswer(button, answer, item, answers, next) {
    if (sending) return;
    sending = true;
    answers.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    try {
      const outcome = await api("/api/adventure/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_no: item.question_no, answer: Number(answer) }),
      });
      if (!outcome.correct) {
        button.classList.add("is-wrong"); cue("wrong");
        speech.textContent = outcome.hint || "再想一想，慢慢來。";
        showHint(outcome.hint || "試著拆成比較簡單的小步驟，再算一次。", answers, item, next);
      } else {
        button.classList.add("is-correct"); cue(outcome.fragment ? "find" : "correct");
        const creature = document.querySelector(".adventure-creature");
        creature.classList.remove("is-hit");
        void creature.offsetWidth;
        creature.classList.add("is-hit");
        speech.textContent = outcome.fragment ? "寶箱打開了！找到一片徽章碎片！" : "答對了！苔苔怪開心地跳了一下。";
        next.hidden = false;
        if (outcome.poi_cleared) next.textContent = "地點探索完成，回地圖";
        state = await api("/api/adventure"); drawState();
        if (outcome.reward_new) cue("boss");
      }
    } catch (error) {
      speech.textContent = error.message;
      answers.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
    } finally { sending = false; }
  }

  function showHint(text, answers, item, next) {
    const existing = question.querySelector(".adventure-hint");
    if (existing) existing.remove();
    const hint = document.createElement("p"); hint.className = "adventure-hint"; hint.textContent = text;
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "adventure-next"; retry.textContent = "再試一次";
    retry.addEventListener("click", function () {
      answers.querySelectorAll("button").forEach(function (b) { b.disabled = false; b.classList.remove("is-wrong"); });
      next.hidden = true; hint.remove(); retry.remove();
    });
    question.append(hint, retry);
  }

  async function refresh() {
    state = await api("/api/adventure");
    drawState();
  }

  function launch() {
    if (!window.PIGGY_VIEW_KEY) return;
    screen.hidden = false;
    document.documentElement.classList.add("adventure-open");
    showPrompt("地圖上有好多發亮的地方", "挑一個 POI，看看小豬會發現什麼。", "冒險隊長，準備好了嗎？");
    refresh().catch(function (error) { showPrompt("地圖還在整理", error.message, "森林小提醒"); });
  }

  open.addEventListener("click", launch);
  close.addEventListener("click", function () { screen.hidden = true; document.documentElement.classList.remove("adventure-open"); });
  map.addEventListener("click", function (event) {
    const button = event.target.closest(".adventure-poi");
    if (!button || !state) return;
    const poiNo = Number(button.dataset.poi);
    const poiQuestions = state.questions.filter(function (q) { return Math.floor(q.question_no / 2) === poiNo; });
    const next = poiQuestions.find(function (q) { return !q.solved; });
    if (!next) { selectedPoi = poiNo; drawState(); showPrompt("這裡的秘密都找到了", "徽章碎片已經收進收藏冊。再去地圖上看看吧。", "探索完成"); return; }
    loadQuestion(poiNo, next.question_no % 2);
  });
  soundButton.addEventListener("click", function () {
    soundOn = !soundOn;
    soundButton.textContent = soundOn ? "♫" : "♪";
    soundButton.setAttribute("aria-label", soundOn ? "音效開啟" : "音效關閉");
    if (soundOn) cue("correct");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !screen.hidden) close.click();
  });
})();
