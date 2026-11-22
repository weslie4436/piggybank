import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

test("door.js switches 銀行 and 紀錄 by swipe and spends from the total", () => {
  const js = read("door.js");
  assert.match(js, /function bindSwipe/);
  assert.match(js, /pickTab\("ledger"\)/);
  assert.match(js, /pickTab\("bank"\)/);
  assert.doesNotMatch(js, /rail-bank/);
  assert.doesNotMatch(js, /rail-ledger/);
  assert.doesNotMatch(js, /rail-spend/);
  assert.match(js, /openExchange/);
  assert.match(js, /ovTotal/);
  assert.match(js, /ins-icon/);
  assert.match(js, /"gm"/);
  assert.match(js, /GM功能/);
  assert.match(js, /發放零用錢/);
  assert.match(js, /零用錢設定/);
  assert.match(js, /伺服器維修 請聯絡家長/);
  assert.doesNotMatch(js, /零用金|家裡還沒開/);
  assert.doesNotMatch(js, /rail-feed/);
  assert.doesNotMatch(js, /給十天零用錢/);
  assert.doesNotMatch(js, /切換測試/);
  assert.doesNotMatch(js, /\/api\/debug\/feed/);
  assert.match(js, /unauthorized/);
  assert.match(js, /status === 401/);
  assert.match(js, /if \(invitePage\) \{\s+setBoot\(false\);\s+showInvite\(\);/);
});

test("spend card uses the shared PIN pad plus a bag confirm, not custom inputs", () => {
  const js = read("door.js");
  const open = js.match(/function amountPad\([\s\S]*?\n  function /);
  assert.ok(open, "amountPad missing");
  assert.match(open[0], /gate-pad/);
  assert.match(open[0], /gate-key/);
  assert.match(open[0], /className = "gate-key ex-bag"/);
  assert.match(open[0], /金額超過存款/);
  assert.match(open[0], /bag\.disabled/);
  assert.doesNotMatch(open[0], /insButton\("ex-bag"/);
  assert.doesNotMatch(open[0], /placeholder/);
  assert.doesNotMatch(js, /paintKnock|knockOnce|還沒有撲滿/);
  const ex = read("exchange.js");
  assert.match(ex, /className = "apple-row"/);
  assert.match(ex, /伺服器維修 請聯絡家長/);
  assert.doesNotMatch(ex, /placeholder = "備註"/);
  assert.doesNotMatch(ex, /家裡還沒開/);
});

test("GM功能 has 發放零用錢 and alignment guides, not the ten-day debug feed", () => {
  const js = read("door.js");
  assert.match(js, /function openGmCard/);
  assert.match(js, /function openGrantCard/);
  assert.match(js, /addSwitch\(body, "對位線"/);
  assert.match(js, /addSwitch\(body, "無限探險"/);
  assert.match(js, /\/api\/settings\/adventure-unlimited/);
  assert.match(js, /addSwitch\(body, "特別獎金"/);
  assert.match(js, /openAllowanceCard/);
  assert.match(js, /\/api\/grant/);
  assert.doesNotMatch(js, /切換測試/);
  assert.doesNotMatch(js, /debugFeed/);
  assert.doesNotMatch(js, /gm-feed/);
  assert.doesNotMatch(js, /insButton\("rail-feed"/);
});

test("theme picker has no PIN pad and uses spaced frames", () => {
  const js = read("door.js");
  const css = read("piggy.css");
  const themeFn = js.match(/function openThemeCard\(\) \{[\s\S]*?\n  function /);
  assert.ok(themeFn, "openThemeCard missing");
  assert.match(themeFn[0], /theme-picks/);
  assert.match(themeFn[0], /theme-pick/);
  assert.doesNotMatch(themeFn[0], /pinPad/);
  assert.doesNotMatch(themeFn[0], /六位數 PIN/);
  assert.match(css, /\.theme-picks[\s\S]*gap:\s*18px/);
});

test("index.html does not link a static manifest", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /<link[^>]*rel=["']manifest["']/i);
});

test("pages lock double-tap zoom like the other home-web shells", () => {
  for (const name of ["index.html", "hey.html", "exchange.html"]) {
    const html = read(name);
    assert.match(html, /gesturestart/);
    assert.match(html, /gesturechange/);
    assert.match(html, /dblclick/);
  }
  const css = read("app.css");
  assert.match(css, /html, body[\s\S]*touch-action:\s*manipulation/);
  assert.match(css, /button \{[\s\S]*touch-action:\s*manipulation/);
  const piggy = read("piggy.css");
  assert.match(piggy, /button\.money-hero[\s\S]*touch-action:\s*manipulation/);
  assert.doesNotMatch(piggy, /button\.money-hero[\s\S]{0,220}font:\s*inherit/);
  const gate = read("gate.js");
  assert.match(gate, /function blockWebChrome/);
  assert.match(gate, /gesturechange/);
  assert.match(gate, /dblclick/);
});

test("hey.html has blobs, invite start, and product name 小豬銀行", () => {
  const html = read("hey.html");
  assert.match(html, /class="[^"]*blobs/);
  assert.ok(
    /class="[^"]*invite-go/.test(html) || /class="[^"]*apple-row/.test(html),
    "missing invite-go or apple-row"
  );
  assert.match(html, /小豬銀行/);
  assert.match(html, /零用錢APP/);
  assert.doesNotMatch(html, /每天領零用金|零用金/);
});

test("door.js pops a coin beside the balance and can claim again before the coin finishes", () => {
  const js = read("door.js");
  const burst = js.slice(js.indexOf("function burstCoin"), js.indexOf("function setPigState"));
  assert.match(js, /function burstCoin/);
  assert.match(js, /function claimOnce/);
  assert.match(js, /money-coin/);
  assert.match(js, /playCoinSound/);
  assert.match(js, /claimSerial/);
  assert.match(js, /coin-sheet\.png/);
  assert.match(burst, /classList\.add\("is-on"\)/);
  assert.match(burst, /visualViewport/);
  assert.doesNotMatch(burst, /if \(!ovNum \|\| reduceMotion\(\)\) return;/);
  assert.doesNotMatch(js, /harvestPig|\/api\/harvest/);
  assert.doesNotMatch(js, /pig-coin is-dropping/);
  assert.doesNotMatch(js, /spawnCoins\(pigBlock/);
});

test("piggy.css lists feeding, harvest, hit, and seated breathe", () => {
  const css = read("piggy.css");
  for (const name of [
    "is-feeding",
    "is-harvesting",
    "is-hit-1",
    "is-hit-2",
    "is-hit-3",
    "is-hit-4",
    "is-hit-5",
  ]) {
    assert.match(css, new RegExp(`\\.${name}\\b`));
  }
  assert.match(css, /@keyframes piggy-breathe/);
  assert.match(css, /transform-origin:\s*50% var\(--pig-foot-y\)/);
  assert.match(css, /\.money-coin[\s\S]*width:\s*36px/);
  assert.match(css, /\.money-hero[\s\S]*clamp\(45px/);
  assert.doesNotMatch(css, /\.money-yen/);
});

test("piggy.css defines three Sanrio-inspired theme palettes", () => {
  const css = read("piggy.css");
  assert.match(css, /html\[data-theme="melody"\]/);
  assert.match(css, /html\[data-theme="kuromi"\]/);
  assert.match(css, /html\[data-theme="cinnamoroll"\]/);
  assert.match(css, /--rose:\s*#ff6b9d/i);
  assert.match(css, /--rose:\s*#b57edc/i);
  assert.match(css, /--money:\s*#ff7eae/i);
  assert.match(css, /#pig-home \{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /#ledger[\s\S]*user-select:\s*none/);
  assert.match(css, /--rose:\s*#7ec8e3/i);
});

test("door.js rolls held money in stepped ticks and stores pig guide lines", () => {
  const js = read("door.js");
  assert.match(js, /el\._roll = window\.setInterval/);
  assert.match(js, /el\._roll[\s\S]*?, 40\)/);
  assert.doesNotMatch(js, /\/ 420\)/);
  assert.match(js, /function applyGuides/);
  assert.match(js, /\["foot", "腳點"\]/);
  assert.match(js, /\["coin", "投幣點"\]/);
  assert.match(js, /\/api\/settings\/guides/);
  assert.doesNotMatch(js, /piggybank\.guides"/);
  assert.doesNotMatch(js, /piggybank\.theme/);
});

test("pages link apple-touch-icon and default melody theme", () => {
  for (const name of ["index.html", "hey.html", "exchange.html"]) {
    const html = read(name);
    assert.match(html, /data-theme="melody"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /icons\/piggy-180\.png/);
  }
});

// v2 孩子主畫面（kid.js / kid.css）
test("v2 index.html has pig, balance, claim, spend, ledger, parent lock", () => {
  const html = read("index.html");
  for (const id of ["pig", "balance", "claim", "wait-card", "spend", "ledger-btn", "parent-btn", "fx"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /icons\/pig\.png/);
  assert.match(html, /kid\.js\?v=\d+/);
  assert.match(html, /vault-local\.js/);
});

test("v2 kid.js uses the existing ledger API only", () => {
  const js = read("kid.js");
  for (const p of ["/api/state", "/api/claim", "/api/exchange/reserve", "/api/exchange/status", "/api/exchange/cancel", "/api/grant", "/api/settings/read", "/api/ledger"]) {
    assert.ok(js.includes(p), p);
  }
  assert.ok(js.includes("is_bonus: true"), "parent bonus is a bonus grant");
});

test("v2 spend blocks over-balance amounts", () => {
  const js = read("kid.js");
  assert.match(js, /n > total/);
  assert.match(js, /go\.disabled = n < 1 \|\| over/);
});

test("exchange.html keeps the ids exchange.js needs", () => {
  const html = read("exchange.html");
  for (const id of ["gate-dots", "gate-pad", "exHey", "actMask", "actBody", "actClose", "exApprove", "invite-wait", "status"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.equal((html.match(/data-num="/g) || []).length, 10);
});
