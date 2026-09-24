import React, { useEffect, useMemo, useRef, useState } from "react";

/* ================= AEGIS AUTO — AI เทรดทอง MT5 อัตโนมัติ 24 ชม. ================= */

const CSS = `
:root{--bg:#07090f;--bg2:#0b0e17;--card:#10141f;--line:#232a3d;--gold:#d4af37;--gold2:#e9c766;--ink:#eef0f6;--dim:#8b93a7;--green:#30d158;--red:#ff5b5b;--blue:#5aa9ff}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg)}
body{font-family:'Segoe UI',Tahoma,system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.wrap{max-width:520px;margin:0 auto;min-height:100dvh;background:linear-gradient(180deg,var(--bg2),var(--bg) 320px);position:relative;overflow:clip}
.wrap:before{content:"";position:absolute;inset:-40% -30% auto;height:420px;background:radial-gradient(ellipse at 50% 0%,rgba(212,175,55,.14),transparent 65%);pointer-events:none}
.pad{padding:0 18px 90px;position:relative}
.top{display:flex;align-items:center;gap:10px;padding:16px 18px;position:sticky;top:0;z-index:9;background:linear-gradient(180deg,rgba(7,9,15,.94),rgba(7,9,15,.7));backdrop-filter:blur(10px);border-bottom:1px solid rgba(212,175,55,.14)}
.logo{width:34px;height:34px;border-radius:10px;background:conic-gradient(from 200deg,#d4af37,#8a6b1f,#e9c766,#d4af37);display:grid;place-items:center;font-size:18px;box-shadow:0 4px 18px rgba(212,175,55,.35)}
.brand b{font-size:15px;letter-spacing:.4px}
.brand span{display:block;font-size:10.5px;color:var(--dim);letter-spacing:1.6px}
.chip{margin-left:auto;font-size:11px;color:var(--gold2);border:1px solid rgba(212,175,55,.4);border-radius:99px;padding:4px 10px;background:rgba(212,175,55,.08)}
h1{font-size:27px;line-height:1.3;margin:26px 0 10px;background:linear-gradient(115deg,#fff,#f3e3ae 55%,#caa53d);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--dim);font-size:14px;line-height:1.75}
.card{background:linear-gradient(180deg,#121726,#0e1220);border:1px solid var(--line);border-radius:16px;padding:16px;margin-top:14px}
.card.glow{border-color:rgba(212,175,55,.35);box-shadow:0 10px 40px -18px rgba(212,175,55,.4)}
.eyebrow{font-size:11px;letter-spacing:2px;color:var(--gold2);text-transform:uppercase;margin-bottom:8px}
.btn{display:block;width:100%;padding:15px;border:none;border-radius:13px;background:linear-gradient(120deg,#e9c766,#c79a2e);color:#161006;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 8px 26px -8px rgba(212,175,55,.55);transition:transform .12s}
.btn:active{transform:scale(.98)}
.btn.ghost{background:transparent;color:var(--gold2);border:1px solid rgba(212,175,55,.45);box-shadow:none}
.btn:disabled{opacity:.5}
.in{width:100%;background:#0a0d16;border:1px solid var(--line);border-radius:12px;padding:13px 14px;color:var(--ink);font-size:16px;outline:none}
.in:focus{border-color:rgba(212,175,55,.55)}
.lbl{font-size:12.5px;color:var(--dim);margin:12px 0 6px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.feat{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
.feat:last-child{border:none}
.feat .ic{width:36px;height:36px;border-radius:10px;background:rgba(212,175,55,.1);display:grid;place-items:center;font-size:17px;flex:none}
.feat b{font-size:13.5px}
.feat p{font-size:12px;color:var(--dim);margin-top:2px;line-height:1.6}
.stat{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.stat .bx{background:#0a0d16;border:1px solid var(--line);border-radius:12px;padding:11px}
.stat .bx i{font-style:normal;font-size:11px;color:var(--dim);display:block}
.stat .bx b{font-size:18px;color:var(--gold2)}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{position:sticky;top:0;background:#151a2a;color:var(--gold2);font-weight:600;padding:8px 6px;font-size:11px;border-bottom:1px solid rgba(212,175,55,.3);white-space:nowrap}
tbody td{padding:7px 6px;text-align:right;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap;font-variant-numeric:tabular-nums}
tbody td:first-child{text-align:center;color:var(--dim)}
tbody tr:nth-child(odd){background:rgba(255,255,255,.018)}
tbody tr.mile td{background:rgba(212,175,55,.08);color:var(--gold2)}
.tblBox{max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:12px;margin-top:12px}
.bank{display:flex;align-items:center;gap:12px;background:#0a0d16;border:1px dashed rgba(212,175,55,.5);border-radius:12px;padding:13px}
.bank .no{font-size:19px;font-weight:700;letter-spacing:1px;color:var(--gold2)}
.bank button{margin-left:auto;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.4);color:var(--gold2);border-radius:9px;padding:7px 12px;font-size:12px;cursor:pointer}
.up{border:2px dashed rgba(212,175,55,.4);border-radius:14px;padding:22px;text-align:center;color:var(--dim);font-size:13px;cursor:pointer;margin-top:12px;background:rgba(212,175,55,.03)}
.up img{max-width:100%;max-height:230px;border-radius:10px}
.alert{margin-top:12px;font-size:13px;border-radius:11px;padding:11px 13px;line-height:1.6}
.alert.err{background:rgba(255,91,91,.1);border:1px solid rgba(255,91,91,.35);color:#ffb3b3}
.alert.ok{background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.3);color:#9ff0b5}
.alert.warn{background:rgba(212,175,55,.07);border:1px solid rgba(212,175,55,.3);color:#eederab}
.dot{width:9px;height:9px;border-radius:99px;display:inline-block;margin-right:7px}
.dot.on{background:var(--green);box-shadow:0 0 10px var(--green)}
.dot.off{background:#5b6478}
.steps li{font-size:13px;color:var(--dim);line-height:1.8;margin-left:18px;padding-left:4px}
.steps li b{color:var(--ink)}
.tok{background:#0a0d16;border:1px solid var(--line);border-radius:11px;padding:11px;font-family:Consolas,monospace;font-size:13px;color:var(--gold2);word-break:break-all;display:flex;gap:10px;align-items:center}
.tok button{flex:none;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.4);color:var(--gold2);border-radius:8px;padding:6px 10px;font-size:11.5px;cursor:pointer}
.mini{font-size:11.5px;color:var(--dim);line-height:1.7;margin-top:10px}
.price{display:flex;align-items:baseline;gap:8px;margin:6px 0 2px}
.price b{font-size:34px;color:var(--gold2)}
.price s{color:var(--dim);font-size:15px}
.foot{padding:26px 18px 34px;text-align:center;color:#5b6478;font-size:11px;line-height:1.8;border-top:1px solid rgba(255,255,255,.05);margin-top:30px}
.spin{width:18px;height:18px;border:2.5px solid rgba(22,16,6,.3);border-top-color:#161006;border-radius:99px;display:inline-block;vertical-align:-4px;margin-right:8px;animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.pulse{animation:pu 2.4s ease-in-out infinite}
@keyframes pu{0%,100%{opacity:1}50%{opacity:.55}}
`;

const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const api = async (path, body, method) => {
  const r = await fetch(path, { method: method || (body ? "POST" : "GET"), headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "ผิดพลาด ลองใหม่อีกครั้ง"); e.status = r.status; throw e; }
  return j;
};
const store = {
  get: () => { try { return JSON.parse(localStorage.getItem("at2") || "null"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem("at2", JSON.stringify(v)); } catch {} },
  clear: () => { try { localStorage.removeItem("at2"); } catch {} },
};

/* คณิตแผนทบต้น — ชุดเดียวกับหลังบ้านและ EA */
function buildPlan(initial, target, days) {
  let rate = Math.pow(target / initial, 1 / days) - 1, capped = false;
  if (!isFinite(rate) || rate <= 0) return null;
  if (rate > 1) { rate = 1; capped = true; }
  const rows = []; let bal = initial;
  for (let d = 1; d <= days; d++) {
    const profit = bal * rate;
    const lot = bal < 50 ? 0.01 : Math.floor(bal / 50) * 0.01;
    rows.push({ d, start: bal, profit, end: bal + profit, lot, pts: Math.round(profit / lot), ddPct: bal < 50 ? 25 : bal < 500 ? 15 : 10, dd: bal * (bal < 50 ? 0.25 : bal < 500 ? 0.15 : 0.10) });
    bal += profit;
  }
  return { rate, capped, rows, final: bal };
}

function PlanTable({ plan, limit }) {
  if (!plan) return null;
  const rows = limit ? plan.rows.slice(0, limit) : plan.rows;
  let lastLot = null;
  return (
    <div className="tblBox">
      <table>
        <thead><tr><th>วัน</th><th>ยอดเริ่ม</th><th>เป้ากำไร</th><th>ยอดสิ้นวัน</th><th>ลอต</th><th>จุดทอง</th><th>ห้ามเสียเกิน</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const mile = lastLot !== null && r.lot !== lastLot; lastLot = r.lot;
            return (
              <tr key={r.d} className={mile ? "mile" : ""}>
                <td>{r.d}</td><td>{money(r.start)}</td><td>+{money(r.profit)}</td><td>{money(r.end)}</td>
                <td>{r.lot.toFixed(2)}</td><td>{r.pts.toLocaleString()}</td><td>-{money(r.dd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const saved = store.get();
  const [page, setPage] = useState(saved ? "dash" : "home");
  const [creds, setCreds] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  /* เครื่องคิดหน้าแรก */
  const [ini, setIni] = useState(30), [tgt, setTgt] = useState(5000), [days, setDays] = useState(100);
  const calc = useMemo(() => buildPlan(Number(ini) || 0, Number(tgt) || 0, Math.max(1, Math.round(Number(days) || 1))), [ini, tgt, days]);

  /* หน้าโอน */
  const [phone, setPhone] = useState("");
  const [slip, setSlip] = useState(null);
  const fileRef = useRef(null);
  const [payinfo, setPayinfo] = useState({ price: 15900, bank: { name: "กสิกรไทย (KBank)", acc: "083-3-21158-7", holder: "ธนาวิล ไกกาจ" } });
  useEffect(() => { api("/api/payinfo").then(setPayinfo).catch(() => {}); }, []);

  /* หน้าแดชบอร์ด */
  const [me, setMe] = useState(null);
  const loadMe = async (c) => {
    const cc = c || creds; if (!cc) return;
    try { setMe(await api(`/api/me?phone=${cc.phone}&token=${cc.token}`)); }
    catch (e) { if (e.status === 403) { store.clear(); setCreds(null); setPage("home"); } }
  };
  useEffect(() => { if (page === "dash") { loadMe(); const iv = setInterval(loadMe, 15000); return () => clearInterval(iv); } }, [page]); // eslint-disable-line

  const pick = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg({ t: "err", x: "รองรับเฉพาะไฟล์รูปสลิป" });
    const r = new FileReader();
    r.onload = () => setSlip({ url: r.result, b64: String(r.result).split(",")[1], mime: f.type === "image/jpg" ? "image/jpeg" : f.type });
    r.readAsDataURL(f);
  };

  const submitSlip = async () => {
    setMsg(null);
    if (!/^0[0-9]{9}$/.test(phone.replace(/[^0-9]/g, ""))) return setMsg({ t: "err", x: "กรอกเบอร์โทร 10 หลัก (ใช้เข้าระบบภายหลัง)" });
    if (!slip) return setMsg({ t: "err", x: "แนบรูปสลิปโอนเงินก่อน" });
    setBusy(true);
    try {
      const r = await api("/api/purchase", { phone: phone.replace(/[^0-9]/g, ""), image: slip.b64, mime: slip.mime });
      const c = { phone: phone.replace(/[^0-9]/g, ""), token: r.token };
      store.set(c); setCreds(c); setMsg(null); setPage("setup");
    } catch (e) { setMsg({ t: "err", x: e.message }); }
    finally { setBusy(false); }
  };

  /* หน้า setup */
  const [sIni, setSIni] = useState(30), [sTgt, setSTgt] = useState(5000), [sDays, setSDays] = useState(100);
  const sCalc = useMemo(() => buildPlan(Number(sIni) || 0, Number(sTgt) || 0, Math.max(1, Math.round(Number(sDays) || 1))), [sIni, sTgt, sDays]);
  const submitSetup = async () => {
    setMsg(null); setBusy(true);
    try {
      await api("/api/setup", { phone: creds.phone, token: creds.token, initial: Number(sIni), target: Number(sTgt), days: Math.round(Number(sDays)) });
      await loadMe(); setPage("dash");
    } catch (e) { setMsg({ t: "err", x: e.message }); }
    finally { setBusy(false); }
  };

  const copy = (t) => { try { navigator.clipboard.writeText(t); setMsg({ t: "ok", x: "คัดลอกแล้ว" }); setTimeout(() => setMsg(null), 1500); } catch {} };

  const price = (payinfo.price || 15900).toLocaleString();

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <div className="top">
        <div className="logo">⚡</div>
        <div className="brand"><b>AEGIS AUTO</b><span>AI TRADES YOUR MT5 · 24H</span></div>
        <div className="chip">{page === "dash" ? "สมาชิก" : "XAUUSD"}</div>
      </div>

      {/* ============ HOME ============ */}
      {page === "home" && (
        <div className="pad">
          <h1>ให้ AI เทรดทองแทนคุณ<br />ตลอด 24 ชั่วโมง</h1>
          <p className="sub">เชื่อมบัญชี MT5 ของคุณเข้ากับระบบ แล้วให้ AI วางแผน–หาจังหวะเข้า–ตั้ง TP/SL–เลี่ยงข่าวแรง และไล่เก็บกำไรตามแผนทบต้นของคุณ วันต่อวัน</p>

          <div className="card glow">
            <div className="eyebrow">คำนวณแผนของคุณ</div>
            <div className="row3">
              <div><div className="lbl">ทุน ($)</div><input className="in" type="number" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
              <div><div className="lbl">เป้าหมาย ($)</div><input className="in" type="number" value={tgt} onChange={(e) => setTgt(e.target.value)} /></div>
              <div><div className="lbl">กี่วัน</div><input className="in" type="number" value={days} onChange={(e) => setDays(e.target.value)} /></div>
            </div>
            {calc && (
              <>
                <div className="stat">
                  <div className="bx"><i>ต้องโตวันละ</i><b>{(calc.rate * 100).toFixed(2)}%{calc.capped ? " (เพดาน)" : ""}</b></div>
                  <div className="bx"><i>ยอดปลายทางวันที่ {days}</i><b>{money(calc.final)}</b></div>
                </div>
                <PlanTable plan={calc} limit={8} />
                <p className="mini">แสดง 8 วันแรก — หลังเปิดใช้งานจะเห็นตารางเต็มทุกวัน พร้อมลอตและลิมิตขาดทุนรายวันของแต่ละวัน</p>
              </>
            )}
          </div>

          <div className="card">
            <div className="eyebrow">AI ทำอะไรให้บ้าง</div>
            <div className="feat"><div className="ic">🎯</div><div><b>หาจังหวะเข้าเอง ตั้ง TP/SL เอง</b><p>วิเคราะห์โครงสร้างราคา แนวรับ-แนวต้าน โมเมนตัม แล้วเข้าไม้เมื่อได้เปรียบเท่านั้น ไม่ไล่ราคา</p></div></div>
            <div className="feat"><div className="ic">📰</div><div><b>ดูข่าวและแนวโน้มให้ตลอด</b><p>สมอง AI บนเซิร์ฟเวอร์เช็คข่าวแรง (NFP, CPI, FOMC ฯลฯ) หยุดเทรดช่วงข่าว และอ่านแนวโน้มว่าราคาควรวิ่งฝั่งไหน</p></div></div>
            <div className="feat"><div className="ic">📈</div><div><b>เดินตามแผนทบต้นของคุณ</b><p>เป้ากำไรรายวัน ลอตที่ปรับตามพอร์ตอัตโนมัติ ถึงเป้าวันนี้ = หยุดพัก พรุ่งนี้ค่อยลุยต่อ</p></div></div>
            <div className="feat"><div className="ic">🛡️</div><div><b>ลิมิตขาดทุนรายวัน 3 ระดับ</b><p>พอร์ตเล็กกันที่ 25% กลาง 15% ใหญ่ 10% — ชนลิมิตปุ๊บหยุดทันทีถึงเที่ยงคืน ป้องกันพอร์ตพัง</p></div></div>
            <div className="feat"><div className="ic">🔌</div><div><b>เทรดในบัญชีของคุณเอง</b><p>เงินอยู่โบรกเกอร์ของคุณ เราไม่แตะเงินคุณ — เชื่อมผ่าน EA ตัวเชื่อมบน MT5 ถอนได้ตลอดเวลา</p></div></div>
          </div>

          <div className="card glow">
            <div className="eyebrow">ค่าบริการครั้งเดียว</div>
            <div className="price"><b>{price} ฿</b><s>29,000 ฿</s></div>
            <p className="sub" style={{ fontSize: 13 }}>จ่ายครั้งเดียว ใช้ได้ตลอด · รวม EA ตัวเชื่อม + สมอง AI + อัปเดตฟรี</p>
            <div style={{ height: 12 }} />
            <button className="btn" onClick={() => { setMsg(null); setPage("pay"); }}>เริ่มใช้งาน — โอนแล้วเปิดระบบทันที</button>
            <div style={{ height: 8 }} />
            {saved && <button className="btn ghost" onClick={() => setPage("dash")}>เข้าสู่แดชบอร์ดสมาชิก</button>}
          </div>

          <div className="alert warn">⚠️ การเทรดมีความเสี่ยง ตารางคือ "เป้าหมาย" จากสูตรทบต้น ไม่ใช่การรับประกันผลตอบแทน ผลลัพธ์จริงขึ้นกับสภาวะตลาด ควรใช้เงินที่พร้อมรับความเสี่ยงเท่านั้น</div>
        </div>
      )}

      {/* ============ PAY ============ */}
      {page === "pay" && (
        <div className="pad">
          <h1>เปิดใช้งานระบบ</h1>
          <p className="sub">โอนค่าบริการ {price} ฿ แล้วแนบสลิป — AI ตรวจสลิปและเปิดสิทธิ์ให้อัตโนมัติภายในไม่กี่วินาที</p>

          <div className="card glow">
            <div className="eyebrow">โอนเข้าบัญชี</div>
            <div className="bank">
              <div>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{payinfo.bank.name} · {payinfo.bank.holder}</div>
                <div className="no">{payinfo.bank.acc}</div>
              </div>
              <button onClick={() => copy(payinfo.bank.acc.replace(/-/g, ""))}>คัดลอก</button>
            </div>
            <div className="stat"><div className="bx"><i>ยอดที่ต้องโอน</i><b>{price} ฿</b></div><div className="bx"><i>เปิดสิทธิ์</i><b>อัตโนมัติทันที</b></div></div>

            <div className="lbl">เบอร์โทรของคุณ (ใช้เข้าระบบ)</div>
            <input className="in" type="tel" placeholder="08xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />

            <div className="up" onClick={() => fileRef.current?.click()}>
              {slip ? <img src={slip.url} alt="slip" /> : <>📎 แตะเพื่อแนบรูปสลิปโอนเงิน<br /><span style={{ fontSize: 11 }}>ถ่าย/แคปให้เห็นยอดเงิน เลขบัญชีผู้รับ และเลขอ้างอิงชัดๆ</span></>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />

            {msg && <div className={"alert " + (msg.t === "err" ? "err" : "ok")}>{msg.x}</div>}
            <div style={{ height: 12 }} />
            <button className="btn" disabled={busy} onClick={submitSlip}>{busy ? <><span className="spin" />AI กำลังตรวจสลิป...</> : "ส่งสลิป เปิดใช้งานเลย"}</button>
            <p className="mini">สลิปตรวจไม่ผ่านแต่โอนจริง? ทักเพจ <b>รับเขียน EA Trading Bot</b> พร้อมสลิป ทีมงานเปิดสิทธิ์ให้ทันที</p>
          </div>
          <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setPage("home")}>← กลับหน้าแรก</button>
        </div>
      )}

      {/* ============ SETUP ============ */}
      {page === "setup" && creds && (
        <div className="pad">
          <h1>ตั้งเป้าหมายของคุณ</h1>
          <p className="sub">บอก AI ว่าพอร์ตคุณมีเท่าไหร่ อยากไปให้ถึงเท่าไหร่ ในกี่วัน — ระบบจะวางแผนรายวันให้ทั้งเส้นทาง</p>
          <div className="card glow">
            <div className="row3">
              <div><div className="lbl">ทุนใน MT5 ($)</div><input className="in" type="number" value={sIni} onChange={(e) => setSIni(e.target.value)} /></div>
              <div><div className="lbl">เป้าหมาย ($)</div><input className="in" type="number" value={sTgt} onChange={(e) => setSTgt(e.target.value)} /></div>
              <div><div className="lbl">ภายในกี่วัน</div><input className="in" type="number" value={sDays} onChange={(e) => setSDays(e.target.value)} /></div>
            </div>
            {sCalc && (
              <div className="stat">
                <div className="bx"><i>AI ต้องทำวันละ</i><b>{(sCalc.rate * 100).toFixed(2)}%{sCalc.capped ? " (เพดาน 100%)" : ""}</b></div>
                <div className="bx"><i>ปลายทาง</i><b>{money(sCalc.final)}</b></div>
              </div>
            )}
            {sCalc && sCalc.rate > 0.15 && <div className="alert warn">เป้าโตเกิน 15%/วัน = ความเสี่ยงสูงมาก AI จะพยายามตามแผน แต่โอกาสชนลิมิตขาดทุนรายวันก็สูงขึ้นตาม — ยืดจำนวนวันจะปลอดภัยกว่า</div>}
            {msg && <div className={"alert " + (msg.t === "err" ? "err" : "ok")}>{msg.x}</div>}
            <div style={{ height: 12 }} />
            <button className="btn" disabled={busy || !sCalc} onClick={submitSetup}>{busy ? <><span className="spin" />กำลังวางแผน...</> : "ให้ AI วางแผนและเริ่มระบบ"}</button>
          </div>
        </div>
      )}

      {/* ============ DASHBOARD ============ */}
      {page === "dash" && creds && (
        <div className="pad">
          <h1>แดชบอร์ดของคุณ</h1>
          {!me && <p className="sub pulse">กำลังโหลด...</p>}
          {me && !me.cfg && (
            <div className="card glow">
              <div className="eyebrow">ยังไม่ได้ตั้งเป้า</div>
              <p className="sub">ตั้งทุน/เป้าหมาย/จำนวนวันก่อน แล้วระบบจะสร้างแผนให้</p>
              <div style={{ height: 10 }} /><button className="btn" onClick={() => setPage("setup")}>ตั้งเป้าหมายเลย</button>
            </div>
          )}

          {me && me.cfg && (
            <>
              <div className="card glow">
                <div className="eyebrow">สถานะการเชื่อมต่อ MT5</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  <span className={"dot " + (me.ea && me.ea.online ? "on" : "off")} />
                  {me.ea && me.ea.online ? "EA ออนไลน์ — AI กำลังดูแลพอร์ตของคุณ" : me.ea ? "EA ออฟไลน์ (เปิด MT5 + EA ค้างไว้เพื่อให้เทรด 24 ชม.)" : "ยังไม่เชื่อมต่อ — ทำตามขั้นตอนด้านล่าง"}
                </div>
                {me.ea && (
                  <div className="stat">
                    <div className="bx"><i>ยอดเงิน (Balance)</i><b>{money(me.ea.balance || 0)}</b></div>
                    <div className="bx"><i>Equity</i><b>{money(me.ea.equity || 0)}</b></div>
                    <div className="bx"><i>กำไร/ขาดทุนวันนี้</i><b style={{ color: (me.ea.todayPnL || 0) >= 0 ? "var(--green)" : "var(--red)" }}>{money(me.ea.todayPnL || 0)}</b></div>
                    <div className="bx"><i>ไม้ที่เปิดอยู่</i><b>{me.ea.trades || 0}</b></div>
                  </div>
                )}
                {me.ea && me.ea.msg ? <p className="mini">ล่าสุดจาก AI: {me.ea.msg}</p> : null}
              </div>

              <div className="card">
                <div className="eyebrow">แผนของคุณ · {money(me.cfg.initial)} → {money(me.cfg.target)} ใน {me.cfg.days} วัน</div>
                <div className="stat">
                  <div className="bx"><i>เป้าโตต่อวัน</i><b>{(me.cfg.rate * 100).toFixed(2)}%</b></div>
                  <div className="bx"><i>ปลายทาง</i><b>{me.plan ? money(me.plan.final) : "-"}</b></div>
                </div>
                <PlanTable plan={me.plan} />
                <p className="mini">แถวสีทอง = วันที่ลอตขยับขึ้น · "จุดทอง" = ระยะที่ต้องเก็บของวันนั้น (ราคาทอง 2 ตำแหน่ง, 1 จุด/1.0 ลอต = $1) · "ห้ามเสียเกิน" = ลิมิตขาดทุนที่ AI จะหยุดเทรดทันที</p>
              </div>

              <div className="card">
                <div className="eyebrow">เชื่อม MT5 (ครั้งเดียวจบ)</div>
                <div className="lbl">โทเคนของคุณ (ห้ามให้คนอื่น)</div>
                <div className="tok">{creds.token}<button onClick={() => copy(creds.token)}>คัดลอก</button></div>
                <div style={{ height: 12 }} />
                <a href="/ea/AegisAI_Connector.ex5" download><button className="btn">⬇ ดาวน์โหลด EA ตัวเชื่อม (.ex5)</button></a>
                <div style={{ height: 8 }} />
                <a href="/ea/setup-guide.txt" download><button className="btn ghost">คู่มือติดตั้งแบบละเอียด (.txt)</button></a>
                <div style={{ height: 14 }} />
                <ol className="steps">
                  <li>เปิด MT5 → <b>File → Open Data Folder</b> → วางไฟล์ใน <b>MQL5\Experts</b> แล้วรีสตาร์ต MT5</li>
                  <li><b>Tools → Options → Expert Advisors</b> → ติ๊ก <b>Allow WebRequest</b> แล้วเพิ่ม URL: <b>{typeof location !== "undefined" ? location.origin : ""}</b></li>
                  <li>ลาก EA ใส่กราฟ <b>XAUUSD M15</b> → ใส่โทเคนด้านบนในช่อง <b>Inp_Token</b> → เปิด <b>Algo Trading</b></li>
                  <li>เปิดเครื่อง/VPS ค้างไว้ — สถานะด้านบนจะขึ้น "ออนไลน์" ภายใน 1 นาที แล้ว AI เริ่มทำงานทันที</li>
                </ol>
              </div>

              <div className="alert warn">⚠️ ตารางคือเป้าหมายจากสูตรทบต้น ไม่ใช่การรับประกันกำไร การเทรดมีความเสี่ยง — ระบบจึงมีลิมิตหยุดขาดทุนรายวันช่วยคุมความเสียหายทุกวัน</div>
              <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => { setSIni(me.cfg.initial); setSTgt(me.cfg.target); setSDays(me.cfg.days); setPage("setup"); }}>แก้เป้าหมาย / วางแผนใหม่</button>
            </>
          )}
        </div>
      )}

      <div className="foot">AEGIS AUTO · by รับเขียน EA Trading Bot<br />การลงทุนมีความเสี่ยง ผู้ใช้ควรศึกษาและยอมรับความเสี่ยงก่อนใช้งาน · ระบบไม่ได้รับฝากเงิน เงินอยู่ในบัญชีโบรกเกอร์ของผู้ใช้เอง</div>
    </div>
  );
}
