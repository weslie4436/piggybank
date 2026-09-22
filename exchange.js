(function () {
  const statusEl = document.getElementById("status");
  const waitEl = document.getElementById("invite-wait");
  const safariNote = document.getElementById("invite-safari");
  const dotsEl = document.getElementById("gate-dots");
  const padEl = document.getElementById("gate-pad");
  const hey = document.getElementById("exHey");
  const actMask = document.getElementById("actMask");
  const actBody = document.getElementById("actBody");
  const actClose = document.getElementById("actClose");
  const approveBtn = document.getElementById("exApprove");
  const NEED = 6;
  let typed = "";
  let sealedPin = "";
  let busy = false;
  let exchange = null;
  let token = "";

  function paintDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = "";
    for (let i = 0; i < NEED; i += 1) {
      const span = document.createElement("span");
      if (i < typed.length) span.className = "is-on";
      dotsEl.appendChild(span);
    }
  }

  function startWait() {
    if (padEl) padEl.hidden = true;
    if (dotsEl) dotsEl.hidden = true;
    if (waitEl) waitEl.hidden = false;
  }

  function stopWait() {
    if (waitEl) waitEl.hidden = true;
    if (padEl) padEl.hidden = false;
    if (dotsEl) dotsEl.hidden = false;
  }

  function sealPad(on) {
    if (!padEl) return;
    padEl.classList.toggle("is-sealed", !!on);
  }

  function closeNote() {
    if (actMask) actMask.hidden = true;
    sealPad(false);
    sealedPin = "";
  }

  function openNote() {
    if (!actBody) return;
    sealedPin = typed;
    sealPad(true);
    const head = document.getElementById("actTitle");
    if (head) head.textContent = "說明";
    actBody.innerHTML = "";
    const err = document.createElement("p");
    err.className = "err";
    err.id = "exErr";
    const row = document.createElement("div");
    row.className = "apple-row";
    const input = document.createElement("input");
    input.id = "parent-note";
    input.maxLength = 80;
    input.setAttribute("aria-label", "說明");
    input.autocomplete = "off";
    row.appendChild(input);
    actBody.appendChild(err);
    actBody.appendChild(row);
    if (actMask) actMask.hidden = false;
    window.setTimeout(function () { input.focus(); }, 50);
  }

  async function resolve() {
    token = new URLSearchParams(location.search).get("x") || "";
    if (!token) {
      if (statusEl) statusEl.textContent = "找不到這筆兌換";
      if (padEl) padEl.classList.add("is-off");
      return;
    }
    const x = await window.FamiGate.api("/api/exchange/resolve?x=" + encodeURIComponent(token), "", { timeout: 15000 });
    if (!x.res || !x.res.ok || !x.j) {
      if (statusEl) statusEl.textContent = (x.j && x.j.message) || "找不到這筆兌換";
      if (padEl) padEl.classList.add("is-off");
      return;
    }
    exchange = x.j;
    if (hey) hey.textContent = "兌換 " + exchange.requested_amount + " 元";
    if (statusEl) statusEl.textContent = "父母核准";
  }

  async function approve() {
    if (busy) return;
    const noteEl = document.getElementById("parent-note");
    const err = document.getElementById("exErr");
    const note = ((noteEl && noteEl.value) || "").trim();
    if (!note) {
      if (err) err.textContent = "請填說明";
      return;
    }
    const pin = sealedPin || typed;
    if (pin.length !== NEED) {
      if (err) err.textContent = "請輸入六位數 PIN";
      return;
    }
    busy = true;
    if (actMask) actMask.hidden = true;
    startWait();
    try {
      const x = await window.FamiGate.api("/api/exchange/approve", "", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: token, pin: pin, parent_note: note }),
        timeout: 20000,
      });
      if (!x.res || !x.res.ok || !x.j) {
        stopWait();
        if (dotsEl) dotsEl.classList.add("is-bad");
        window.setTimeout(function () { if (dotsEl) dotsEl.classList.remove("is-bad"); }, 400);
        typed = pin;
        paintDots();
        openNote();
        const again = document.getElementById("exErr");
        const message = (x.j && x.j.message) || "PIN 不對";
        if (again) again.textContent = message;
        if (statusEl) statusEl.textContent = message;
        busy = false;
        return;
      }
      sealedPin = "";
      sealPad(false);
      if (statusEl) statusEl.textContent = "已核准";
      if (hey) hey.textContent = "完成";
      if (padEl) padEl.classList.add("is-off");
      if (waitEl) waitEl.hidden = true;
    } catch (e) {
      stopWait();
      if (statusEl) statusEl.textContent = "伺服器維修 請聯絡家長";
    } finally {
      busy = false;
    }
  }

  if (window.FamiGate) {
    window.FamiGate.blockWebChrome();
    window.FamiGate.bindKeyboard();
  }
  if (window.FamiGate && window.FamiGate.needsSafari() && safariNote) safariNote.hidden = false;
  if (window.FamiGate && window.FamiGate.lockSheetPage && actMask) window.FamiGate.lockSheetPage(actMask);

  paintDots();
  if (padEl) {
    padEl.addEventListener("click", function (ev) {
      const btn = ev.target && ev.target.closest ? ev.target.closest(".gate-key") : null;
      if (!btn || busy) return;
      if (btn.getAttribute("data-del")) {
        sealedPin = "";
        sealPad(false);
        typed = typed.slice(0, -1);
        paintDots();
        return;
      }
      const num = btn.getAttribute("data-num");
      if (num == null) return;
      if (typed.length >= NEED) return;
      sealedPin = "";
      typed += num;
      paintDots();
      if (typed.length === NEED) openNote();
    });
  }
  if (actClose) actClose.addEventListener("click", closeNote);
  if (actMask) {
    let down = false;
    actMask.addEventListener("pointerdown", function (ev) { down = ev.target === actMask; });
    actMask.addEventListener("pointerup", function (ev) {
      if (down && ev.target === actMask) closeNote();
      down = false;
    });
  }
  if (approveBtn) approveBtn.addEventListener("click", approve);
  resolve();
})();
