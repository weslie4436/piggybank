# 小豬銀行（GitHub Pages 門面）

孩子在 iPhone／iPad Safari／桌機開的入口。帳本在家裡保險庫，不上這個庫。

線上入口：<https://theoldfathertw.github.io/piggybank/>

家裡保險庫（`python -m piggybank vault`，埠 8771）經 Cloudflare 隧道連上來。隧道網址寫進 `config.js` 的 `VAULT_ORIGIN`。鑰匙與 PIN 不進 git。
