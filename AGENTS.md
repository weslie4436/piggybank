# PiggyBank Collaboration Rules

## 專案一句話

孩子每天領零用錢養唯一一隻撲滿，消費時點儲蓄金額並由父母在同一台裝置輸入 PIN 核准。

跨工具家規（Cursor／Claude Code／Codex 同一份）：`F:\knowledge\harness\HOUSE.md`。改規則／技能必走 `F:\knowledge\harness\CHANGE.md`。

## 入口與資料邊界

- 唯一使用者入口是 GitHub Pages；桌機、iPad、iPhone 共用同一網址。
- Pages 只放靜態門面。**帳本跑在孩子的裝置上**（`web/vault-local.js`＋IndexedDB，開頁立刻可用），每次變動後由 `web/cloud.js` 用入口鑰匙加密，自動備份到 `config.js` 裡 `PIGGY_CLOUD.relays` 列的公開中繼站。Safari 被清掉或換裝置，用同一個 `?k=` 連結就會自動拿回來。不需要任何帳號、權杖，也不需要家裡電腦開著。
- 家長手機掃 QR 開的 `exchange.html` **不存任何帳**：它透過 `cloud.js` 的核准通道把密碼與備註送到孩子的裝置，由孩子裝置上的帳本驗證、記帳、回覆。所以核准時孩子的畫面要停在 QR 上、兩台都要有網路。
- 保險：`cloud/archive.mjs`＋`cloud/backup.yml` 是要裝在 `weslie4436/piggybank-data` 的排程（每半小時把加密備份抄進 `backup/`，並補回中繼站）。`cloud.js` 在中繼站找不到時會讀那份。
- `piggybank-data/vault.json` 是舊的公開帳本，只在裝置完全沒資料時當開戶底稿讀一次，**不再寫入**。不要再做「每台貼 GitHub 權杖」。
- 禁止把 exe、bat、cmd 當產品入口。
- `web/vault-local.js` 就是保險庫；`window.VAULT_ORIGIN` 保持空字串。不要再讓 `keep_vault` 覆寫成 trycloudflare。
- 沒被雲端對過的帳本不准往上寫（`cloudChecked`）：新裝置一定先問雲端，版號（`child.revision`）高的贏。改同步邏輯前先讀 `vault-local.js` 的「雲端備份」段。

## 門面

- 門面用語與幾何見 skill `fami-shared-ui`；三端細節走 `ios-home-web`。
- 返回、確認、操作卡、問句卡、齒輪、等待、首頁頭全部沿用共用件。
- **v3（2026-11-24 起）孩子主畫面＝`web/kid.js`＋`web/kid.css`**；`door.js`／`piggy.css`／`adventure.*` 只剩 `hey.html` 邀請頁在用，主畫面不再載入（探險模式先下架）。
- 主畫面：天空＋草地場景，大撲滿站在草地上（點了會 Q 彈、冒愛心；有錢可領時頭上跳金幣，點小豬就等於按領取）＋存款卡（大數字＋用真實面額排出來的硬幣盤）＋金色「領取」大鈕（獎金是紫色）＋粉紅「我要買東西」＋存錢紀錄；右上鎖頭＝家長（PIN → 發額外獎金／每天零用錢）；名字旁的小雲＝雲端備份狀態。
- 效能守則：動畫只動 transform／opacity；抽屜開著時背景場景暫停（`body.sheet-open`）；中文字用系統字體，只有數字載 Baloo 2。
- 動畫全部自製（CSS spring、金幣飛行 Web Animations、canvas 彩帶），不加外部套件；尊重 `prefers-reduced-motion`。
- 家長核准頁 `exchange.html` 沿用 `exchange.js` 邏輯與 id，只換外觀（`kid.css`）。
- 撲滿與金幣使用使用者提供素材。

## 第一版經濟規則

- 永遠只有一隻撲滿；沒有倉庫、沒有養豬進度、沒有容量上限文案。
- 每天下午 4 點（Asia/Taipei）重置可領的零用錢，預設每天 30 元；孩子手動領取。新帳號先有 7 天份（每天 30 元）可領。
- 已領入的錢直接灌進這隻撲滿。
- 消費時點儲蓄金額，用數字門輸入金額後出現 QR。父母用手機掃碼，在手機輸入 PIN 與備註核准。存款夠就能花。輸入超過存款時紅字警告且購物鍵不能按。核准時從這筆存款扣除，剩下的錢留在同一隻撲滿。父母核准前只保留，不永久扣除。第一次輸入的六位數會成為家長密碼。

## 帳務硬規則

- 孩子裝置上的 `vault-local.js` 帳本是真相（雲端是它的加密備份）；畫面與動畫（`kid.js`）不得自行推算最終餘額。
- 同週期只能領一次、同一筆消費只能完成一次、餘額不得為負。
- 帳本只追加；更正以反向紀錄完成，不刪改歷史。
- 日期一律以 Asia/Taipei 判定。
- Safari 與「加入主畫面」不共用儲存：入口鑰匙必須留在網址 `?k=`。

## Git 與部署

- 只在 `main` 工作，禁止 PR。
- Pages 檔驗證後提高 `?v=`，commit 並 push `origin main`，再把 `web/` 發到 `gh-pages`。
- 不提交 `data/`、SQLite、PIN、個人鑰匙明文。Claude／Codex 請一併讀 `.cursor/rules/`。
