import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* dev เท่านั้น: จำลอง API เพื่อทดสอบ UI เต็มโฟลว์โดยไม่ต้องมี backend (โปรดักชันใช้ /api จริงบน Vercel) */
const devApiMock = () => ({
  name: "dev-api-mock",
  apply: "serve",
  configureServer(server) {
    const json = (res, obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    const TOKEN = "abcdef0123456789abcdef0123456789";
    let cfg = null;
    let helloAt = Date.now();
    const buildPlan = (initial, target, days) => {
      let rate = Math.pow(target / initial, 1 / days) - 1, capped = false;
      if (rate > 1) { rate = 1; capped = true; }
      const rows = []; let bal = initial;
      for (let d = 1; d <= days; d++) {
        const profit = bal * rate;
        const lot = bal < 50 ? 0.01 : Math.floor(bal / 50) * 0.01;
        rows.push({ d, start: +bal.toFixed(2), profit: +profit.toFixed(2), end: +(bal + profit).toFixed(2), lot: +lot.toFixed(2), pts: Math.round(profit / lot), ddPct: bal < 50 ? 25 : bal < 500 ? 15 : 10, dd: +(bal * (bal < 50 ? 0.25 : bal < 500 ? 0.15 : 0.10)).toFixed(2) });
        bal += profit;
      }
      return { rate, capped, rows, final: +bal.toFixed(2) };
    };
    server.middlewares.use((req, res, next) => {
      if (!req.url.startsWith("/api/")) return next();
      const path = req.url.split("?")[0];
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let b = {}; try { b = JSON.parse(body || "{}"); } catch {}
        if (path === "/api/payinfo") return json(res, { price: 15900, bank: { name: "กสิกรไทย (KBank)", acc: "083-3-21158-7", holder: "ธนาวิล ไกกาจ" } });
        if (path === "/api/purchase") return setTimeout(() => json(res, { ok: true, token: TOKEN }), 2500);
        if (path === "/api/setup") { cfg = { initial: +b.initial, target: +b.target, days: +b.days, rate: buildPlan(+b.initial, +b.target, +b.days).rate }; return json(res, { ok: true, cfg }); }
        if (path === "/api/me") {
          const plan = cfg ? buildPlan(cfg.initial, cfg.target, cfg.days) : null;
          const ea = cfg ? { online: true, at: new Date().toISOString(), balance: cfg.initial * 1.12, equity: cfg.initial * 1.13, todayPnL: cfg.initial * 0.031, trades: 1, msg: "แนวโน้มขึ้น เข้า BUY 2652.4 TP 2662.4 กำลังรันกำไร", account: "1120345", broker: "Exness-MT5Real8" } : null;
          return json(res, { ok: true, paid: true, cfg, plan, ea });
        }
        return json(res, { error: "mock: not found" });
      });
    });
  },
});

export default defineConfig({ plugins: [react(), devApiMock()], build: { outDir: "dist" } });
