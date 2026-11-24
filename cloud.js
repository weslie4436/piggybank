/**
 * 小豬銀行雲端：不用帳號、不用家裡電腦。
 *
 * 1. 備份：孩子的帳本用「入口鑰匙」加密後，存到多個公開中繼站（Nostr relay）。
 *    只有拿著那把鑰匙的人解得開。Safari 被清掉後，用同一把鑰匙就能拿回來。
 * 2. 核准通道：家長手機掃 QR 後，透過中繼站把密碼與備註傳給孩子的裝置，
 *    由孩子裝置上的帳本驗證並記帳。手機本身不存任何帳。
 *
 * 簽章用 vendor/schnorr.js（@noble/curves 1.9.7，MIT）。
 */
(function (root) {
  const CFG = root.PIGGY_CLOUD || {};
  const RELAYS = CFG.relays || [];
  const D_TAG = CFG.dTag || "piggybank";
  const BACKUP_URL = CFG.backupUrl || "";
  const KIND_DOC = 30078;
  const KIND_TUNNEL = 21078;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function hex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }
  function unhex(s) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }
  function b64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function unb64(s) {
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function sha(text) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function rid() { return hex(crypto.getRandomValues(new Uint8Array(8))); }

  /* ---------- 鑰匙：全部從入口鑰匙／QR 代碼推導，不另外保存 ---------- */
  const identCache = new Map();
  function identity(purpose, secret) {
    const name = purpose + ":" + secret;
    if (!identCache.has(name)) {
      identCache.set(name, (async function () {
        const sk = await sha("piggybank/" + purpose + "/sign/v1:" + secret);
        const raw = await sha("piggybank/" + purpose + "/seal/v1:" + secret);
        const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
        return { sk: sk, pub: hex(root.PiggySchnorr.pub(sk)), aes: aes };
      })());
    }
    return identCache.get(name);
  }

  async function seal(ident, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, ident.aes, enc.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return b64(out);
  }
  async function open(ident, content) {
    try {
      const raw = unb64(content);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12) }, ident.aes, raw.subarray(12));
      return JSON.parse(dec.decode(pt));
    } catch (err) {
      return null;
    }
  }

  async function makeEvent(ident, kind, tags, content, createdAt) {
    const ev = { pubkey: ident.pub, created_at: createdAt || nowSec(), kind: kind, tags: tags, content: content };
    const id = await sha(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
    ev.id = hex(id);
    ev.sig = hex(root.PiggySchnorr.sign(id, ident.sk));
    return ev;
  }

  /* ---------- 中繼站連線池 ---------- */
  const conns = [];
  const subs = new Map();      // subId -> { filter, onEvent, onEose }
  const acks = new Map();      // eventId -> fn(relayUrl, ok)
  let started = false;

  function Conn(url) {
    this.url = url;
    this.ws = null;
    this.ready = false;
    this.retry = 0;
    this.timer = 0;
    this.outbox = [];
  }
  Conn.prototype.connect = function () {
    const self = this;
    if (self.ws && (self.ws.readyState === 0 || self.ws.readyState === 1)) return;
    let ws;
    try { ws = new WebSocket(self.url); } catch (err) { self.later(); return; }
    self.ws = ws;
    ws.onopen = function () {
      self.ready = true;
      self.retry = 0;
      subs.forEach(function (sub, id) { self.raw(["REQ", id, sub.filter]); });
      const queued = self.outbox;
      self.outbox = [];
      queued.forEach(function (m) { self.raw(m); });
      notify();
    };
    ws.onmessage = function (msg) {
      let data;
      try { data = JSON.parse(msg.data); } catch (err) { return; }
      if (!Array.isArray(data)) return;
      if (data[0] === "EVENT") {
        const sub = subs.get(data[1]);
        if (sub && data[2]) sub.onEvent(data[2], self.url);
      } else if (data[0] === "EOSE") {
        const sub = subs.get(data[1]);
        if (sub && sub.onEose) sub.onEose(self.url);
      } else if (data[0] === "OK") {
        const fn = acks.get(data[1]);
        if (fn) fn(self.url, data[2] === true, data[3] || "");
      }
    };
    ws.onclose = function () {
      if (self.ws !== ws) return;
      self.ready = false;
      self.ws = null;
      notify();
      self.later();
    };
    ws.onerror = function () { try { ws.close(); } catch (err) {} };
  };
  Conn.prototype.later = function () {
    const self = this;
    if (self.timer || !started) return;
    self.retry = Math.min(self.retry + 1, 6);
    self.timer = setTimeout(function () { self.timer = 0; self.connect(); }, 800 * Math.pow(2, self.retry - 1));
  };
  Conn.prototype.raw = function (m) {
    try { this.ws.send(JSON.stringify(m)); } catch (err) {}
  };
  Conn.prototype.send = function (m) {
    if (this.ready) this.raw(m);
    else {
      if (this.outbox.length < 40) this.outbox.push(m);
      this.connect();
    }
  };

  function start() {
    if (started) return;
    started = true;
    RELAYS.forEach(function (url) { conns.push(new Conn(url)); });
    conns.forEach(function (c) { c.connect(); });
    if (root.document) {
      root.document.addEventListener("visibilitychange", function () {
        if (!root.document.hidden) wake();
      });
      root.addEventListener("online", wake);
    }
  }
  function wake() {
    conns.forEach(function (c) {
      if (c.timer) { clearTimeout(c.timer); c.timer = 0; }
      c.retry = 0;
      c.connect();
    });
  }
  function stop() {
    started = false;
    conns.forEach(function (c) {
      if (c.timer) clearTimeout(c.timer);
      c.timer = 0;
      try { if (c.ws) c.ws.close(); } catch (err) {}
    });
    conns.length = 0;
    subs.clear();
  }
  function liveCount() { return conns.filter(function (c) { return c.ready; }).length; }

  const listeners = [];
  function notify() {
    const n = liveCount();
    listeners.forEach(function (fn) { try { fn(n); } catch (err) {} });
  }

  function subscribe(filter, onEvent, onEose) {
    start();
    const id = "p" + rid();
    subs.set(id, { filter: filter, onEvent: onEvent, onEose: onEose });
    conns.forEach(function (c) { if (c.ready) c.raw(["REQ", id, filter]); else c.connect(); });
    return function () {
      if (!subs.delete(id)) return;
      conns.forEach(function (c) { if (c.ready) c.raw(["CLOSE", id]); });
    };
  }

  /** 送出一則事件；有任何一站收下就算成功。 */
  function publish(ev, timeoutMs) {
    start();
    return new Promise(function (resolve) {
      let done = false;
      let refused = 0;
      const timer = setTimeout(function () { finish(false); }, timeoutMs || 6000);
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // 留一點時間讓其他站也回覆，再拿掉回呼
        setTimeout(function () { acks.delete(ev.id); }, 4000);
        resolve(ok);
      }
      acks.set(ev.id, function (url, ok) {
        if (ok) finish(true);
        else if (++refused >= conns.length) finish(false);
      });
      conns.forEach(function (c) { c.send(["EVENT", ev]); });
    });
  }

  /** 問所有站；回傳收到的事件與「有幾站明確答完」。 */
  function query(filter, timeoutMs) {
    start();
    return new Promise(function (resolve) {
      const events = [];
      const seen = {};
      const answered = {};
      let done = false;
      let grace = 0;
      const close = subscribe(filter, function (ev) {
        if (seen[ev.id]) return;
        seen[ev.id] = 1;
        events.push(ev);
      }, function (url) {
        answered[url] = 1;
        const n = Object.keys(answered).length;
        if (n >= conns.length) finish();
        else if (!grace) grace = setTimeout(finish, 1500);
      });
      const timer = setTimeout(finish, timeoutMs || 5000);
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(grace);
        close();
        resolve({ events: events, answered: Object.keys(answered).length });
      }
    });
  }

  /* ---------- 帳本備份 ---------- */
  const lastStamp = new Map();   // pub -> 最後看過的 created_at

  async function readDocs(ident, events) {
    let best = null;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || ev.pubkey !== ident.pub || ev.kind !== KIND_DOC) continue;
      lastStamp.set(ident.pub, Math.max(lastStamp.get(ident.pub) || 0, ev.created_at || 0));
      const doc = await open(ident, ev.content);
      if (!doc || !doc.child) continue;
      if (!best || (doc.rev || 0) > (best.rev || 0)) best = doc;
    }
    return best;
  }

  /**
   * 拿回這把鑰匙的帳本。
   * state: "found"（有，child 是內容）／"none"（確定雲端沒有）／"unknown"（連不上，不能下結論）
   */
  async function pull(key, timeoutMs) {
    const ident = await identity("backup", key);
    const got = await query({ kinds: [KIND_DOC], authors: [ident.pub], "#d": [D_TAG] }, timeoutMs || 5000);
    let best = await readDocs(ident, got.events);
    let archiveAnswered = false;
    if (BACKUP_URL) {
      try {
        const res = await fetch(BACKUP_URL + ident.pub + ".json", { cache: "no-store" });
        if (res.ok) {
          const fromArchive = await readDocs(ident, [await res.json()]);
          if (fromArchive && (!best || (fromArchive.rev || 0) > (best.rev || 0))) best = fromArchive;
          archiveAnswered = true;
        } else if (res.status === 404) {
          archiveAnswered = true;
        }
      } catch (err) {}
    }
    if (best) return { state: "found", rev: best.rev || 0, child: best.child };
    if (got.answered > 0) return { state: "none", archive: archiveAnswered };
    return { state: "unknown" };
  }

  async function push(key, child) {
    const ident = await identity("backup", key);
    const content = await seal(ident, { v: 1, rev: child.revision || 0, saved_at: new Date().toISOString(), child: child });
    const stamp = Math.max(nowSec(), (lastStamp.get(ident.pub) || 0) + 1);
    lastStamp.set(ident.pub, stamp);
    const ev = await makeEvent(ident, KIND_DOC, [["d", D_TAG]], content, stamp);
    return publish(ev, 7000);
  }

  /** 別台裝置更新帳本時通知（同一把鑰匙在兩台用的情況）。 */
  async function watch(key, onDoc) {
    const ident = await identity("backup", key);
    return subscribe({ kinds: [KIND_DOC], authors: [ident.pub], "#d": [D_TAG], since: nowSec() }, async function (ev) {
      const doc = await readDocs(ident, [ev]);
      if (doc) onDoc({ rev: doc.rev || 0, child: doc.child });
    });
  }

  /* ---------- 核准通道 ---------- */
  /** 孩子裝置：等家長手機的請求，交給 handler 處理後回覆。回傳關閉函式。 */
  async function serve(x, handler) {
    const ident = await identity("tunnel", x);
    const jobs = new Map();
    const close = subscribe({ kinds: [KIND_TUNNEL], authors: [ident.pub], since: nowSec() - 20 }, async function (ev) {
      const msg = await open(ident, ev.content);
      if (!msg || msg.t !== "req" || !msg.id) return;
      if (!jobs.has(msg.id)) {
        jobs.set(msg.id, Promise.resolve().then(function () { return handler(msg); }).catch(function () {
          return { status: 500, j: { error: "internal_error", message: "處理失敗" } };
        }));
      }
      const res = await jobs.get(msg.id);
      const reply = await makeEvent(ident, KIND_TUNNEL, [], await seal(ident, { t: "res", id: msg.id, status: res.status, j: res.j }));
      publish(reply, 5000);
    });
    return close;
  }

  /** 家長手機：送請求給孩子裝置並等回覆。連不上時 reject。 */
  async function call(x, req, timeoutMs) {
    const ident = await identity("tunnel", x);
    const id = rid();
    const limit = timeoutMs || 15000;
    return new Promise(function (resolve, reject) {
      let done = false;
      let resend = 0;
      const close = subscribe({ kinds: [KIND_TUNNEL], authors: [ident.pub], since: nowSec() - 5 }, async function (ev) {
        const msg = await open(ident, ev.content);
        if (!msg || msg.t !== "res" || msg.id !== id) return;
        finish(null, { status: msg.status, j: msg.j });
      });
      const timer = setTimeout(function () { finish(new Error("tunnel timeout")); }, limit);
      function finish(err, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(resend);
        close();
        if (err) reject(err); else resolve(value);
      }
      async function send() {
        if (done) return;
        const ev = await makeEvent(ident, KIND_TUNNEL, [], await seal(ident, Object.assign({ t: "req", id: id }, req)));
        publish(ev, 4000);
      }
      send();
      // 孩子那邊會用 id 去重，重送只是保險（訂閱還沒就緒時第一則可能漏掉）
      resend = setInterval(send, 2500);
    });
  }

  root.PiggyCloud = {
    start: start,
    stop: stop,
    wake: wake,
    pull: pull,
    push: push,
    watch: watch,
    serve: serve,
    call: call,
    live: liveCount,
    onLive: function (fn) { listeners.push(fn); },
    _publish: publish,
    _query: query,
    _event: makeEvent,
    _identity: identity,
  };
})(typeof window !== "undefined" ? window : globalThis);
