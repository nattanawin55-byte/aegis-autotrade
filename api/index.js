/* AEGIS AUTO — backend (Vercel serverless, single function)
   ระบบ: ลูกค้าโอน 15,900 ฿ → AI อ่านสลิปตรวจอัตโนมัติ → ออกโทเคน → ตั้งเป้าทุน/กำไร/วัน
   → EA ตัวเชื่อมบน MT5 ดึงแผน + ถาม "สมอง" (ข่าว/แนวโน้ม) แล้วเทรดตามแผนตลอด 24 ชม. */
import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";

export const config = { maxDuration: 60 };

/* สร้าง client แบบขี้เกียจ — ถ้ายังไม่ตั้ง ENV ฟังก์ชันต้องไม่ล่มทั้งก้อน (ping/payinfo ต้องยังตอบได้) */
let _sb = null;
function db() {
  if (!_sb) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error("ENV_MISSING");
    _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  }
  return _sb;
}

const PRICE = Number(process.env.AUTO_PRICE || 15900);
const BANK = { name: "กสิกรไทย (KBank)", acc: "083-3-21158-7", accPlain: "0833211587", holder: "ธนาวิล ไกกาจ" };
const MODEL = "claude-sonnet-5";

/* ---------- helpers ---------- */
const json = (res, code, obj) => { res.status(code).setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); };
const err = (res, code, msg, extra) => json(res, code, { error: msg, ...(extra || {}) });
const rndToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
const normPhone = (p) => String(p || "").replace(/[^0-9]/g, "");

/* key/value บนตาราง cache ของ Supabase (คีย์ขึ้นต้น at2: แยกจากระบบอื่นเด็ดขาด)
   สำคัญ: supabase-js ไม่ throw — ต้องเช็ค error เองไม่งั้นพังเงียบ */
async function kget(key) {
  const { data, error } = await db().from("cache").select("value").eq("key", "at2:" + key).maybeSingle();
  if (error) { console.error("KGET_ERR", key, error.message); throw new Error("db_read: " + error.message); }
  return data ? data.value : null;
}
async function kset(key, value) {
  const { error } = await db().from("cache").upsert({ key: "at2:" + key, value, updated_at: new Date().toISOString() });
  if (error) { console.error("KSET_ERR", key, error.message); throw new Error("db_write: " + error.message); }
  return value;
}

/* แคชความจำสั้นในตัวฟังก์ชัน + ตาราง cache */
const MEM = new Map();
async function cached(key, ttlMin, producer) {
  const m = MEM.get(key);
  if (m && Date.now() - m.at < 60000) return m.v;
  const row = await db().from("cache").select("value, updated_at").eq("key", "at2:" + key).maybeSingle();
  const d = row.data;
  if (d && d.value && Date.now() - new Date(d.updated_at).getTime() < ttlMin * 60000) {
    MEM.set(key, { v: d.value, at: Date.now() });
    return d.value;
  }
  try {
    const fresh = await producer();
    if (fresh && Object.keys(fresh).length) { MEM.set(key, { v: fresh, at: Date.now() }); await kset(key, fresh); return fresh; }
  } catch (e) { console.error("cached:" + key, e && e.message); }
  return d ? d.value : null;
}

/* ---------- Claude ---------- */
async function claude({ system, messages, tools, max_tokens = 1400, effort = "medium", signal }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages, ...(tools ? { tools } : {}), output_config: { effort } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "anthropic_error");
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}
const WEB = [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }];
function repairParse(txt) {
  try { return JSON.parse(txt); } catch {}
  const m = String(txt).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

/* ---------- แผนทบต้น (คณิตชุดเดียวกับตาราง Excel และ EA) ---------- */
function buildPlan(initial, target, days) {
  let rate = Math.pow(target / initial, 1 / days) - 1;
  let capped = false;
  if (rate > 1) { rate = 1; capped = true; }
  const rows = [];
  let bal = initial;
  for (let d = 1; d <= days; d++) {
    const profit = bal * rate;
    const lot = bal < 50 ? 0.01 : Math.floor(bal / 50) * 0.01;
    const pts = Math.round(profit / lot);
    const ddPct = bal < 50 ? 25 : bal < 500 ? 15 : 10;
    rows.push({ d, start: +bal.toFixed(2), profit: +profit.toFixed(2), end: +(bal + profit).toFixed(2), lot: +lot.toFixed(2), pts, ddPct, dd: +(bal * ddPct / 100).toFixed(2) });
    bal += profit;
  }
  return { rate, capped, rows, final: +bal.toFixed(2) };
}

/* ---------- ตรวจสลิปด้วย AI vision ---------- */
async function verifySlip(b64, mime) {
  const out = repairParse(await claude({
    max_tokens: 600,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
      { type: "text", text: `อ่านสลิปโอนเงินนี้อย่างละเอียด ตอบ JSON เท่านั้น {"amount":ตัวเลขจำนวนเงิน,"bank":"ธนาคารผู้โอน","receiver":"ชื่อผู้รับตามสลิป","receiverAcc":"เลขบัญชี/พร้อมเพย์ผู้รับตามที่แสดง","time":"วันเวลาที่โอน ISO 8601 +07:00","ref":"เลขอ้างอิงรายการ","looksReal":true,"suspicious":"สิ่งผิดปกติถ้ามี ไม่มีใส่ค่าว่าง"} looksReal = ดูเป็นสลิปจริงจากแอปธนาคารไทย ฟอนต์เลย์เอาต์ปกติ ไม่มีร่องรอยตัดต่อ` },
    ] }],
  }));
  if (!out) throw new Error("อ่านสลิปไม่สำเร็จ");
  return out;
}

/* ---------- สมองของ EA: แนวโน้ม + หน้าต่างข่าวแรง ---------- */
async function brainOutlook() {
  return cached("brain", 30, async () => repairParse(await claude({
    max_tokens: 900, tools: WEB,
    messages: [{ role: "user", content: `ตอนนี้ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} ค้นหาข่าว/ปัจจัยทองคำ XAUUSD ล่าสุด 1 ครั้ง แล้วประเมินแนวโน้มระยะสั้นสำหรับบอทเทรดรายวัน ตอบ JSON เท่านั้น
{"dir":"up|down|flat","score":-100..100,"summary":"เหตุผลสั้น ≤25 คำ","volatile":true|false}
score บวก = น่าจะขึ้น ลบ = น่าจะลง | volatile = ช่วงนี้ผันผวนรุนแรงผิดปกติควรเทรดระวัง` }],
  })));
}
async function brainCalendar() {
  return cached("cal", 720, async () => repairParse(await claude({
    max_tokens: 900, tools: WEB,
    messages: [{ role: "user", content: `วันนี้ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" })} ค้นหาปฏิทินเศรษฐกิจสหรัฐ 3 วันข้างหน้าที่กระทบทองคำแรง (impact สูงเท่านั้น เช่น NFP, CPI, FOMC, PPI, GDP, Powell) ตอบ JSON เท่านั้น {"e":[{"at":"ISO เวลาไทย +07:00","t":"ชื่อย่อ"}]} สูงสุด 6 รายการ` }],
  })));
}
async function computeBrain() {
  const [o, c] = await Promise.all([brainOutlook(), brainCalendar()]);
  const now = Date.now();
  let lock = null;
  for (const e of (c && c.e) || []) {
    const t = Date.parse(e.at || "");
    if (!isNaN(t) && now > t - 30 * 60000 && now < t + 25 * 60000) { lock = e.t; break; }
  }
  const score = Number(o && o.score) || 0;
  const bias = score >= 25 ? "BUY" : score <= -25 ? "SELL" : "ANY";
  return {
    allow: !lock,
    bias: lock ? "NONE" : bias,
    reason: lock ? "หลบข่าวแรง: " + lock : (o && o.summary) || "ไม่มีข้อมูลแนวโน้ม เทรดตามระบบ",
    volatile: !!(o && o.volatile),
  };
}

/* ---------- token → account ---------- */
async function accountByToken(token) {
  if (!/^[0-9a-f]{32}$/.test(String(token || ""))) return null;
  const t = await kget("tok:" + token);
  if (!t || !t.phone) return null;
  const acct = await kget("acct:" + t.phone);
  return acct && acct.token === token ? { phone: t.phone, acct } : null;
}

/* ---------- routes ---------- */
const routes = {
  "GET /api/ping": async (req, res) => {
    const out = { ok: 1, price: PRICE, env: {
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      adminKey: !!process.env.ADMIN_KEY,
    } };
    /* ทดสอบเขียน-อ่านฐานข้อมูลจริง 1 รอบ (ไม่แตะข้อมูลใคร ใช้คีย์ selftest ของตัวเอง) */
    try {
      const stamp = Date.now();
      await kset("selftest", { stamp });
      const back = await kget("selftest");
      out.db = back && back.stamp === stamp ? "ok" : "mismatch";
    } catch (e) { out.db = "error: " + String(e.message).slice(0, 140); }
    /* ?deep=1 = ทดสอบเรียก Claude จริง 1 ครั้งสั้นๆ (ใช้เช็คคีย์ ไม่ควรเรียกบ่อย) */
    if (new URL(req.url || "/", "http://x").searchParams.get("deep") === "1") {
      try { const t = await claude({ max_tokens: 12, messages: [{ role: "user", content: "reply exactly: ok" }] }); out.claude = "ok: " + String(t).slice(0, 20); }
      catch (e) { out.claude = "error: " + String(e.message).slice(0, 160); }
    }
    return json(res, 200, out);
  },

  /* ข้อมูลบัญชีรับโอน (หน้าเว็บดึงไปแสดง) */
  "GET /api/payinfo": async (req, res) => json(res, 200, { price: PRICE, bank: BANK }),

  /* 1) ส่งสลิป → AI ตรวจ → เปิดใช้งาน + ออกโทเคน */
  "POST /api/purchase": async (req, res) => {
    const { phone, image, mime } = req.body || {};
    const ph = normPhone(phone);
    if (!/^0[0-9]{9}$/.test(ph)) return err(res, 400, "กรอกเบอร์โทร 10 หลักให้ถูกต้อง");
    if (!image || String(image).length < 4000) return err(res, 400, "แนบรูปสลิปก่อน");
    if (String(image).length > 8 * 1024 * 1024) return err(res, 400, "รูปใหญ่เกินไป");

    const existing = await kget("acct:" + ph);
    if (existing && existing.paid) return json(res, 200, { ok: true, token: existing.token, already: true });

    let slip;
    try { slip = await verifySlip(image, /^image\/(png|jpeg|webp)$/.test(mime) ? mime : "image/jpeg"); }
    catch (e) { console.error("SLIP_ERR", e && e.message); return err(res, 502, "อ่านสลิปไม่สำเร็จ ลองถ่ายใหม่ให้ชัดแล้วส่งอีกครั้ง"); }

    const amount = Number(slip.amount) || 0;
    const recv = ((slip.receiver || "") + " " + (slip.receiverAcc || "")).replace(/[-\s]/g, "");
    const recvOk = recv.includes("3211587") || /ธนาวิล|ไกกาจ/.test(slip.receiver || "");
    const ref = String(slip.ref || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 60);

    if (slip.looksReal !== true || (slip.suspicious || "").length > 1)
      return err(res, 400, "สลิปดูผิดปกติ ระบบตรวจไม่ผ่าน — ติดต่อเพจ รับเขียน EA Trading Bot เพื่อเปิดใช้งานแบบแมนนวล");
    if (amount < PRICE) return err(res, 400, `ยอดโอนไม่ครบ ${PRICE.toLocaleString()} ฿ (อ่านได้ ${amount.toLocaleString()} ฿)`);
    if (!recvOk) return err(res, 400, "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีร้าน — ตรวจสอบอีกครั้ง");
    if (ref) {
      const dup = await kget("slipref:" + ref);
      if (dup && dup.phone !== ph) return err(res, 400, "สลิปนี้ถูกใช้เปิดสิทธิ์ไปแล้ว");
      await kset("slipref:" + ref, { phone: ph, at: new Date().toISOString() });
    }

    const token = rndToken();
    const acct = { paid: true, paidAt: new Date().toISOString(), amount, ref, token, cfg: null, ea: null };
    await kset("acct:" + ph, acct);
    await kset("tok:" + token, { phone: ph });
    return json(res, 200, { ok: true, token });
  },

  /* แอดมินอนุมัติแบบแมนนวล (กรณี AI อ่านสลิปไม่ผ่านแต่โอนจริง) */
  "POST /api/admin/approve": async (req, res) => {
    const { key, phone } = req.body || {};
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return err(res, 403, "forbidden");
    const ph = normPhone(phone);
    let acct = (await kget("acct:" + ph)) || {};
    const token = acct.token || rndToken();
    acct = { ...acct, paid: true, paidAt: acct.paidAt || new Date().toISOString(), amount: acct.amount || PRICE, token, manual: true };
    await kset("acct:" + ph, acct);
    await kset("tok:" + token, { phone: ph });
    return json(res, 200, { ok: true, token });
  },

  /* 2) ตั้งเป้า: ทุน / เป้าหมาย / จำนวนวัน */
  "POST /api/setup": async (req, res) => {
    const { phone, token, initial, target, days } = req.body || {};
    const ph = normPhone(phone);
    const acct = await kget("acct:" + ph);
    if (!acct || !acct.paid || acct.token !== token) return err(res, 403, "ไม่พบสิทธิ์ใช้งาน ตรวจสอบเบอร์/โทเคน");
    const ini = Number(initial), tgt = Number(target), d = Math.round(Number(days));
    if (!(ini >= 10)) return err(res, 400, "ทุนเริ่มต้นขั้นต่ำ $10");
    if (!(tgt > ini)) return err(res, 400, "เป้าหมายต้องมากกว่าทุนเริ่มต้น");
    if (!(d >= 5 && d <= 365)) return err(res, 400, "จำนวนวัน 5-365 วัน");
    const plan = buildPlan(ini, tgt, d);
    acct.cfg = { initial: ini, target: tgt, days: d, rate: plan.rate, capped: plan.capped, setAt: new Date().toISOString() };
    await kset("acct:" + ph, acct);
    return json(res, 200, { ok: true, cfg: acct.cfg });
  },

  /* สถานะ + ตารางแผนสำหรับหน้าแดชบอร์ด */
  "GET /api/me": async (req, res) => {
    const q = new URL(req.url || "/", "http://x").searchParams;
    const ph = normPhone(q.get("phone"));
    const token = q.get("token") || "";
    const acct = await kget("acct:" + ph);
    if (!acct || acct.token !== token) return err(res, 403, "ไม่พบสิทธิ์ใช้งาน");
    const plan = acct.cfg ? buildPlan(acct.cfg.initial, acct.cfg.target, acct.cfg.days) : null;
    const ea = acct.ea || null;
    const online = !!(ea && ea.at && Date.now() - new Date(ea.at).getTime() < 6 * 60000);
    return json(res, 200, { ok: true, paid: acct.paid, cfg: acct.cfg, plan, ea: ea ? { ...ea, online } : null });
  },

  /* ---------- EA bridge (token auth) ---------- */
  "POST /api/ea/hello": async (req, res) => {
    const { token, account, broker, balance } = req.body || {};
    const hit = await accountByToken(token);
    if (!hit) return err(res, 403, "invalid token");
    const { phone, acct } = hit;
    if (!acct.cfg) return err(res, 409, "ยังไม่ได้ตั้งเป้าบนเว็บ");
    acct.ea = { ...(acct.ea || {}), account: String(account || ""), broker: String(broker || "").slice(0, 60), helloAt: new Date().toISOString(), at: new Date().toISOString(), balance: Number(balance) || 0 };
    await kset("acct:" + phone, acct);
    return json(res, 200, { ok: true, initial: acct.cfg.initial, target: acct.cfg.target, days: acct.cfg.days, ratePct: +(acct.cfg.rate * 100).toFixed(4) });
  },

  "GET /api/ea/brain": async (req, res) => {
    const q = new URL(req.url || "/", "http://x").searchParams;
    const hit = await accountByToken(q.get("token"));
    if (!hit) return err(res, 403, "invalid token");
    try {
      const b = await computeBrain();
      return json(res, 200, { ok: true, ...b });
    } catch (e) {
      console.error("BRAIN_ERR", e && e.message);
      return json(res, 200, { ok: true, allow: true, bias: "ANY", reason: "brain offline — เทรดตามระบบ", volatile: false });
    }
  },

  "POST /api/ea/report": async (req, res) => {
    const { token, balance, equity, openPnL, trades, todayPnL, msg } = req.body || {};
    const hit = await accountByToken(token);
    if (!hit) return err(res, 403, "invalid token");
    const { phone, acct } = hit;
    acct.ea = { ...(acct.ea || {}), at: new Date().toISOString(), balance: Number(balance) || 0, equity: Number(equity) || 0, openPnL: Number(openPnL) || 0, trades: Number(trades) || 0, todayPnL: Number(todayPnL) || 0, msg: String(msg || "").slice(0, 120) };
    await kset("acct:" + phone, acct);
    return json(res, 200, { ok: true });
  },
};

/* ---------- dispatcher ---------- */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  const path = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const key = `${req.method} ${path}`;
  const fn = routes[key];
  if (!fn) return err(res, 404, "not found");
  try { await fn(req, res); }
  catch (e) { console.error("UNCAUGHT", key, e && e.message); return err(res, 500, "server error"); }
}
