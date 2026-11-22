/**
 * Pages-only vault. Ledger lives in this browser (IndexedDB), not on a PC.
 */
(function () {
  const DB_NAME = "piggybank-local";
  const STORE = "kv";
  const VAULT_KEY = "vault";
  const ALLOWANCE = 30;
  const STARTER_DAYS = 7;
  const PIN_ITERS = 100000;
  const PAGES = "https://weslie4436.github.io/piggybank";
  const SEED = [
    { id: "child1", display_name: "小明", token_hash: "b9909171a4c072645e7a51f9924b7df6aaddb528576c82d387679616a47fee04", balance: 10336 },
    { id: "c7b331fd8f1093916", display_name: "小雞", token_hash: "a4321f74d4eea532251a90bba43bf7f55a5dd7d2b58a16e51d706181d76716fc", balance: 100 },
    { id: "cb3b8ea59f565e3e3", display_name: "章小恬", token_hash: "0de7096496d8abc4317fb7199f09576acebeb998e587c404c892b7393e1071fa", balance: 5 },
    { id: "cde28ad3876f3aa1e", display_name: "小毛子", token_hash: "ca7d120df5dca3e57d1962fb5c98a3ec643905dc9a2572b4b3b43b82f6290009", balance: 210 },
    { id: "c2e00001cd49ba802", display_name: "阿狗", token_hash: "655a35a70a073f2d47f8dddf94aa7d68d91b1fb66498147e80dc3b4c2cf741b8", balance: 205 },
    { id: "c469f94cef1303499", display_name: "給給", token_hash: "d2b736b7c7c071b03a67cb3c3c0984f3d0f2796303d698ba5fd619a384879edb", balance: 210 },
    { id: "c15a0e238b8882f07", display_name: "北投大魔王", token_hash: "e963eee3d6969a4d69cbfe3310a9d043f20b7d097a00b9d7e3114d2ee2dc53bf", balance: 1285 },
  ];

  let chain = Promise.resolve();
  let dbp = null;

  function enqueue(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(function () {}, function () {});
    return run;
  }

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function idbGet(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(VAULT_KEY);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbSet(db, value) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, VAULT_KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function taipeiParts(d) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d || new Date());
    const g = {};
    parts.forEach(function (p) { if (p.type !== "literal") g[p.type] = p.value; });
    return g;
  }

  function taipeiNow() {
    const g = taipeiParts(new Date());
    return new Date(g.year + "-" + g.month + "-" + g.day + "T" + g.hour + ":" + g.minute + ":" + g.second + "+08:00");
  }

  function iso(d) {
    const g = taipeiParts(d || new Date());
    return g.year + "-" + g.month + "-" + g.day + "T" + g.hour + ":" + g.minute + ":" + g.second + "+08:00";
  }

  function ymd(d) {
    return iso(d).slice(0, 10);
  }

  function dueAt(dateStr) {
    return new Date(dateStr + "T16:00:00+08:00");
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00+08:00");
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
  }

  function starterEffective(now) {
    const today = ymd(now);
    if (dueAt(today) <= now) return addDays(today, -(STARTER_DAYS - 1));
    return addDays(today, -STARTER_DAYS);
  }

  function hex(buf) {
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function unb64(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return hex(buf);
  }

  function newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return b64(bytes);
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return newToken().replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  }

  function http(status, body) {
    return {
      res: { ok: status >= 200 && status < 300, status: status },
      j: body,
    };
  }

  function fail(status, code, message) {
    return http(status, { error: code, message: message });
  }

  function domain(code, message) {
    const status = code === "bad_pin" || code === "invalid_invite" ? 401
      : code === "pin_locked" ? 423
      : /_not_found$/.test(code) ? 404
      : 409;
    return fail(status, code, message);
  }

  function emptyVault() {
    return {
      revision: 1,
      inviteToken: newToken(),
      inviteTokenHash: "",
      guides: { foot: 88, coin: 22 },
      children: [],
    };
  }

  async function loadVault() {
    const db = await openDb();
    let vault = await idbGet(db);
    if (!vault) {
      vault = emptyVault();
      vault.inviteTokenHash = await sha256(vault.inviteToken);
      await idbSet(db, vault);
    }
    if (!vault.inviteTokenHash && vault.inviteToken) {
      vault.inviteTokenHash = await sha256(vault.inviteToken);
    }
    if (!vault.guides) vault.guides = { foot: 88, coin: 22 };
    if (!Array.isArray(vault.children)) vault.children = [];
    return { db: db, vault: vault };
  }

  async function saveVault(db, vault) {
    vault.revision = (vault.revision || 0) + 1;
    await idbSet(db, vault);
  }

  function bump(child) {
    child.revision = (child.revision || 0) + 1;
    return child.revision;
  }

  function newChild(id, name, tokenHash, now, balance) {
    const pigId = uid();
    const ruleId = 1;
    const child = {
      id: id,
      displayName: name,
      tokenHash: tokenHash,
      theme: "melody",
      pinHash: "",
      pinFailures: 0,
      pinLockedUntil: "",
      revision: 1,
      cover: "",
      backdrop: "",
      coverRev: 0,
      backdropRev: 0,
      adventureUnlimited: false,
      allowanceRules: [{
        id: ruleId,
        amount: ALLOWANCE,
        period: "daily",
        weekday: null,
        monthday: null,
        effective_date: starterEffective(now),
        created_at: iso(now),
      }],
      claims: [],
      grants: [],
      pigs: [{
        id: pigId,
        tier_id: "basic-150",
        status: "growing",
        capacity: 150,
        value: Math.max(0, Number(balance) || 0),
        hit_count: 5,
        daily_yield: 1,
        yield_cap: 3,
        pending_yield: 0,
        page_no: null,
        slot_no: null,
        reserved_exchange_id: null,
        created_at: iso(now),
      }],
      ledger: [],
      exchanges: [],
      adventure: null,
    };
    if (child.pigs[0].value > 0) {
      child.ledger.push({
        id: uid(),
        kind: "allowance_claim",
        amount: child.pigs[0].value,
        balance_after: child.pigs[0].value,
        note: "開戶帶入",
        metadata: "{}",
        created_at: iso(now),
        revision: 1,
      });
    }
    return child;
  }

  function livePig(child) {
    return child.pigs.find(function (p) {
      return p.status === "growing" || p.status === "full" || p.status === "reserved";
    }) || null;
  }

  function totalOf(child) {
    return child.pigs.reduce(function (sum, p) {
      if (p.status === "growing" || p.status === "full" || p.status === "reserved") return sum + (p.value || 0);
      return sum;
    }, 0);
  }

  function clampGuide(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("guide must be a number");
    return Math.min(96, Math.max(4, n));
  }

  function eligiblePeriods(child, now) {
    const rules = (child.allowanceRules || []).slice().sort(function (a, b) {
      return String(a.effective_date).localeCompare(String(b.effective_date)) || a.id - b.id;
    });
    if (!rules.length) return [];
    const claimed = {};
    (child.claims || []).forEach(function (c) { claimed[c.period_key] = 1; });
    const today = ymd(now);
    let due = rules[0].effective_date;
    const out = [];
    function active(d) {
      let pick = rules[0];
      for (let i = 0; i < rules.length; i++) {
        if (rules[i].effective_date <= d) pick = rules[i];
      }
      return pick;
    }
    function isDue(rule, d) {
      if (rule.period === "daily") return true;
      const dt = new Date(d + "T12:00:00+08:00");
      if (rule.period === "weekly") {
        const py = (dt.getUTCDay() + 6) % 7;
        return py === rule.weekday;
      }
      if (rule.period === "monthly") return Number(d.slice(8, 10)) === rule.monthday;
      return false;
    }
    while (dueAt(due) <= now) {
      const rule = active(due);
      const key = due;
      if (isDue(rule, due) && !claimed[key]) {
        out.push({
          period_key: key,
          rule_id: rule.id,
          amount: rule.amount,
          due_date: due,
          claim_kind: due === today ? "on_time" : "makeup",
        });
      }
      due = addDays(due, 1);
    }
    return out;
  }

  function nextAllowance(child, now) {
    const rules = (child.allowanceRules || []).slice().sort(function (a, b) {
      return String(a.effective_date).localeCompare(String(b.effective_date)) || a.id - b.id;
    });
    if (!rules.length) return null;
    const claimed = {};
    (child.claims || []).forEach(function (c) { claimed[c.period_key] = 1; });
    function active(d) {
      let pick = rules[0];
      for (let i = 0; i < rules.length; i++) {
        if (rules[i].effective_date <= d) pick = rules[i];
      }
      return pick;
    }
    function isDue(rule, d) {
      if (rule.period === "daily") return true;
      const dt = new Date(d + "T12:00:00+08:00");
      if (rule.period === "weekly") {
        const py = (dt.getUTCDay() + 6) % 7;
        return py === rule.weekday;
      }
      if (rule.period === "monthly") return Number(d.slice(8, 10)) === rule.monthday;
      return false;
    }
    let due = ymd(now);
    if (dueAt(due) <= now) due = addDays(due, 1);
    for (let i = 0; i < 400; i++) {
      const rule = active(due);
      if (isDue(rule, due) && !claimed[due] && dueAt(due) > now) return dueAt(due);
      due = addDays(due, 1);
    }
    return null;
  }

  async function hashPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: PIN_ITERS },
      key,
      256
    );
    return "pbkdf2$" + PIN_ITERS + "$" + b64(salt) + "$" + b64(bits);
  }

  async function verifyPin(pin, encoded) {
    if (!/^[0-9]{6}$/.test(pin) || !encoded || encoded.indexOf("pbkdf2$") !== 0) return false;
    const parts = encoded.split("$");
    if (parts.length !== 4) return false;
    const iters = Number(parts[1]);
    const salt = unb64(parts[2]);
    const expected = unb64(parts[3]);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iters },
      key,
      256
    ));
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  }

  async function authorize(child, pin, now) {
    if (!/^[0-9]{6}$/.test(pin || "")) {
      throw { http: fail(400, "validation_error", "PIN must be exactly six ASCII digits") };
    }
    if (!child.pinHash) {
      child.pinHash = await hashPin(pin);
      child.pinFailures = 0;
      child.pinLockedUntil = "";
      return;
    }
    if (child.pinLockedUntil && now < new Date(child.pinLockedUntil)) {
      throw { http: domain("pin_locked", "家長密碼已暫時鎖定") };
    }
    if (child.pinLockedUntil) child.pinFailures = 0;
    if (!(await verifyPin(pin, child.pinHash))) {
      child.pinFailures = (child.pinFailures || 0) + 1;
      if (child.pinFailures >= 3) {
        child.pinLockedUntil = iso(new Date(now.getTime() + 10 * 60 * 1000));
      }
      throw { http: domain("bad_pin", "家長密碼錯誤") };
    }
    child.pinFailures = 0;
    child.pinLockedUntil = "";
  }

  function readerOf(child) {
    return {
      id: child.id,
      display_name: child.displayName,
      theme: child.theme || "melody",
      has_cover: !!child.cover,
      cover_rev: child.coverRev || 0,
      has_backdrop: !!child.backdrop,
      backdrop_rev: child.backdropRev || 0,
    };
  }

  function pendingGrants(child) {
    return (child.grants || []).filter(function (g) { return !g.claimed_at; }).map(function (g) {
      return { id: g.id, amount: g.amount, note: g.note, is_bonus: !!g.is_bonus };
    });
  }

  function publicPig(pig) {
    if (!pig) return null;
    return {
      id: pig.id,
      tier_id: pig.tier_id,
      status: pig.status,
      capacity: pig.capacity,
      value: pig.value,
      hit_count: pig.hit_count,
      daily_yield: pig.daily_yield,
      yield_cap: pig.yield_cap,
      pending_yield: pig.pending_yield || 0,
      page_no: pig.page_no,
      slot_no: pig.slot_no,
    };
  }

  function expireExchanges(child, now) {
    let changed = false;
    (child.exchanges || []).forEach(function (ex) {
      if (ex.status === "pending" && now >= new Date(ex.expires_at)) {
        ex.status = "expired";
        changed = true;
        child.pigs.forEach(function (p) {
          if (p.reserved_exchange_id === ex.id) {
            p.status = "growing";
            p.reserved_exchange_id = null;
          }
        });
      }
    });
    return changed;
  }

  function adventureDayKey(now) {
    const shifted = new Date(now.getTime() - 16 * 60 * 60 * 1000);
    return ymd(shifted);
  }

  function seeded(str) {
    let a = 2166136261;
    for (let i = 0; i < str.length; i++) {
      a ^= str.charCodeAt(i);
      a = Math.imul(a, 16777619);
    }
    a >>>= 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeProblem(rand, hard, forbidden) {
    for (let n = 0; n < 40; n++) {
      let prompt, answer;
      if (hard) {
        if (rand() < 0.5) {
          const left = 18 + Math.floor(rand() * 63);
          const right = 12 + Math.floor(rand() * 28);
          prompt = left + "+" + right;
          answer = left + right;
        } else {
          const left = 40 + Math.floor(rand() * 60);
          const right = 11 + Math.floor(rand() * Math.min(29, left - 12));
          prompt = left + "−" + right;
          answer = left - right;
        }
      } else {
        const kind = Math.floor(rand() * 3);
        if (kind === 0) {
          const left = 1 + Math.floor(rand() * 20);
          const right = 1 + Math.floor(rand() * 20);
          prompt = left + "+" + right;
          answer = left + right;
        } else if (kind === 1) {
          const left = 8 + Math.floor(rand() * 33);
          const right = 1 + Math.floor(rand() * left);
          prompt = left + "−" + right;
          answer = left - right;
        } else {
          const left = 2 + Math.floor(rand() * 4);
          const right = 2 + Math.floor(rand() * 8);
          prompt = left + "×" + right;
          answer = left * right;
        }
      }
      if (answer >= 0 && forbidden.indexOf(answer) < 0) return { prompt: prompt, answer: answer };
    }
    return { prompt: "1+1", answer: 2 };
  }

  function ensureAdventure(child, now) {
    const dayKey = adventureDayKey(now);
    if (child.adventure && child.adventure.day_key === dayKey && (child.adventure.monsters || []).length) {
      return child.adventure;
    }
    const rand = seeded(child.id + ":" + dayKey + ":piggy-adventure-v2:" + (child.adventurePractice || 0));
    const waveCount = rand() < 0.5 ? 3 : 5;
    const monsters = [];
    const used = [];
    for (let w = 0; w < waveCount; w++) {
      const size = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < size; s++) {
        const elite = false;
        const hp = elite ? 2 : 1;
        const prompts = [];
        const answers = [];
        for (let h = 0; h < hp; h++) {
          const p = makeProblem(rand, elite, used);
          used.push(p.answer);
          prompts.push(p.prompt);
          answers.push(p.answer);
        }
        monsters.push({
          monster_id: "w" + w + "s" + s,
          wave_no: w,
          slot_no: s,
          is_elite: 0,
          hp_max: hp,
          hits: 0,
          prompts: prompts,
          answers: answers,
          reward: 1,
          solved_at: null,
          grant_id: null,
        });
      }
    }
    const loot = 18 + Math.floor(rand() * 13);
    const each = Math.max(1, Math.floor(loot / monsters.length));
    let remain = loot - each * monsters.length;
    monsters.forEach(function (m, i) {
      m.reward = each + (i < remain ? 1 : 0);
    });
    child.adventure = {
      day_key: dayKey,
      wave_count: waveCount,
      loot_total: loot,
      player_hp: 5,
      completed_at: null,
      monsters: monsters,
      hands: {},
    };
    return child.adventure;
  }

  function currentWave(adv) {
    const living = (adv.monsters || []).filter(function (m) { return !m.solved_at; });
    if (!living.length) return Math.max(0, (adv.wave_count || 1) - 1);
    return Math.min.apply(null, living.map(function (m) { return m.wave_no; }));
  }

  function ensureHand(child, adv, wave) {
    if (adv.hands[wave]) return adv.hands[wave];
    const rand = seeded(child.id + ":" + adv.day_key + ":hand:" + wave);
    const living = adv.monsters.filter(function (m) { return m.wave_no === wave && !m.solved_at; });
    const needed = [];
    living.forEach(function (m) {
      m.answers.slice(m.hits).forEach(function (a) { needed.push(a); });
    });
    const used = needed.slice();
    const decoys = [];
    while (decoys.length < 2 && needed.length) {
      const base = needed[Math.floor(rand() * needed.length)];
      const cand = Math.max(0, base + [-3, -2, -1, 1, 2, 3, 10, -10][Math.floor(rand() * 8)]);
      if (used.indexOf(cand) < 0) {
        decoys.push(cand);
        used.push(cand);
      } else break;
    }
    const cards = needed.concat(decoys);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = cards[i];
      cards[i] = cards[j];
      cards[j] = t;
    }
    adv.hands[wave] = cards;
    return cards;
  }

  function publicAdventure(child, now) {
    const adv = ensureAdventure(child, now);
    const wave = currentWave(adv);
    const completed = !!adv.completed_at;
    const living = adv.monsters.filter(function (m) {
      return m.wave_no === wave && !m.solved_at;
    });
    const hand = completed || !living.length ? [] : ensureHand(child, adv, wave);
    const earned = adv.monsters.reduce(function (s, m) {
      return s + (m.solved_at ? m.reward : 0);
    }, 0);
    return {
      day_key: adv.day_key,
      wave_count: adv.wave_count,
      current_wave: wave,
      player_hp: adv.player_hp,
      player_hp_max: 5,
      loot_total: adv.loot_total,
      earned_today: earned,
      reward_limit: 30,
      completed: completed,
      game_over: adv.player_hp <= 0 && !completed,
      monsters: living.map(function (m) {
        return {
          id: m.monster_id,
          elite: !!m.is_elite,
          prompt: m.prompts[m.hits] || "",
          hp: m.hp_max - m.hits,
          hp_max: m.hp_max,
          reward: m.reward,
        };
      }),
      hand: hand,
    };
  }

  function stateOf(vault, child, now) {
    expireExchanges(child, now);
    const nxt = nextAllowance(child, now);
    const pig = livePig(child);
    return Object.assign({
      revision: child.revision || vault.revision,
      now: iso(now),
      total: totalOf(child),
      active_pig: publicPig(pig),
      next_allowance_at: nxt ? iso(nxt) : null,
      claimable_periods: eligiblePeriods(child, now).map(function (p) {
        return {
          period_key: p.period_key,
          rule_id: p.rule_id,
          amount: p.amount,
          due_date: p.due_date,
          claim_kind: p.claim_kind,
        };
      }),
      pending_grants: pendingGrants(child),
      pig_guides: vault.guides,
      adventure_unlimited: !!child.adventureUnlimited,
    }, readerOf(child));
  }

  function parseQuery(path) {
    const i = path.indexOf("?");
    const q = {};
    if (i < 0) return { path: path, q: q };
    new URLSearchParams(path.slice(i + 1)).forEach(function (v, k) { q[k] = v; });
    return { path: path.slice(0, i), q: q };
  }

  async function parseBody(opts) {
    if (!opts || opts.body == null) return {};
    if (typeof FormData !== "undefined" && opts.body instanceof FormData) return { form: opts.body };
    if (typeof opts.body === "string") {
      if (!opts.body) return {};
      return JSON.parse(opts.body);
    }
    return opts.body;
  }

  function findByHash(vault, digest) {
    return vault.children.find(function (c) { return c.tokenHash === digest; }) || null;
  }

  function findExchange(vault, tokenHash) {
    for (let i = 0; i < vault.children.length; i++) {
      const child = vault.children[i];
      const ex = (child.exchanges || []).find(function (e) { return e.token_hash === tokenHash; });
      if (ex) return { child: child, exchange: ex };
    }
    return null;
  }

  async function requireChild(vault, key) {
    if (!key) throw { http: fail(401, "unauthorized", "需要個人入口鑰匙") };
    const digest = await sha256(key);
    let child = findByHash(vault, digest);
    if (child) return child;
    const now = taipeiNow();
    const seededChild = SEED.find(function (s) { return s.token_hash === digest; });
    if (seededChild) {
      child = newChild(seededChild.id, seededChild.display_name, digest, now, seededChild.balance);
      vault.children.push(child);
      vault._created = true;
      return child;
    }
    throw { http: fail(401, "unauthorized", "入口鑰匙無效") };
  }

  function feed(child, amount, now) {
    const pig = child.pigs.find(function (p) { return p.status === "growing"; });
    if (!pig) throw { http: domain("pig_reserved", "這隻撲滿正在兌換中") };
    pig.value += amount;
  }

  function addLedger(child, kind, amount, note, meta, now) {
    const revision = bump(child);
    child.ledger.push({
      id: uid(),
      kind: kind,
      amount: amount,
      balance_after: totalOf(child),
      note: note,
      metadata: JSON.stringify(meta || {}),
      created_at: iso(now),
      revision: revision,
    });
    return revision;
  }

  function exchangeStatus(child, ex) {
    return {
      id: ex.id,
      status: ex.status,
      requested_amount: ex.requested_amount,
      change_amount: ex.change_amount,
      expires_at: ex.expires_at,
      completed_at: ex.completed_at || null,
      parent_note: ex.parent_note || null,
      revision: child.revision,
    };
  }

  async function handleInner(rawPath, key, opts) {
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const parsed = parseQuery(rawPath);
    const path = parsed.path;
    const q = parsed.q;
    const now = taipeiNow();
    const loaded = await loadVault();
    const db = loaded.db;
    const vault = loaded.vault;
    let body = {};
    let dirty = false;
    try {
      body = await parseBody(opts);
    } catch (e) {
      return fail(400, "invalid_json", "JSON 格式不正確");
    }

    function ok(data) {
      dirty = true;
      return finish(data);
    }

    function finish(data) {
      if (!dirty) return http(200, data);
      return saveVault(db, vault).then(function () { return http(200, data); });
    }

    try {
      if (path === "/api/health" && method === "GET") {
        return http(200, { ok: true });
      }

      if (path === "/api/door" && method === "GET") {
        if (!key) return fail(401, "unauthorized", "入口鑰匙無效");
        const digest = await sha256(key);
        if (vault.inviteTokenHash && digest === vault.inviteTokenHash) {
          return http(200, { kind: "invite" });
        }
        let child = findByHash(vault, digest);
        if (!child) {
          const seededChild = SEED.find(function (s) { return s.token_hash === digest; });
          if (seededChild) {
            child = newChild(seededChild.id, seededChild.display_name, digest, now, seededChild.balance);
            vault.children.push(child);
            return ok({ kind: "personal", reader: readerOf(child) });
          }
          return fail(401, "unauthorized", "入口鑰匙無效");
        }
        return http(200, { kind: "personal", reader: readerOf(child) });
      }

      if (path === "/api/join" && method === "POST") {
        const invite = key || "";
        const digest = invite ? await sha256(invite) : "";
        if (!vault.inviteTokenHash || digest !== vault.inviteTokenHash) {
          return domain("invalid_invite", "邀請連結無效");
        }
        const name = String((body && body.display_name) || "").trim();
        if (name.length < 1 || name.length > 20) {
          return fail(400, "validation_error", "display_name must contain 1 to 20 characters");
        }
        if (vault.children.some(function (c) { return c.displayName === name; })) {
          return domain("already_joined", "這個名字已經有個人頁，請用原本的連結打開");
        }
        const token = newToken();
        const tokenHash = await sha256(token);
        const id = vault.children.length ? "c" + uid().slice(0, 16) : "child1";
        const child = newChild(id, name, tokenHash, now, 0);
        vault.children.push(child);
        const url = PAGES + "/index.html?k=" + encodeURIComponent(token) + "#k=" + encodeURIComponent(token);
        return ok({ token: token, reader: readerOf(child), url: url });
      }

      if (path === "/api/exchange/resolve" && method === "GET") {
        const token = parsed.q.x || "";
        const digest = token ? await sha256(token) : "";
        const found = findExchange(vault, digest);
        if (!found) return domain("exchange_not_found", "找不到這筆兌換");
        if (expireExchanges(found.child, now)) dirty = true;
        const ex = found.exchange;
        return finish({
          id: ex.id,
          status: ex.status,
          requested_amount: ex.requested_amount,
          child_note: ex.child_note,
          total_pig_value: ex.total_pig_value,
          change_amount: ex.change_amount,
          expires_at: ex.expires_at,
          completed_at: ex.completed_at || null,
        });
      }

      if (path === "/api/exchange/approve" && method === "POST") {
        const token = String((body && body.x) || "");
        const pin = String((body && body.pin) || "");
        const note = String((body && body.parent_note) || "").trim();
        const digest = token ? await sha256(token) : "";
        const found = findExchange(vault, digest);
        if (!found) return domain("exchange_not_found", "找不到這筆兌換");
        const child = found.child;
        const ex = found.exchange;
        if (expireExchanges(child, now)) dirty = true;
        if (ex.status === "completed") {
          return finish({
            revision: child.revision,
            id: ex.id,
            status: "completed",
            spent: ex.requested_amount,
            change: ex.change_amount,
            total: ex.total_pig_value,
            parent_note: ex.parent_note,
          });
        }
        if (ex.status === "cancelled") return domain("exchange_cancelled", "這筆兌換已取消");
        if (ex.status === "expired") return domain("exchange_expired", "這筆兌換已過期");
        if (!note || note.length > 80) return fail(400, "validation_error", "parent_note must contain 1 to 80 characters");
        await authorize(child, pin, now);
        const pig = child.pigs.find(function (p) { return p.reserved_exchange_id === ex.id; });
        if (!pig || pig.status !== "reserved") return domain("exchange_conflict", "兌換狀態已變更");
        pig.value = ex.change_amount;
        pig.status = "growing";
        pig.reserved_exchange_id = null;
        ex.status = "completed";
        ex.parent_note = note;
        ex.completed_at = iso(now);
        addLedger(child, "exchange_spend", -ex.requested_amount, "消費：" + note, {
          exchange_id: ex.id,
          child_note: ex.child_note,
          parent_note: note,
        }, now);
        return ok({
          revision: child.revision,
          id: ex.id,
          status: "completed",
          spent: ex.requested_amount,
          change: ex.change_amount,
          total: ex.total_pig_value,
          parent_note: note,
        });
      }

      const child = await requireChild(vault, key);
      if (vault._created) {
        dirty = true;
        delete vault._created;
      }
      if (expireExchanges(child, now)) dirty = true;

      if (path === "/api/state" && method === "GET") {
        return finish(stateOf(vault, child, now));
      }
      if (path === "/api/adventure" && method === "GET") {
        const had = child.adventure && child.adventure.day_key === adventureDayKey(now);
        const data = publicAdventure(child, now);
        if (!had) dirty = true;
        return finish(data);
      }
      if (path === "/api/ledger" && method === "GET") {
        let limit = Number(q.limit || 50);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          return fail(400, "validation_error", "limit must be between 1 and 100");
        }
        let rows = (child.ledger || []).slice().sort(function (a, b) {
          return b.revision - a.revision;
        });
        if (q.before) {
          const before = Number(q.before);
          rows = rows.filter(function (r) { return r.revision < before; });
        }
        return finish(rows.slice(0, limit).map(function (r) {
          return {
            id: r.id,
            kind: r.kind,
            amount: r.amount,
            balance_after: r.balance_after,
            note: r.note,
            metadata: r.metadata,
            created_at: r.created_at,
            revision: r.revision,
          };
        }));
      }
      if (path === "/api/exchange/status" && method === "GET") {
        const ex = (child.exchanges || []).find(function (e) { return e.id === q.id; });
        if (!ex) return domain("exchange_not_found", "找不到這筆兌換");
        return finish(exchangeStatus(child, ex));
      }

      if (path === "/api/claim" && method === "POST") {
        if (body.grant_id) {
          const pending = pendingGrants(child);
          const bonuses = pending.filter(function (g) { return g.is_bonus; });
          const selected = pending.find(function (g) { return g.id === body.grant_id; });
          if (!selected) return domain("not_claimable", "這一筆不能領取");
          if (bonuses.length && selected.id !== bonuses[0].id) return domain("bonus_waiting", "請先領取獎金");
          const row = child.grants.find(function (g) { return g.id === selected.id && !g.claimed_at; });
          row.claimed_at = iso(now);
          feed(child, selected.amount, now);
          const forest = child.adventure && (child.adventure.monsters || []).some(function (m) { return m.grant_id === selected.id; });
          addLedger(child, forest ? "adventure_reward" : (selected.is_bonus ? "bonus_claim" : "allowance_claim"), selected.amount, selected.note || (selected.is_bonus ? "特別獎金" : "零用錢"), { grant_id: selected.id, is_bonus: selected.is_bonus }, now);
          return ok({ revision: child.revision, grant_id: selected.id, amount: selected.amount, is_bonus: selected.is_bonus });
        }
        const period = String(body.period_key || "");
        if (pendingGrants(child).some(function (g) { return g.is_bonus; })) {
          return domain("bonus_waiting", "請先領取獎金");
        }
        const eligible = eligiblePeriods(child, now);
        const selected = eligible.find(function (p) { return p.period_key === period; });
        if (!selected) return domain("not_claimable", "這一期不能領取");
        child.claims.push({
          id: uid(),
          rule_id: selected.rule_id,
          period_key: selected.period_key,
          amount: selected.amount,
          claim_kind: selected.claim_kind,
          claimed_at: iso(now),
        });
        feed(child, selected.amount, now);
        addLedger(child, "allowance_claim", selected.amount, selected.claim_kind === "on_time" ? "今日零用錢" : "補領零用錢", { period_key: selected.period_key, claim_kind: selected.claim_kind, rule_id: selected.rule_id }, now);
        return ok({ revision: child.revision, period_key: selected.period_key, amount: selected.amount, claim_kind: selected.claim_kind });
      }

      if (path === "/api/grant" && method === "POST") {
        await authorize(child, String(body.pin || ""), now);
        const amount = body.amount;
        if (!Number.isInteger(amount) || amount < 1) return fail(400, "validation_error", "amount must be a positive integer");
        const note = String(body.note || "").trim();
        if (note.length > 80) return fail(400, "validation_error", "note must be at most 80 characters");
        const grant = {
          id: uid(),
          amount: amount,
          note: note,
          is_bonus: !!body.is_bonus,
          created_at: iso(now),
          claimed_at: null,
        };
        child.grants.push(grant);
        bump(child);
        return ok({ id: grant.id, amount: amount, note: note, is_bonus: grant.is_bonus, revision: child.revision });
      }

      if (path === "/api/exchange/reserve" && method === "POST") {
        const amount = body.amount;
        const note = String(body.child_note || "").trim();
        if (!Number.isInteger(amount) || amount <= 0) return fail(400, "validation_error", "amount must be a positive integer");
        if (!note || note.length > 80) return fail(400, "validation_error", "child_note must contain 1 to 80 characters");
        const pig = livePig(child);
        if (!pig) return domain("pig_not_breakable", "目前無法消費");
        if (pig.status === "reserved") return domain("pig_reserved", "這筆消費還在等待父母核准");
        if (pig.value < amount) return domain("insufficient_pigs", "錢包金額不足");
        const token = newToken();
        const ex = {
          id: uid(),
          token: token,
          token_hash: await sha256(token),
          status: "pending",
          requested_amount: amount,
          child_note: note,
          parent_note: null,
          pig_ids: [pig.id],
          total_pig_value: pig.value,
          change_amount: pig.value - amount,
          expires_at: iso(new Date(now.getTime() + 15 * 60 * 1000)),
          created_at: iso(now),
          completed_at: null,
        };
        pig.status = "reserved";
        pig.reserved_exchange_id = ex.id;
        child.exchanges.push(ex);
        bump(child);
        return ok({
          revision: child.revision,
          id: ex.id,
          token: token,
          expires_at: ex.expires_at,
          requested_amount: amount,
          total_pig_value: ex.total_pig_value,
          change_amount: ex.change_amount,
          pig_ids: [pig.id],
          bonus_pages_at_risk: [],
          qr_url: PAGES + "/exchange.html?x=" + encodeURIComponent(token),
        });
      }

      if (path === "/api/exchange/cancel" && method === "POST") {
        const token = String((body && body.x) || "");
        const digest = token ? await sha256(token) : "";
        const ex = (child.exchanges || []).find(function (e) { return e.token_hash === digest; });
        if (!ex) return domain("exchange_not_found", "找不到這筆兌換");
        if (ex.status === "completed") return domain("exchange_completed", "這筆兌換已完成");
        if (ex.status === "cancelled" || ex.status === "expired") return http(200, exchangeStatus(child, ex));
        ex.status = "cancelled";
        child.pigs.forEach(function (p) {
          if (p.reserved_exchange_id === ex.id) {
            p.status = "growing";
            p.reserved_exchange_id = null;
          }
        });
        bump(child);
        return ok(exchangeStatus(child, ex));
      }

      if (path === "/api/settings/read" && method === "POST") {
        await authorize(child, String(body.pin || ""), now);
        const rule = (child.allowanceRules || []).slice().sort(function (a, b) {
          return String(b.effective_date).localeCompare(String(a.effective_date)) || b.id - a.id;
        })[0] || null;
        return ok({ theme: child.theme || "melody", allowance_rule: rule });
      }
      if (path === "/api/settings/allowance" && method === "PUT") {
        await authorize(child, String(body.pin || ""), now);
        const amount = body.amount;
        if (!Number.isInteger(amount) || amount < 1) return fail(400, "validation_error", "amount must be a positive integer");
        const period = String(body.period || "daily");
        const nextId = (child.allowanceRules || []).reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0) + 1;
        child.allowanceRules.push({
          id: nextId,
          amount: amount,
          period: period,
          weekday: body.weekday == null ? null : body.weekday,
          monthday: body.monthday == null ? null : body.monthday,
          effective_date: String(body.effective_date || ymd(now)),
          created_at: iso(now),
        });
        bump(child);
        return ok({ id: nextId, revision: child.revision });
      }
      if (path === "/api/settings/theme" && method === "PUT") {
        await authorize(child, String(body.pin || ""), now);
        const theme = String(body.theme || "");
        if ({ kuromi: 1, melody: 1, cinnamoroll: 1 }[theme] !== 1) {
          return fail(400, "validation_error", "invalid theme");
        }
        child.theme = theme;
        bump(child);
        return ok({ revision: child.revision, theme: theme });
      }
      if (path === "/api/settings/adventure-unlimited" && method === "PUT") {
        await authorize(child, String(body.pin || ""), now);
        child.adventureUnlimited = !!body.on;
        bump(child);
        return ok({ on: child.adventureUnlimited, revision: child.revision });
      }
      if (path === "/api/settings/guides" && method === "PUT") {
        await authorize(child, String(body.pin || ""), now);
        vault.guides = { foot: clampGuide(body.foot), coin: clampGuide(body.coin) };
        bump(child);
        return ok(vault.guides);
      }

      if (path === "/api/cover" && method === "POST") {
        const file = body.form && (body.form.get("cover") || body.form.get("file"));
        if (!file) return fail(400, "validation_error", "empty image");
        child.cover = await fileToJpeg(file, 360);
        child.coverRev = Date.now();
        bump(child);
        return ok(Object.assign(readerOf(child), { revision: child.revision }));
      }
      if (path === "/api/backdrop" && method === "POST") {
        const file = body.form && (body.form.get("backdrop") || body.form.get("file"));
        if (!file) return fail(400, "validation_error", "empty image");
        child.backdrop = await fileToJpeg(file, 960);
        child.backdropRev = Date.now();
        bump(child);
        return ok(Object.assign(readerOf(child), { revision: child.revision }));
      }

      if (path === "/api/adventure/enter" && method === "POST") {
        const adv = ensureAdventure(child, now);
        if (child.adventureUnlimited && adv.completed_at) {
          child.adventurePractice = (child.adventurePractice || 0) + 1;
          child.adventure = null;
        }
        const fresh = ensureAdventure(child, now);
        fresh.player_hp = 5;
        bump(child);
        return ok(publicAdventure(child, now));
      }
      if (path === "/api/adventure/play" && method === "POST") {
        const adv = ensureAdventure(child, now);
        if (adv.completed_at) return domain("adventure_complete", "今天的探險完成了");
        if (adv.player_hp <= 0) return domain("game_over", "先回銀行休息，再進森林");
        const monsterId = String(body.monster_id || "");
        const answer = body.answer;
        const wave = currentWave(adv);
        const monster = adv.monsters.find(function (m) { return m.monster_id === monsterId; });
        if (!monster || monster.solved_at || monster.wave_no !== wave) {
          return domain("monster_unavailable", "這隻怪已經不在場上");
        }
        const hand = ensureHand(child, adv, wave);
        if (hand.indexOf(answer) < 0) return fail(400, "validation_error", "answer must be in the hand");
        const expected = monster.answers[monster.hits];
        if (answer !== expected) {
          adv.player_hp -= 1;
          bump(child);
          return ok({
            correct: false,
            player_hp: adv.player_hp,
            game_over: adv.player_hp <= 0,
            defeated: false,
          });
        }
        const idx = hand.indexOf(answer);
        if (idx >= 0) hand.splice(idx, 1);
        monster.hits += 1;
        const defeated = monster.hits >= monster.hp_max;
        if (defeated) {
          monster.solved_at = iso(now);
          monster.grant_id = uid();
          child.grants.push({
            id: monster.grant_id,
            amount: monster.reward,
            note: "森林裡撿到 " + monster.reward + " 元",
            is_bonus: false,
            created_at: iso(now),
            claimed_at: null,
          });
          const remain = adv.monsters.filter(function (m) { return !m.solved_at; }).length;
          if (!remain) adv.completed_at = iso(now);
        }
        bump(child);
        return ok({
          correct: true,
          player_hp: adv.player_hp,
          game_over: false,
          defeated: defeated,
          reward: defeated ? monster.reward : 0,
          prompt: defeated ? "" : (monster.prompts[monster.hits] || ""),
        });
      }

      return fail(404, "not_found", "找不到這個 API");
    } catch (err) {
      if (err && err.http) return err.http;
      return fail(500, "internal_error", "保險庫暫時無法完成請求");
    }
  }

  function fileToJpeg(file, maxEdge) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("invalid image"));
      };
      img.src = url;
    });
  }

  window.PiggyLocal = {
    handle: function (path, key, opts) {
      return enqueue(function () { return handleInner(path, key, opts || {}); });
    },
    portraitUrl: function (kind, key, rev) {
      return enqueue(async function () {
        const loaded = await loadVault();
        if (!key) return "";
        const digest = await sha256(key);
        const child = findByHash(loaded.vault, digest);
        if (!child) return "";
        if (kind === "cover") return child.cover || "";
        if (kind === "backdrop") return child.backdrop || "";
        return "";
      });
    },
  };

  function install() {
    if (!window.FamiGate) return;
    window.FamiGate.api = function (path, key, opts) {
      return window.PiggyLocal.handle(path, key, opts || {});
    };
    const prevOrigin = window.FamiGate.origin;
    window.FamiGate.origin = function () {
      if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
      return prevOrigin ? prevOrigin() : "";
    };
  }

  if (window.FamiGate) install();
  else document.addEventListener("DOMContentLoaded", install);
})();
