// 小豬銀行雲端備份的保險：把公開中繼站上的加密帳本抄一份進這個儲庫，
// 並把儲庫裡的備份再送回中繼站（哪一站清掉了就會被補回去）。
// 內容是用孩子的入口鑰匙加密的，這支程式看不到也改不了帳。
// 由 .github/workflows/backup.yml 排程執行；原始檔在 weslie4436/piggybank 的 cloud/。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RELAYS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.mom",
  "wss://relay.nostr.net",
  "wss://purplerelay.com",
  "wss://nostr.bitcoiner.social",
];
const D_TAG = process.env.PIGGY_DTAG || "piggybank:weslie4436";
const DIR = process.env.PIGGY_DIR || "backup";
const KIND = 30078;
const MAX_FILES = 300;
const MAX_CONTENT = 600000;
const HEX64 = /^[0-9a-f]{64}$/;

function valid(ev) {
  if (!ev || ev.kind !== KIND) return false;
  if (!HEX64.test(ev.pubkey || "") || !HEX64.test(ev.id || "") || !/^[0-9a-f]{128}$/.test(ev.sig || "")) return false;
  if (typeof ev.content !== "string" || ev.content.length > MAX_CONTENT) return false;
  if (!Array.isArray(ev.tags) || !ev.tags.some((t) => Array.isArray(t) && t[0] === "d" && t[1] === D_TAG)) return false;
  const id = createHash("sha256")
    .update(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))
    .digest("hex");
  return id === ev.id;
}

function connect(url) {
  return new Promise((resolve) => {
    let ws;
    try { ws = new WebSocket(url); } catch { resolve(null); return; }
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(null); }, 8000);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); resolve(null); };
  });
}

function fetchAll(ws) {
  return new Promise((resolve) => {
    const events = [];
    const timer = setTimeout(() => resolve(events), 12000);
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data[0] === "EVENT" && data[1] === "arch") events.push(data[2]);
      if (data[0] === "EOSE" && data[1] === "arch") { clearTimeout(timer); resolve(events); }
    };
    ws.send(JSON.stringify(["REQ", "arch", { kinds: [KIND], "#d": [D_TAG], limit: 500 }]));
  });
}

fs.mkdirSync(DIR, { recursive: true });
const kept = new Map();
for (const name of fs.readdirSync(DIR)) {
  if (!name.endsWith(".json")) continue;
  try {
    const ev = JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
    if (valid(ev) && name === ev.pubkey + ".json") kept.set(ev.pubkey, ev);
  } catch {}
}

const sockets = (await Promise.all(RELAYS.map(connect))).filter(Boolean);
console.log("relays connected:", sockets.length, "/", RELAYS.length);
if (!sockets.length) { console.log("no relay reachable; nothing to do"); process.exit(0); }

let changed = 0;
const seen = await Promise.all(sockets.map(fetchAll));
for (const list of seen) {
  for (const ev of list) {
    if (!valid(ev)) continue;
    const old = kept.get(ev.pubkey);
    if (old && old.created_at >= ev.created_at) continue;
    if (!old && kept.size >= MAX_FILES) continue;
    kept.set(ev.pubkey, ev);
    fs.writeFileSync(path.join(DIR, ev.pubkey + ".json"), JSON.stringify(ev) + "\n");
    changed += 1;
  }
}
console.log("ledgers archived:", kept.size, "updated this run:", changed);

// 送回每一站：已經有的會被忽略，缺的會被補上
for (const ws of sockets) {
  for (const ev of kept.values()) {
    try { ws.send(JSON.stringify(["EVENT", ev])); } catch {}
  }
}
await new Promise((r) => setTimeout(r, 3000));
for (const ws of sockets) { try { ws.close(); } catch {} }
process.exit(0);
