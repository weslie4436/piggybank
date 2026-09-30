# 森林尋寶殺尖塔棋盤 Implementation Plan

> **For agentic workers:** 本回合改為同一 session 實作（使用者已叫開工）。TDD：保險庫先紅再綠，再接門面。

**Goal:** 森林探險改成拖答案卡打怪；金幣進待領，回銀行用既有對話框領。

**Architecture:** SQLite 當日遭遇（波次／怪物／手牌）是真相。前端只畫佔位棋盤並把 `monster_id`＋數字交給保險庫。直立／橫屏兩套 CSS 幾何，旋轉只重排。

**Tech Stack:** Python 保險庫、靜態 `web/adventure.js|css`、GitHub Pages。

## Global Constraints

-  fort  fort  fort Pages 入口；帳本只追加；入帳只在 claim。
- 當日掉落 18–30；精英最多一隻、兩題兩滴血。
- 孩子 5 血，進森林回滿；丟錯彈回扣血；歸零回銀行不扣已有錢。
- 不搬能量／結束回合／地圖。
- 返回＝共用 `.ins-icon.nav-back`；領錢＝`#claim-bubble`。

---

### Task 1: 遭遇模型與出牌

**Files:** `tests/test_adventure.py`（新）、`src/piggybank/store.py`、`src/piggybank/service.py`、`src/piggybank/vault.py`、`tests/test_store.py`

**Produces:** `adventure_state` / `enter_adventure` / `play_adventure_card`

- [ ] 測試：生成、打對待領、打錯扣血、進場回血、精英兩擊、claim 才入帳
- [ ] 實作 schema 與 service
- [ ] `GET /api/adventure`、`POST /api/adventure/enter`、`POST /api/adventure/play`

### Task 2: 戰鬥盤

**Files:** `web/index.html`、`web/adventure.js`、`web/adventure.css`、`web/tests/ui-contract.test.mjs`、`web/door.js`（領取文案）

- [ ] 拿掉地圖；怪列＋手牌扇形；pointer 拖到怪
- [ ] `orientation: portrait` / `landscape` 兩套，旋轉只 `layoutBoard`
- [ ] 森林待領用 grant note 顯示

### Task 3: 驗證與上線

- [ ] `python -m unittest`、`node --test web/tests/ui-contract.test.mjs`
- [ ] 瀏覽器直立／橫屏拖牌
- [ ] 提高 `?v=`，commit + push `main` 與 `gh-pages`
