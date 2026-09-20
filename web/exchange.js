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
    actBody.innerHTML = "";
    const p = document.createElement("p");
    p.className = "ex-note";
    const amount = exchange && exchange.requested_amount != null ? exchange.requested_amount : "";
    const child = exchange && exchange.child_note ? exchange.child_note : "";
    p.textContent = "兌換 " + amount + " 元" + (child ? " · " + child : "");
    const label = document.createElement("label");
    label.textContent = "家長備註";
    label.setAttribute("for", "parent-note");
    const input = document.createElement("input");
    input.id = "parent-note";
    input.maxLength = 80;
    input.placeholder = "備註";
    const err = document.createElement("p");
    err.className = "err";
    err.id = "exErr";
    actBody.appendChild(p);
    actBody.appendChild(err);
    actBody.appendChild(label);
    actBody.appendChild(input);
    if (actMask) actMask.hidden = false;
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
    if (statusEl) statusEl.textContent = exchange.child_note || "父母核准";
  }

  async function approve() {
    if (busy) return;
    const noteEl = document.getElementById("parent-note");
    const err = document.getElementById("exErr");
    const note = ((noteEl && noteEl.value) || "").trim();
    if (!note) {
      if (err) err.textContent = "請填備註";
      return;
    }
    if (typed.length !== NEED) {
      if (err) err.textContent = "請輸入六位數 PIN";
      return;
    }
    busy = true;
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
        if (err) err.textContent = (x.j && x.j.message) || "請再試一次";
        if (statusEl) statusEl.textContent = (x.j && x.j.message) || "PIN 不對";
        busy = false;
        return;
      }
      if (actMask) actMask.hidden = true;
      if (statusEl) statusEl.textContent = "已核准，找零 " + (x.j.change != null ? x.j.change : x.j.change_amount || 0) + " 元";
      if (hey) hey.textContent = "完成";
      if (padEl) padEl.classList.add("is-off");
    } catch (e) {
      stopWait();
      if (err) err.textContent = "家裡還沒開";
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
