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
  assert.match(bar[0], />消費</);
  assert.doesNotMatch(bar[0], /倉庫|最愛|帳本|兌換/);
});

test("index.html has pig product regions", () => {
  const html = read("index.html");
  for (const id of ["active-pig", "pig-allowance", "claim-apply", "exchange-sheet", "ledger"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="ovNum"/);
  assert.match(html, /id="ovTotal"/);
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

test("door.js wires 銀行 紀錄 消費 on the shared right menu", () => {
  const js = read("door.js");
  assert.match(js, /rail-bank/);
  assert.match(js, /rail-ledger/);
  assert.match(js, /rail-spend/);
  assert.match(js, /"銀行"/);
  assert.match(js, /"紀錄"/);
  assert.match(js, /"消費"/);
  assert.match(js, /piggybank\.debug/);
  assert.match(js, /\/api\/debug\/feed/);
  assert.match(js, /ins-icon/);
  const bank = js.match(/insButton\("rail-bank",\s*([^,]+)/);
  const records = js.match(/insButton\("rail-ledger",\s*([^,]+)/);
  const spend = js.match(/insButton\("rail-spend",\s*([^,]+)/);
  assert.ok(bank && records && spend, "rail icons missing");
  assert.equal(bank[1].trim(), "BANK");
  assert.equal(records[1].trim(), "LEDGER");
  assert.equal(spend[1].trim(), "SPEND");
  assert.match(js, /"gm"/);
  assert.match(js, /GM功能/);
  assert.match(js, /切換測試/);
  assert.match(js, /測試加錢/);
  assert.doesNotMatch(js, /rail-feed/);
});

test("debug 測試加錢 lives in GM功能, not the right rail", () => {
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

test("hey.html has blobs, invite start, and product name 小金庫", () => {
  const html = read("hey.html");
  assert.match(html, /class="[^"]*blobs/);
  assert.ok(
    /class="[^"]*invite-go/.test(html) || /class="[^"]*apple-row/.test(html),
    "missing invite-go or apple-row"
  );
  assert.match(html, /小金庫/);
});

test("exchange.html has PIN pad and confirm", () => {
  const html = read("exchange.html");
  assert.match(html, /class="[^"]*gate-pad/);
  assert.match(html, /<button[^>]*class="[^"]*tag-apply/);
});

test("door.js drops one 10-yuan placeholder coin after the previous coin is gone", () => {
  const js = read("door.js");
  assert.match(js, /function playFeedCoins/);
  assert.match(js, /Math\.floor\(Number\(amount \|\| 0\) \/ 10\)/);
  assert.match(js, /pig-coin is-dropping/);
  assert.match(js, /dropOne\(i \+ 1\)/);
  assert.doesNotMatch(js, /spawnCoins\(pigBlock/);
});

test("piggy.css feed coins are placeholder boxes, not coin artwork", () => {
  const css = read("piggy.css");
  assert.match(css, /\.pig-coin\.is-dropping/);
  assert.match(css, /@keyframes piggy-feed-in/);
  const drop = css.match(/\.pig-coin\.is-dropping\s*\{[\s\S]*?\}/);
  assert.ok(drop, "dropping coin rule missing");
  assert.doesNotMatch(drop[0], /coin\.jpg/);
  assert.match(drop[0], /border-radius:\s*21px/);
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
  assert.match(css, /\.claim-go\.ins-icon[\s\S]*width:\s*60px/);
  assert.match(css, /\.money-hero[\s\S]*clamp\(45px/);
  assert.doesNotMatch(css, /\.money-yen/);
});

test("index.html references the user coin artwork", () => {
  const html = read("index.html");
  assert.match(html, /\.\/icons\/coin\.jpg/);
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
  assert.match(css, /--rose:\s*#6b5b95/i);
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
