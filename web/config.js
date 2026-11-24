window.VAULT_ORIGIN = "";
window.GITHUB_VAULT = {
  owner: "weslie4436",
  repo: "piggybank-data",
  path: "vault.json",
  branch: "main",
  token: ""
};
// 雲端備份與核准通道（cloud.js）。中繼站是公開服務，帳本內容一律先用入口鑰匙加密。
window.PIGGY_CLOUD = {
  relays: [
    "wss://nos.lol",
    "wss://relay.primal.net",
    "wss://nostr.mom",
    "wss://relay.nostr.net",
    "wss://purplerelay.com",
    "wss://nostr.bitcoiner.social"
  ],
  dTag: "piggybank:weslie4436",
  backupUrl: "https://raw.githubusercontent.com/weslie4436/piggybank-data/main/backup/",
  pages: "https://weslie4436.github.io/piggybank"
};
window.FAMIGATE_CONFIG = {
  appId: "piggybank",
  viewKeyStorage: "piggybank.viewKey",
  productLabel: "小豬銀行"
};
