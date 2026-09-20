# PiggyBank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可在 GitHub Pages 使用、由家裡 SQLite 保險庫保存帳務的孩子撲滿儲蓄 App。

**Architecture:** 靜態 `web/` 使用 FamiGate 連到 Python `ThreadingHTTPServer`；所有金錢操作集中在 `PiggyService`，由 SQLite `BEGIN IMMEDIATE` 交易保證領取、收益、保留與扣款不可重複。前端只依 API 回傳快照播放動畫，不自行決定帳務結果。

**Tech Stack:** Python 3.12 標準庫、SQLite、`qrcode`（SVG QR）、原生 HTML/CSS/JavaScript、GitHub Pages、Cloudflare quick tunnel。

## Global Constraints

- 只在 `main` 工作，禁止 PR。
- 唯一入口是 GitHub Pages；禁止 exe/bat/cmd 使用者入口。
- 所有新 Python 行為先寫 `unittest` 並觀察預期失敗。
- 會上 Pages 的檔驗證後提高 `?v=`、commit、push `origin main`。
- 不提交 `data/`、SQLite、PIN、個人鑰匙、隧道狀態。
- 共用返回、確認、操作卡、問句卡、齒輪、等待、首頁頭、格子、愛心及工具列不得改幾何。

---

### Task 1: 專案骨架與設定

**Files:**
- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `requirements.txt`
- Create: `src/piggybank/__init__.py`
- Create: `src/piggybank/__main__.py`
- Create: `src/piggybank/paths.py`
- Create: `tests/test_smoke.py`

**Interfaces:**
- Produces: `python -m piggybank vault|setup|ensure-shortcut` 命令入口。
- Produces: `paths.ROOT/WEB/DATA/DB_PATH/PORT/PAGES_BASE`。

- [ ] 寫 `tests/test_smoke.py`，匯入 `piggybank` 並斷言 `paths.PORT == 8771`。
- [ ] 執行 `python -m unittest tests.test_smoke -v`，確認因模組不存在失敗。
- [ ] 建立最小 package、路徑與命令解析，使測試通過。
- [ ] 執行 `python -m unittest discover -s tests -v`，確認零失敗。

### Task 2: SQLite schema、PIN 與入口鑰匙

**Files:**
- Create: `src/piggybank/store.py`
- Create: `src/piggybank/auth.py`
- Create: `tests/test_store.py`
- Create: `tests/test_auth.py`

**Interfaces:**
- Produces: `Store(db_path).transaction()`、`Store.snapshot()`、`Store.bump_revision()`。
- Produces: `hash_pin(pin) -> str`、`verify_pin(pin, encoded) -> bool`、`new_token() -> str`、`token_hash(token) -> str`。

- [ ] 測試新資料庫會建立 settings、allowance_rules、claims、pigs、warehouse_pages、ledger、exchanges、pin_attempts 表及必要唯一索引。
- [ ] 執行 store 測試，確認因 schema 尚未實作失敗。
- [ ] 以 `sqlite3` 建 schema；所有 mutation 使用 `BEGIN IMMEDIATE`。
- [ ] 測試六位 PIN scrypt 雜湊、錯 PIN、token 不保存明文。
- [ ] 執行 auth 測試，確認失敗後實作最小 auth。
- [ ] 執行全部測試。

### Task 3: 零用金、撲滿填充與固定倉庫頁

**Files:**
- Create: `src/piggybank/schedule.py`
- Create: `src/piggybank/service.py`
- Create: `tests/test_schedule.py`
- Create: `tests/test_pigs.py`

**Interfaces:**
- Produces: `period_key(rule, now)`、`eligible_periods(rule_versions, claims, now)`。
- Produces: `PiggyService.claim(period_key, now)`、`PiggyService.state(now)`。
- Snapshot fields: `revision`, `total`, `active_pig`, `warehouse_pages`, `claimable_periods`。

- [ ] 測試每日／每週／每月週期鍵、1–28 月日與 Asia/Taipei 邊界。
- [ ] 觀察 schedule 測試預期失敗，再實作使其通過。
- [ ] 測試 30 元直接灌入 150 元 active pig；第五次入帳使豬滿並放入第 1 頁第 1 格。
- [ ] 測試 `140 + 30` 會入庫 150 元豬並建立 20 元新豬。
- [ ] 測試同 period_key 重領失敗且帳本不增加。
- [ ] 測試前頁洞優先補、六格滿才建立下一頁、頁面成員不自動搬動。
- [ ] 實作最小 `PiggyService`，每個 mutation 追加 ledger 並 bump revision。
- [ ] 執行全部測試。

### Task 4: 每隻收益與整頁 Bonus

**Files:**
- Modify: `src/piggybank/service.py`
- Create: `tests/test_yields.py`

**Interfaces:**
- Produces: `PiggyService.accrue(now)`、`harvest_pig(pig_id, now)`、`harvest_page(page_no, now)`。
- Pig pending yield range: `0..3`；page pending bonus range: `0,2,4,6`。

- [ ] 測試滿豬未滿 24 小時無收益、滿一日 `pending_yield=1`、最多 3。
- [ ] 測試收割後收益增加原豬 value，pending 清零並寫 ledger。
- [ ] 測試固定頁六隻完整滿 24 小時產 2 元，最多累積 6 元。
- [ ] 測試少一隻停止新增 Bonus，但保留已產生 Bonus。
- [ ] 測試補齊後需重新完整滿 24 小時才新增 Bonus。
- [ ] 測試頁 Bonus 收割會依序灌入 active pig，包含存滿入庫與溢額。
- [ ] 觀察測試失敗後實作收益邏輯，再跑全部測試。

### Task 5: 敲豬、找零、QR 保留與父母核准

**Files:**
- Modify: `src/piggybank/service.py`
- Create: `src/piggybank/qr.py`
- Create: `tests/test_exchange.py`

**Interfaces:**
- Produces: `preview_exchange(amount, pig_ids)`。
- Produces: `reserve_exchange(amount, child_note, pig_ids, now) -> {id, token, expires_at, total, change}`。
- Produces: `approve_exchange(token, pin, parent_note, now)`、`cancel_exchange(token, now)`。
- Produces: `qr_svg(pages_url) -> bytes`。

- [ ] 測試未滿豬、有待收收益的豬及已保留豬不能選。
- [ ] 測試敲出總額不足時拒絕建立 QR。
- [ ] 測試保留只鎖豬，不永久扣款；token DB 只保存 SHA-256。
- [ ] 測試父母核准原子化破壞選中豬、扣消費、把找零灌回 active pig、更新頁 Bonus 與 ledger。
- [ ] 測試同 token 重送只完成一次。
- [ ] 測試逾時／取消完整恢復原豬。
- [ ] 測試三次錯 PIN 鎖十分鐘；每次新 exchange 仍需 PIN。
- [ ] 觀察各測試失敗後逐步實作，再跑全部測試。

### Task 6: HTTP 保險庫與 FamiGate

**Files:**
- Create: `src/piggybank/vault.py`
- Create: `tests/test_vault.py`
- Create: `web/config.js`
- Create: `web/gate.js`

**Interfaces:**
- GET: `/api/health`, `/api/state`, `/api/ledger`, `/api/exchange/resolve`, `/api/exchange/status`, `/api/exchange/qr.svg`。
- POST: `/api/claim`, `/api/harvest/pig`, `/api/harvest/page`, `/api/exchange/reserve`, `/api/exchange/approve`, `/api/exchange/cancel`。
- PUT: `/api/settings/allowance`, `/api/settings/theme`。

- [ ] 以暫存 SQLite 啟動真實 `ThreadingHTTPServer`，先測 health、CORS allowlist 與未授權 401。
- [ ] 觀察 vault 測試失敗後建立 request parser、JSON response、key auth。
- [ ] 為每個 mutation 寫 HTTP 整合測試，確認 status code 與 revision。
- [ ] 實作端點，讓整合測試通過。
- [ ] 建立 config-driven FamiGate，保存 `piggybank.viewKey`，支援 URL `?k=` / `#k=` 與 iOS viewport。

### Task 7: Pages 共用門面與產品互動

**Files:**
- Create: `web/hey.html`
- Create: `web/index.html`
- Create: `web/exchange.html`
- Create: `web/app.css`
- Create: `web/piggy.css`
- Create: `web/door.js`
- Create: `web/exchange.js`
- Create: `web/face-default.jpg`
- Create: `web/tests/ui-contract.test.mjs`

**Interfaces:**
- DOM ids: `active-pig`, `pig-progress`, `warehouse`, `ledger`, `exchange-sheet`, `exchange-tray`, `page-bonus`。
- CSS states: `.is-feeding`, `.is-full`, `.is-harvesting`, `.is-hit-1`…`.is-hit-5`, `.is-shattered`, `.reduce-motion`。

- [ ] 先寫 DOM contract 測試，要求首頁頭、第一顆「最愛」、齒輪圓圖示、操作卡、確認、六格倉庫、長按愛心工具列存在。
- [ ] 執行 `node --test web/tests/ui-contract.test.mjs`，確認缺檔／缺節點失敗。
- [ ] 從活標本抄共用類名與幾何，建立入口頁、連線中、標準個人頁。
- [ ] 建立單一 active pig 佔位方塊、共用進度條及固定 3×2 warehouse page。
- [ ] 實作餵錢、存滿、收益飛入、五段敲擊、撒幣、找零回流與 reduced-motion。
- [ ] 實作 QR 等待及父母 PIN＋內容操作卡。
- [ ] 執行 UI contract 與 Python 全部測試。

### Task 8: 主題、素材、圖示、部署與驗收

**Files:**
- Create: `web/icons/coin.png`
- Create: `scripts/make_icon.py`
- Create: `scripts/ensure_shortcut.ps1`
- Create: `scripts/update_tunnel.py`
- Create: `web/icons/piggy-180.png`
- Create: `web/icons/piggy-192.png`
- Create: `web/icons/piggy-v1.ico`
- Create: `.github/workflows/pages.yml`
- Create: `.cursor/rules/always-push-github.mdc`

**Interfaces:**
- Theme ids: `kuromi`, `melody`, `cinnamoroll`。
- Shortcut target: GitHub Pages URL only；IconLocation: `web/icons/piggy-v1.ico`。

- [ ] 核對並複製使用者 `F:\Dropbox\Dropbox\coin` 素材，不重畫金幣。
- [ ] 建立三套 CSS variables；限動框、blobs、選中 pill、愛心及確認全部使用同組停點。
- [ ] 產生三色原創 PiggyBank apple-touch-icon 與新檔名 ico。
- [ ] 啟動本機 vault，執行完整 API 測試、UI contract、SQLite invariant checker。
- [ ] 在 Ai 桌驗證桌面尺寸；以行動 viewport 驗證 iPhone/iPad 鍵盤、操作卡、敲擊及倉庫分頁。
- [ ] 建立 GitHub 公開 repo，以 `.github/workflows/pages.yml` 從 `main` 上傳 `web/` 到 Pages，更新 `config.js` tunnel origin 與所有 `?v=`。
- [ ] 執行 `ensure_shortcut.ps1`，逐顆核對使用者／公用桌面 `.lnk` 的 URL 與 `IconLocation`。
- [ ] `git status --short` 確認無 data/secrets，執行完整驗證後 commit 並 push `origin main`。
