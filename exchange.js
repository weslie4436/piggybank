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

  function openNote() {
    if (!actBody) return;
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
    if (typed.length !== NEED) {
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
        body: JSON.stringify({ x: token, pin: typed, parent_note: note }),
        timeout: 20000,
      });
      if (!x.res || !x.res.ok || !x.j) {
        stopWait();
        if (dotsEl) dotsEl.classList.add("is-bad");
        window.setTimeout(function () { if (dotsEl) dotsEl.classList.remove("is-bad"); }, 400);
        typed = "";
        paintDots();
        if (statusEl) statusEl.textContent = (x.j && x.j.message) || "PIN 不對";
        busy = false;
        return;
      }
      if (statusEl) statusEl.textContent = "已核准";
      if (hey) hey.textContent = "完成";
      if (padEl) padEl.classList.add("is-off");
      if (waitEl) waitEl.hidden = true;
    } catch (e) {
      stopWait();
      if (statusEl) statusEl.textContent = "家裡還沒開";
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
        typed = typed.slice(0, -1);
        paintDots();
        return;
      }
      const num = btn.getAttribute("data-num");
      if (num == null) return;
      if (typed.length >= NEED) return;
      typed += num;
      paintDots();
      if (typed.length === NEED) openNote();
    });
  }
  if (actClose) actClose.addEventListener("click", function () {
    if (actMask) actMask.hidden = true;
  });
  if (actMask) {
    let down = false;
    actMask.addEventListener("pointerdown", function (ev) { down = ev.target === actMask; });
    actMask.addEventListener("pointerup", function (ev) {
      if (down && ev.target === actMask && actMask) actMask.hidden = true;
      down = false;
    });
  }
  if (approveBtn) approveBtn.addEventListener("click", approve);
  resolve();
})();
