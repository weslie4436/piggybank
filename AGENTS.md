# PiggyBank Collaboration Rules

## 專案一句話

孩子每天領零用錢養唯一一隻撲滿，消費時點儲蓄金額並由父母在同一台裝置輸入 PIN 核准。

跨工具家規（Cursor／Claude Code／Codex 同一份）：`F:\knowledge\harness\HOUSE.md`。改規則／技能必走 `F:\knowledge\harness\CHANGE.md`。

## 入口與資料邊界

- 唯一使用者入口是 GitHub Pages；桌機、iPad、iPhone 共用同一網址。
- Pages 只放靜態門面。帳本寫在 GitHub 儲庫 `weslie4436/piggybank-data` 的 `vault.json`（Safari 清掉也不會丟）。IndexedDB 只是快取。
- 禁止把 exe、bat、cmd 當產品入口。
- `web/vault-local.js` 就是保險庫；`window.VAULT_ORIGIN` 保持空字串。不要再讓 `keep_vault` 覆寫成 trycloudflare。

## 門面

- 門面用語與幾何見 skill `fami-shared-ui`；三端細節走 `ios-home-web`。
- 返回、確認、操作卡、問句卡、齒輪、等待、首頁頭全部沿用共用件。
- **v2（2026-11-22 起）孩子主畫面＝`web/kid.js`＋`web/kid.css`**；`door.js`／`piggy.css`／`adventure.*` 只剩 `hey.html` 邀請頁在用，主畫面不再載入（探險模式先下架）。
- 主畫面：大撲滿（點了會 Q 彈說話）＋存款大數字＋金色「領取」大鈕（獎金是紫色）＋粉紅「我要買東西」＋存錢紀錄；右上鎖頭＝家長（PIN → 發額外獎金／每天零用錢）。
- 動畫全部自製（CSS spring、金幣飛行 Web Animations、canvas 彩帶），不加外部套件；尊重 `prefers-reduced-motion`。
- 家長核准頁 `exchange.html` 沿用 `exchange.js` 邏輯與 id，只換外觀（`kid.css`）。
- 撲滿與金幣使用使用者提供素材。

## 第一版經濟規則

- 永遠只有一隻撲滿；沒有倉庫、沒有養豬進度、沒有容量上限文案。
- 每天下午 4 點（Asia/Taipei）重置可領的零用錢，預設每天 30 元；孩子手動領取。新帳號先有 7 天份（每天 30 元）可領。
- 已領入的錢直接灌進這隻撲滿。
- 消費時點儲蓄金額，用數字門輸入金額後出現 QR。父母用手機掃碼，在手機輸入 PIN 與備註核准。存款夠就能花。輸入超過存款時紅字警告且購物鍵不能按。核准時從這筆存款扣除，剩下的錢留在同一隻撲滿。父母核准前只保留，不永久扣除。第一次輸入的六位數會成為家長密碼。

## 帳務硬規則

- GitHub 上的 `vault.json` 是帳本真相；前端動畫不得自行推算最終餘額。
- 同週期只能領一次、同一筆消費只能完成一次、餘額不得為負。
- 帳本只追加；更正以反向紀錄完成，不刪改歷史。
- 日期一律以 Asia/Taipei 判定。
- Safari 與「加入主畫面」不共用儲存：入口鑰匙必須留在網址 `?k=`。

## Git 與部署

- 只在 `main` 工作，禁止 PR。
- Pages 檔驗證後提高 `?v=`，commit 並 push `origin main`，再把 `web/` 發到 `gh-pages`。
- 不提交 `data/`、SQLite、PIN、個人鑰匙明文。Claude／Codex 請一併讀 `.cursor/rules/`。
