import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

test("index.html has home-head, settings gear, and mode names", () => {
  const html = read("index.html");
  assert.match(html, /class="[^"]*home-head/);
  assert.match(html, /class="[^"]*ins-icon[^"]*settings-toggle|class="[^"]*settings-toggle[^"]*ins-icon/);
  assert.match(html, /id="mode-bar"/);
});

test("index.html first mode label is 銀行", () => {
  const html = read("index.html");
  const bar = html.match(/id="mode-bar"[\s\S]*?<\/div>/);
  assert.ok(bar, "mode-bar missing");
  const first = bar[0].match(/class="[^"]*mode-btn[^"]*"[^>]*>([^<]+)/);
  assert.ok(first, "first mode button missing");
  assert.equal(first[1].trim(), "銀行");
  assert.match(bar[0], />紀錄</);
  assert.doesNotMatch(bar[0], />消費</);
  assert.doesNotMatch(bar[0], /倉庫|最愛|帳本|兌換/);
});

test("index.html has pig product regions", () => {
  const html = read("index.html");
  for (const id of ["active-pig", "claim-bubble", "exchange-sheet", "ledger"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="ovNum"/);
  assert.match(html, /<button[^>]*id="ovTotal"[^>]*aria-label="消費"/);
  assert.match(html, /class="[^"]*play-line[^"]*pig-say/);
  assert.match(html, /id="claim-text"/);
  assert.doesNotMatch(html, /id="claim-apply"|每晚 7 點發放/);
  assert.doesNotMatch(html, /id="allowClock"|class="allow-clock"/);
  assert.doesNotMatch(html, /class="money-yen"|<span class="money-yen">/);
  assert.doesNotMatch(html, /id="ovKicker"|錢包</);
  assert.doesNotMatch(html, /id="ovYield"|可收益/);
  assert.doesNotMatch(html, /id="pig-progress"|id="warehouse"|id="page-bonus"|滿豬數|正在養|基礎撲滿/);
});

test("index.html has confirm, action sheet, ask card, and photo-rail", () => {
  const html = read("index.html");
  assert.match(html, /<button[^>]*class="[^"]*tag-apply/);
  assert.match(html, /class="[^"]*batch-tag-sheet/);
  assert.match(html, /class="[^"]*ask-card/);
  assert.match(html, /id="photo-rail"/);
});

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
  assert.match(js, /piggybank\.debug/);
  assert.match(js, /\/api\/debug\/feed/);
  assert.match(js, /ins-icon/);
  assert.match(js, /"gm"/);
  assert.match(js, /GM功能/);
  assert.match(js, /切換測試/);
  assert.match(js, /給十天零用錢/);
  assert.doesNotMatch(js, /rail-feed/);
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
  assert.doesNotMatch(ex, /placeholder = "備註"/);
});

test("debug 給十天零用錢 lives in GM功能, not the right rail", () => {
  const js = read("door.js");
  assert.match(js, /function openGmCard/);
  assert.match(js, /className = "tag-apply gm-feed"/);
  assert.match(js, /addSwitch\(body, "切換測試"/);
  assert.match(js, /addSwitch\(body, "對位線"/);
  assert.match(js, /openAllowanceCard/);
  assert.match(js, /debugFeed/);
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
});

test("exchange.html has PIN pad and confirm", () => {
  const html = read("exchange.html");
  assert.match(html, /class="[^"]*gate-pad/);
  assert.match(html, /<button[^>]*class="[^"]*tag-apply/);
});

test("door.js pops a coin beside the balance and can claim again before the coin finishes", () => {
  const js = read("door.js");
  assert.match(js, /function burstCoin/);
  assert.match(js, /function claimOnce/);
  assert.match(js, /money-coin/);
  assert.match(js, /playCoinSound/);
  assert.match(js, /claimSerial/);
  assert.doesNotMatch(js, /pig-coin is-dropping/);
  assert.doesNotMatch(js, /spawnCoins\(pigBlock/);
});

test("piggy.css spins the coin sheet beside the balance", () => {
  const css = read("piggy.css");
  assert.match(css, /\.money-coin/);
  assert.match(css, /coin-sheet\.png/);
  assert.match(css, /@keyframes coin-spin/);
  assert.match(css, /@keyframes coin-rise/);
  assert.match(css, /\.pig-say \.play-bubble[\s\S]*var\(--rose/);
  assert.match(css, /\.pig-dot/);
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

test("claim copy uses the speech bubble and coin sheet, not the old claim button", () => {
  const html = read("index.html");
  const js = read("door.js");
  assert.match(html, /有0筆零用錢可領取/);
  assert.match(js, /有" \+ waiting\.length \+ "筆零用錢可領取/);
  assert.doesNotMatch(html, /claim-apply|每晚 7 點發放/);
});

test("index.html uses the user pig artwork on the piggy stage", () => {
  const html = read("index.html");
  assert.match(html, /class="pig-art"/);
  assert.match(html, /\.\/icons\/pig\.png/);
});

test("piggy.css defines three Sanrio-inspired theme palettes", () => {
  const css = read("piggy.css");
  assert.match(css, /html\[data-theme="melody"\]/);
  assert.match(css, /html\[data-theme="kuromi"\]/);
  assert.match(css, /html\[data-theme="cinnamoroll"\]/);
  assert.match(css, /--rose:\s*#ff6b9d/i);
  assert.match(css, /--rose:\s*#7c3aed/i);
  assert.match(css, /--money:\s*#ffffff/i);
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
});

test("pages link apple-touch-icon and default melody theme", () => {
  for (const name of ["index.html", "hey.html", "exchange.html"]) {
    const html = read(name);
    assert.match(html, /data-theme="melody"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /icons\/piggy-180\.png/);
  }
});
