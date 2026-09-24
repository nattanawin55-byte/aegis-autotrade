//+------------------------------------------------------------------+
//|                                          AegisAI_Connector.mq5   |
//|                                                    ธนาวิล ไกกาจ |
//|   AEGIS AUTO — AI trades your MT5 24h following your web plan     |
//+------------------------------------------------------------------+
#property copyright "ธนาวิล ไกกาจ"
#property link      "https://aegis-autotrade.vercel.app"
#property version   "1.00"
#property description "AEGIS AUTO connector: pulls your plan from the website,"
#property description "asks the AI brain (news/trend) before entering, trades 24h,"
#property description "and reports live status back to your dashboard."
#property strict

#include <Trade/Trade.mqh>

//+------------------------------------------------------------------+
//| Inputs                                                           |
//+------------------------------------------------------------------+
input group "=== AEGIS AUTO Server ==="
input string Inp_ServerURL = "https://aegis-autotrade.vercel.app"; // Server URL (add to WebRequest whitelist!)
input string Inp_Token     = "";                                   // Your token from the website

input group "=== Compounding Goals (fallback if server offline) ==="
input double Inp_InitialBalance = 30.0;    // Initial balance ($)
input double Inp_TargetBalance  = 5000.0;  // Target balance ($)
input int    Inp_TargetDays     = 70;      // Trading days to reach target

input group "=== Entry Filters (Sniper) ==="
input int    Inp_EMA_Fast       = 10;      // EMA fast period
input int    Inp_EMA_Slow       = 50;      // EMA slow period
input int    Inp_ADX_Period     = 14;      // ADX period
input double Inp_ADX_Min        = 20.0;    // Min ADX for momentum
input int    Inp_BB_Period      = 20;      // Bollinger period
input double Inp_BB_Dev         = 2.0;     // Bollinger deviation
input int    Inp_SqueezeBars    = 5;       // Bars that must be "in squeeze" before breakout
input int    Inp_SqueezeMaxPts  = 100;     // Max BB bandwidth for squeeze (2-digit pts, auto x10 on 3-digit)
input double Inp_MinBodyRatio   = 0.3;     // Min body/range ratio of breakout candle
input int    Inp_MaxSpreadPts   = 40;      // Max spread (2-digit pts, auto x10 on 3-digit)

input group "=== Risk / Exits ==="
input int    Inp_SwingBars      = 10;      // Bars for swing high/low SL
input int    Inp_SL_BufferPts   = 20;      // Extra buffer beyond swing (scaled pts)
input int    Inp_MaxSL_LowPts   = 200;     // Max SL when balance < $100 (scaled pts)
input int    Inp_MaxSL_HighPts  = 300;     // Max SL when balance >= $100 (scaled pts)
input int    Inp_MinTPPts       = 100;     // Floor for trade TP (scaled pts)
input int    Inp_MaxTPPts       = 800;     // Hard cap for trade TP (scaled pts)
input int    Inp_BE_TriggerPts  = 150;     // Profit to arm break-even (scaled pts)
input int    Inp_BE_OffsetPts   = 20;      // BE offset above entry (scaled pts)
input int    Inp_TrailStepPts   = 50;      // Trailing step after BE (scaled pts)

input group "=== Misc ==="
input long   Inp_Magic          = 20260923; // Magic number
input int    Inp_SlippagePts    = 50;       // Max deviation (scaled pts)
input bool   Inp_VerboseLog     = true;     // Print reason when a bar is skipped

//+------------------------------------------------------------------+
//| Globals                                                          |
//+------------------------------------------------------------------+
CTrade   trade;

double   g_dailyRate      = 0.0;    // required daily growth (0.05 = 5%)
bool     g_rateCapped     = false;

int      g_scale          = 1;      // point multiplier (1 on 2-digit, 10 on 3-digit gold)
// scaled working copies of all point-based inputs
int      g_maxSpreadPts, g_squeezeMaxPts, g_slBufferPts, g_maxSL_LowPts, g_maxSL_HighPts;
int      g_minTPPts, g_maxTPPts, g_beTriggerPts, g_beOffsetPts, g_trailStepPts, g_slippagePts;

int      g_hEmaFast = INVALID_HANDLE;
int      g_hEmaSlow = INVALID_HANDLE;
int      g_hADX     = INVALID_HANDLE;
int      g_hBB      = INVALID_HANDLE;

double   g_startOfDayBalance = 0.0;
datetime g_curDayStart       = 0;
bool     g_tradingPaused     = false;  // daily max DD hit
bool     g_targetReached     = false;  // daily profit target hit
datetime g_lastM15Bar        = 0;
datetime g_lastSkipLogBar    = 0;
datetime g_lastDashUpdate    = 0;
double   g_lastADX           = 0.0;    // for dashboard

const string DASH_PREFIX = "AegisAI_";

/* ---------- server link state ---------- */
bool     g_srv          = false;   // connected to AEGIS AUTO server
bool     g_brainAllow   = true;    // AI brain: trading allowed (news lock etc.)
string   g_brainBias    = "ANY";   // ANY | BUY | SELL | NONE
string   g_brainReason  = "";
datetime g_lastBrainAt  = 0;
datetime g_lastReportAt = 0;

//+------------------------------------------------------------------+
//| HTTP helpers (WebRequest — whitelist the server URL in MT5!)     |
//+------------------------------------------------------------------+
string HttpCall(const string method, const string url, const string payload)
{
   char data[]; char result[]; string rhdr;
   int dlen = 0;
   if(StringLen(payload) > 0)
   {
      dlen = StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8) - 1; // strip terminating 0
      if(dlen < 0) dlen = 0;
      ArrayResize(data, dlen);
   }
   ResetLastError();
   int code = WebRequest(method, url, "Content-Type: application/json\r\n", 8000, data, result, rhdr);
   if(code == -1)
   {
      PrintFormat("AEGIS AUTO: WebRequest failed (err %d). Add %s to Tools > Options > Expert Advisors > WebRequest list.", GetLastError(), Inp_ServerURL);
      return "";
   }
   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code < 200 || code >= 300)
   {
      PrintFormat("AEGIS AUTO: HTTP %d %s -> %s", code, url, StringSubstr(body, 0, 160));
      return "";
   }
   return body;
}

/* tiny JSON readers (server emits compact json) */
double JNum(const string js, const string key)
{
   int p = StringFind(js, "\"" + key + "\":");
   if(p < 0) return EMPTY_VALUE;
   p += StringLen(key) + 3;
   int e = p;
   while(e < StringLen(js))
   {
      ushort c = StringGetCharacter(js, e);
      if((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') e++;
      else break;
   }
   if(e <= p) return EMPTY_VALUE;
   return StringToDouble(StringSubstr(js, p, e - p));
}
string JStr(const string js, const string key)
{
   int p = StringFind(js, "\"" + key + "\":\"");
   if(p < 0) return "";
   p += StringLen(key) + 4;
   int e = StringFind(js, "\"", p);
   if(e < 0) return "";
   return StringSubstr(js, p, e - p);
}
bool JBool(const string js, const string key, const bool fallback)
{
   int p = StringFind(js, "\"" + key + "\":");
   if(p < 0) return fallback;
   return StringFind(js, "true", p + StringLen(key) + 2) == p + StringLen(key) + 3;
}
string JsonEsc(const string s)
{
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   return r;
}

//+------------------------------------------------------------------+
//| Server calls                                                     |
//+------------------------------------------------------------------+
bool ServerHello()
{
   if(StringLen(Inp_Token) < 16) return false;
   string payload = StringFormat("{\"token\":\"%s\",\"account\":\"%I64d\",\"broker\":\"%s\",\"balance\":%.2f}",
                                 JsonEsc(Inp_Token), AccountInfoInteger(ACCOUNT_LOGIN),
                                 JsonEsc(AccountInfoString(ACCOUNT_SERVER)), AccountInfoDouble(ACCOUNT_BALANCE));
   string body = HttpCall("POST", Inp_ServerURL + "/api/ea/hello", payload);
   if(body == "" || StringFind(body, "\"ok\":true") < 0) return false;
   double ratePct = JNum(body, "ratePct");
   if(ratePct != EMPTY_VALUE && ratePct > 0)
   {
      g_dailyRate  = MathMin(ratePct / 100.0, 1.0);
      g_rateCapped = (ratePct >= 100.0);
   }
   PrintFormat("AEGIS AUTO: connected. plan %.0f$ -> %.0f$ in %.0f days (%.2f%%/day)",
               JNum(body, "initial"), JNum(body, "target"), JNum(body, "days"), g_dailyRate * 100.0);
   return true;
}

void ServerBrain()
{
   if(!g_srv) return;
   string body = HttpCall("GET", Inp_ServerURL + "/api/ea/brain?token=" + Inp_Token, "");
   if(body == "") return;
   g_brainAllow  = JBool(body, "allow", true);
   g_brainBias   = JStr(body, "bias");
   g_brainReason = JStr(body, "reason");
   if(g_brainBias == "") g_brainBias = "ANY";
   g_lastBrainAt = TimeCurrent();
}

void ServerReport()
{
   if(!g_srv) return;
   double bal = AccountInfoDouble(ACCOUNT_BALANCE), eq = AccountInfoDouble(ACCOUNT_EQUITY);
   string payload = StringFormat("{\"token\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"openPnL\":%.2f,\"trades\":%d,\"todayPnL\":%.2f,\"msg\":\"%s\"}",
                                 JsonEsc(Inp_Token), bal, eq, eq - bal, CountMyPositions(),
                                 eq - g_startOfDayBalance, JsonEsc(StringSubstr(g_brainReason, 0, 100)));
   HttpCall("POST", Inp_ServerURL + "/api/ea/report", payload);
   g_lastReportAt = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Helpers: scaled points -> price distance                         |
//+------------------------------------------------------------------+
double Pts(const int scaledPts) { return (double)scaledPts * _Point; }

double SpreadPts()
{
   return (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
}

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   if(Inp_InitialBalance <= 0.0 || Inp_TargetBalance <= Inp_InitialBalance || Inp_TargetDays <= 0)
   {
      Print("Aegis AI: invalid compounding inputs (initial/target/days).");
      return INIT_PARAMETERS_INCORRECT;
   }

   // --- 2. Compounding math + 100% hard cap -------------------------
   g_dailyRate = MathPow(Inp_TargetBalance / Inp_InitialBalance, 1.0 / (double)Inp_TargetDays) - 1.0;
   g_rateCapped = false;
   if(g_dailyRate > 1.0) { g_dailyRate = 1.0; g_rateCapped = true; }

   // --- 1(fix). Point scaling for 2-digit vs 3-digit brokers --------
   // Inputs are quoted in 2-digit gold points (1 pt = 0.01). On a
   // 3-digit XAUUSD (or any 3/5-digit symbol) one input point = 10
   // broker points, so scale everything once here.
   g_scale = (_Digits == 3 || _Digits == 5) ? 10 : 1;

   g_maxSpreadPts  = Inp_MaxSpreadPts  * g_scale;
   g_squeezeMaxPts = Inp_SqueezeMaxPts * g_scale;
   g_slBufferPts   = Inp_SL_BufferPts  * g_scale;
   g_maxSL_LowPts  = Inp_MaxSL_LowPts  * g_scale;
   g_maxSL_HighPts = Inp_MaxSL_HighPts * g_scale;
   g_minTPPts      = Inp_MinTPPts      * g_scale;
   g_maxTPPts      = Inp_MaxTPPts      * g_scale;
   g_beTriggerPts  = Inp_BE_TriggerPts * g_scale;
   g_beOffsetPts   = Inp_BE_OffsetPts  * g_scale;
   g_trailStepPts  = Inp_TrailStepPts  * g_scale;
   g_slippagePts   = Inp_SlippagePts   * g_scale;

   // --- Indicators (always M15, independent of chart TF) ------------
   g_hEmaFast = iMA(_Symbol, PERIOD_M15, Inp_EMA_Fast, 0, MODE_EMA, PRICE_CLOSE);
   g_hEmaSlow = iMA(_Symbol, PERIOD_M15, Inp_EMA_Slow, 0, MODE_EMA, PRICE_CLOSE);
   g_hADX     = iADX(_Symbol, PERIOD_M15, Inp_ADX_Period);
   g_hBB      = iBands(_Symbol, PERIOD_M15, Inp_BB_Period, 0, Inp_BB_Dev, PRICE_CLOSE);
   if(g_hEmaFast == INVALID_HANDLE || g_hEmaSlow == INVALID_HANDLE ||
      g_hADX == INVALID_HANDLE     || g_hBB == INVALID_HANDLE)
   {
      Print("Aegis AI: failed to create indicator handles.");
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber(Inp_Magic);
   trade.SetDeviationInPoints(g_slippagePts);
   trade.SetTypeFillingBySymbol(_Symbol);

   // --- Day baseline -------------------------------------------------
   g_curDayStart       = iTime(_Symbol, PERIOD_D1, 0);
   g_startOfDayBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   g_tradingPaused     = false;
   g_targetReached     = false;

   EventSetTimer(1); // dashboard + server polling

   // connect to AEGIS AUTO (overrides the plan with what the customer set on the web)
   g_srv = ServerHello();
   if(g_srv) ServerBrain();
   else Print("AEGIS AUTO: running standalone with local inputs (no server/token).");

   PrintFormat("Aegis AI init: digits=%d scale=x%d | daily rate=%.2f%%%s | spread max=%d pts | squeeze max=%d pts | ADX min=%.1f",
               _Digits, g_scale, g_dailyRate * 100.0, g_rateCapped ? " (CAPPED 100%)" : "",
               g_maxSpreadPts, g_squeezeMaxPts, Inp_ADX_Min);

   DrawDashboard();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, DASH_PREFIX);
   if(g_hEmaFast != INVALID_HANDLE) IndicatorRelease(g_hEmaFast);
   if(g_hEmaSlow != INVALID_HANDLE) IndicatorRelease(g_hEmaSlow);
   if(g_hADX     != INVALID_HANDLE) IndicatorRelease(g_hADX);
   if(g_hBB      != INVALID_HANDLE) IndicatorRelease(g_hBB);
}

//+------------------------------------------------------------------+
//| Timer: keep dashboard fresh                                      |
//+------------------------------------------------------------------+
void OnTimer()
{
   DrawDashboard();
   if(!g_srv) return;
   datetime now = TimeCurrent();
   if(now - g_lastBrainAt  >= 300) ServerBrain();   // ถามสมอง AI ทุก 5 นาที
   if(now - g_lastReportAt >= 300) ServerReport();  // รายงานสถานะขึ้นแดชบอร์ดทุก 5 นาที
}

//+------------------------------------------------------------------+
//| Main tick                                                        |
//+------------------------------------------------------------------+
void OnTick()
{
   UpdateDay();

   // manage the open position first (trailing / BE)
   ManageOpenPosition();

   // account-level daily circuit breakers
   CheckDailyDrawdown();
   CheckDailyTarget();

   // throttled dashboard
   if(TimeCurrent() != g_lastDashUpdate) { DrawDashboard(); g_lastDashUpdate = TimeCurrent(); }

   if(g_tradingPaused || g_targetReached) return;
   if(CountMyPositions() > 0) return;              // max 1 open trade

   // only act on a new closed M15 bar
   datetime barTime = iTime(_Symbol, PERIOD_M15, 0);
   if(barTime == 0 || barTime == g_lastM15Bar) return;
   g_lastM15Bar = barTime;

   EvaluateEntry();
}

//+------------------------------------------------------------------+
//| New server day detection (D1 bar open = 00:00 server time)       |
//+------------------------------------------------------------------+
void UpdateDay()
{
   datetime d = iTime(_Symbol, PERIOD_D1, 0);
   if(d == 0 || d == g_curDayStart) return;

   g_curDayStart       = d;
   g_startOfDayBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   g_tradingPaused     = false;
   g_targetReached     = false;
   PrintFormat("Aegis AI: new server day. StartOfDayBalance=%.2f | daily target=%.2f (%.2f%%) | DD limit=%.2f (%.0f%%)",
               g_startOfDayBalance, DailyTargetMoney(), g_dailyRate * 100.0,
               DailyDDMoney(), DailyDDPercent());
}

//+------------------------------------------------------------------+
//| 4B. Tiered daily max drawdown                                    |
//+------------------------------------------------------------------+
double DailyDDPercent()
{
   if(g_startOfDayBalance < 50.0)  return 25.0;
   if(g_startOfDayBalance < 500.0) return 15.0;
   return 10.0;
}
double DailyDDMoney() { return g_startOfDayBalance * DailyDDPercent() / 100.0; }

void CheckDailyDrawdown()
{
   if(g_tradingPaused || g_startOfDayBalance <= 0.0) return;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(g_startOfDayBalance - equity >= DailyDDMoney())
   {
      Print("Aegis AI: DAILY MAX DRAWDOWN HIT. Closing everything and sleeping until next server day.");
      CloseAllMyPositions();
      DeleteAllMyPendings();
      g_tradingPaused = true;
   }
}

//+------------------------------------------------------------------+
//| 5. Daily profit target                                           |
//+------------------------------------------------------------------+
double DailyTargetMoney() { return g_startOfDayBalance * g_dailyRate; }

void CheckDailyTarget()
{
   if(g_targetReached || g_startOfDayBalance <= 0.0) return;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity >= g_startOfDayBalance + DailyTargetMoney())
   {
      Print("Aegis AI: DAILY TARGET REACHED. Locking in profit, sleeping until next server day.");
      CloseAllMyPositions();
      DeleteAllMyPendings();
      g_targetReached = true;
   }
}

//+------------------------------------------------------------------+
//| 3. Lot sizing                                                    |
//+------------------------------------------------------------------+
double CalculateLotSize()
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double lot;
   if(balance < 50.0)
      lot = 0.01;                                   // survival mode: strict micro lot
   else
      lot = MathFloor(balance / 50.0) * 0.01;       // +0.01 lot per $50

   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(lotStep <= 0.0) lotStep = 0.01;

   lot = MathMax(lot, MathMax(0.01, minLot));
   lot = MathMin(lot, maxLot);
   lot = MathFloor(lot / lotStep + 0.0000001) * lotStep;
   return NormalizeDouble(lot, 2);
}

//+------------------------------------------------------------------+
//| 5(fix). Margin check with OrderCalcMargin + manual fallback      |
//+------------------------------------------------------------------+
bool IsMarginEnough(const ENUM_ORDER_TYPE type, const double lots, const double price, double &neededOut)
{
   double needed = 0.0;
   if(!OrderCalcMargin(type, _Symbol, lots, price, needed) || needed <= 0.0)
   {
      // Fallback: contract notional / leverage (never fail silently)
      double contract = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      long   lev      = AccountInfoInteger(ACCOUNT_LEVERAGE);
      if(lev <= 0) lev = 100;
      needed = lots * contract * price / (double)lev;
      if(Inp_VerboseLog)
         PrintFormat("Aegis AI: OrderCalcMargin failed (err %d) -> fallback margin=%.2f", GetLastError(), needed);
   }
   neededOut = needed;
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   return (freeMargin >= needed * 1.3);   // keep 30% headroom so a tiny account survives the open
}

//+------------------------------------------------------------------+
//| Verbose skip logger (once per bar)                               |
//+------------------------------------------------------------------+
void Skip(const string reason)
{
   if(!Inp_VerboseLog) return;
   if(g_lastSkipLogBar == g_lastM15Bar) return;   // one reason per bar
   g_lastSkipLogBar = g_lastM15Bar;
   Print("Skipped: ", reason);
}

//+------------------------------------------------------------------+
//| 6. Sniper entry evaluation on a fresh closed M15 bar             |
//+------------------------------------------------------------------+
void EvaluateEntry()
{
   // --- AI brain gate: news lock / trend bias from the server ---------
   if(g_srv && !g_brainAllow)
   {
      Skip("AI brain lock: " + g_brainReason);
      return;
   }

   // --- Safety: spread -----------------------------------------------
   double spread = SpreadPts();
   if(spread > (double)g_maxSpreadPts)
   {
      Skip(StringFormat("Spread (%.0f) > Max Allowed (%d)", spread, g_maxSpreadPts));
      return;
   }

   // --- Pull indicator data (closed bars; index 1 = signal bar) ------
   int need = Inp_SqueezeBars + 3;                  // bars 0 .. squeeze window
   double emaF[], emaS[], adx[], bbUp[], bbLo[];
   ArraySetAsSeries(emaF, true); ArraySetAsSeries(emaS, true);
   ArraySetAsSeries(adx, true);  ArraySetAsSeries(bbUp, true); ArraySetAsSeries(bbLo, true);

   if(CopyBuffer(g_hEmaFast, 0, 0, 3, emaF)    < 3 ||
      CopyBuffer(g_hEmaSlow, 0, 0, 3, emaS)    < 3 ||
      CopyBuffer(g_hADX,     0, 0, 3, adx)     < 3 ||
      CopyBuffer(g_hBB,      1, 0, need, bbUp) < need ||
      CopyBuffer(g_hBB,      2, 0, need, bbLo) < need)
   {
      Skip("Indicator data not ready yet");
      return;
   }

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M15, 0, need, rates) < need)
   {
      Skip("Price data not ready yet");
      return;
   }

   g_lastADX = adx[1];

   // --- Trend: EMA alignment on the closed bar ------------------------
   bool trendUp   = emaF[1] > emaS[1];
   bool trendDown = emaF[1] < emaS[1];
   if(!trendUp && !trendDown)
   {
      Skip(StringFormat("Trend not aligned (EMA%d %.2f vs EMA%d %.2f)",
                        Inp_EMA_Fast, emaF[1], Inp_EMA_Slow, emaS[1]));
      return;
   }

   // --- Momentum: ADX --------------------------------------------------
   if(adx[1] < Inp_ADX_Min)
   {
      Skip(StringFormat("ADX (%.1f) < Min (%.1f)", adx[1], Inp_ADX_Min));
      return;
   }

   // --- Volatility squeeze: bandwidth of the bars BEFORE the breakout --
   // (bars 2 .. 1+SqueezeBars must all be tight; the breakout bar itself
   //  is allowed to expand — that IS the breakout.)
   double maxBW = 0.0;
   for(int i = 2; i <= 1 + Inp_SqueezeBars; i++)
   {
      double bw = (bbUp[i] - bbLo[i]) / _Point;
      if(bw > maxBW) maxBW = bw;
   }
   if(maxBW > (double)g_squeezeMaxPts)
   {
      Skip(StringFormat("No BB squeeze detected in last %d bars (max BW=%.0f pts, need <=%d)",
                        Inp_SqueezeBars, maxBW, g_squeezeMaxPts));
      return;
   }

   // --- Breakout candle (bar 1): pierce band and close on/near it ------
   double o = rates[1].open, h = rates[1].high, l = rates[1].low, c = rates[1].close;
   double range = h - l;
   if(range <= 0.0) { Skip("Flat signal candle"); return; }
   double bodyRatio = MathAbs(c - o) / range;
   double bandW     = bbUp[1] - bbLo[1];
   double nearBand  = 0.10 * bandW;                 // "close near the band" tolerance

   bool buBreak = (c > bbUp[1]) || (h > bbUp[1] && (bbUp[1] - c) <= nearBand);
   bool beBreak = (c < bbLo[1]) || (l < bbLo[1] && (c - bbLo[1]) <= nearBand);

   bool buySignal  = trendUp   && buBreak && (c > o);
   bool sellSignal = trendDown && beBreak && (c < o);

   // AI brain bias: trade only with the AI-read trend direction
   if(g_srv && g_brainBias == "BUY"  && sellSignal) { Skip("AI bias BUY only - skipped SELL signal"); return; }
   if(g_srv && g_brainBias == "SELL" && buySignal)  { Skip("AI bias SELL only - skipped BUY signal"); return; }
   if(g_srv && g_brainBias == "NONE") { Skip("AI brain: " + g_brainReason); return; }

   if(!buySignal && !sellSignal)
   {
      Skip(StringFormat("No band breakout in trend direction (close=%.2f, BBup=%.2f, BBlo=%.2f)",
                        c, bbUp[1], bbLo[1]));
      return;
   }
   if(bodyRatio < Inp_MinBodyRatio)
   {
      Skip(StringFormat("Breakout candle too weak (body %.2f < %.2f)", bodyRatio, Inp_MinBodyRatio));
      return;
   }

   // --- Build the order -------------------------------------------------
   ENUM_ORDER_TYPE type = buySignal ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = buySignal ? ask : bid;

   double lots = CalculateLotSize();
   double neededMargin = 0.0;
   if(!IsMarginEnough(type, lots, entry, neededMargin))
   {
      Skip(StringFormat("Not enough margin (need $%.2f incl. buffer, free $%.2f, lot %.2f)",
                        neededMargin * 1.3, AccountInfoDouble(ACCOUNT_MARGIN_FREE), lots));
      return;
   }

   double sl = BuildStopLoss(buySignal, entry, rates);
   double tp = BuildTakeProfit(buySignal, entry, lots);

   bool ok = buySignal ? trade.Buy(lots, _Symbol, 0.0, sl, tp, "AegisAI v2")
                       : trade.Sell(lots, _Symbol, 0.0, sl, tp, "AegisAI v2");
   uint rc = trade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL))
      PrintFormat("Aegis AI: %s %.2f lots @ %.2f | SL %.2f | TP %.2f | ADX %.1f | spread %.0f",
                  buySignal ? "BUY" : "SELL", lots, entry, sl, tp, adx[1], spread);
   else
      PrintFormat("Aegis AI: order FAILED retcode=%u (%s)", rc, trade.ResultRetcodeDescription());
}

//+------------------------------------------------------------------+
//| 4A. Swing-based SL with tiered hard cap                          |
//+------------------------------------------------------------------+
double BuildStopLoss(const bool isBuy, const double entry, const MqlRates &rates[])
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   int capPts = (balance < 100.0) ? g_maxSL_LowPts : g_maxSL_HighPts;

   // swing low/high over the last Inp_SwingBars closed bars
   int lastIdx = MathMin(Inp_SwingBars, ArraySize(rates) - 1);
   double swing = isBuy ? rates[1].low : rates[1].high;
   for(int i = 1; i <= lastIdx; i++)
   {
      if(isBuy)  swing = MathMin(swing, rates[i].low);
      else       swing = MathMax(swing, rates[i].high);
   }

   double sl = isBuy ? swing - Pts(g_slBufferPts)
                     : swing + Pts(g_slBufferPts);

   // hard cap the distance by balance tier
   double dist = MathAbs(entry - sl);
   if(dist > Pts(capPts))
      sl = isBuy ? entry - Pts(capPts) : entry + Pts(capPts);

   // respect the broker's minimum stop distance
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = MathMax((double)stopsLevel, SpreadPts() + 1.0) * _Point;
   if(MathAbs(entry - sl) < minDist)
      sl = isBuy ? entry - minDist : entry + minDist;

   return NormalizeDouble(sl, _Digits);
}

//+------------------------------------------------------------------+
//| 5. TP sized to the remaining daily money target, hard-capped     |
//+------------------------------------------------------------------+
double BuildTakeProfit(const bool isBuy, const double entry, const double lots)
{
   double equity    = AccountInfoDouble(ACCOUNT_EQUITY);
   double remaining = (g_startOfDayBalance + DailyTargetMoney()) - equity;
   if(remaining < 0.10) remaining = 0.10;

   double tickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double ptValue  = (tickSize > 0.0) ? tickVal * (_Point / tickSize) : 0.0;  // $ per point per 1.0 lot

   double tpPts;
   if(ptValue <= 0.0 || lots <= 0.0)
      tpPts = (double)g_maxTPPts;                       // safe fallback
   else
      tpPts = remaining / (lots * ptValue);

   tpPts = MathMax(tpPts, (double)g_minTPPts);
   tpPts = MathMin(tpPts, (double)g_maxTPPts);          // hard cap 800 (scaled)

   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   tpPts = MathMax(tpPts, (double)stopsLevel + 1.0);

   double tp = isBuy ? entry + tpPts * _Point : entry - tpPts * _Point;
   return NormalizeDouble(tp, _Digits);
}

//+------------------------------------------------------------------+
//| 5. Trailing: BE+20 at +150, then stepped +50 trailing            |
//+------------------------------------------------------------------+
void ManageOpenPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != Inp_Magic) continue;

      long   ptype = PositionGetInteger(POSITION_TYPE);
      double open  = PositionGetDouble(POSITION_PRICE_OPEN);
      double curSL = PositionGetDouble(POSITION_SL);
      double curTP = PositionGetDouble(POSITION_TP);
      double bid   = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask   = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

      double profitPts = (ptype == POSITION_TYPE_BUY) ? (bid - open) / _Point
                                                      : (open - ask) / _Point;
      if(profitPts < (double)g_beTriggerPts) continue;

      // stepped ladder: BE+offset at trigger, +trailStep per extra step of profit
      double steps  = MathFloor((profitPts - (double)g_beTriggerPts) / (double)g_trailStepPts);
      double lockPts = (double)g_beOffsetPts + steps * (double)g_trailStepPts;

      double newSL = (ptype == POSITION_TYPE_BUY) ? open + lockPts * _Point
                                                  : open - lockPts * _Point;
      newSL = NormalizeDouble(newSL, _Digits);

      bool improve = (ptype == POSITION_TYPE_BUY) ? (curSL == 0.0 || newSL > curSL + _Point * 0.5)
                                                  : (curSL == 0.0 || newSL < curSL - _Point * 0.5);
      if(!improve) continue;

      // stay outside the broker's min stop distance from current price
      long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
      double minDist = (double)stopsLevel * _Point;
      if(ptype == POSITION_TYPE_BUY  && bid - newSL < minDist) continue;
      if(ptype == POSITION_TYPE_SELL && newSL - ask < minDist) continue;

      if(trade.PositionModify(ticket, newSL, curTP) && Inp_VerboseLog)
         PrintFormat("Aegis AI: trail -> SL %.2f (locked +%.0f pts)", newSL, lockPts);
   }
}

//+------------------------------------------------------------------+
//| Position / order utilities                                       |
//+------------------------------------------------------------------+
int CountMyPositions()
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == Inp_Magic) n++;
   }
   return n;
}

void CloseAllMyPositions()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != Inp_Magic) continue;
      if(!trade.PositionClose(ticket))
         PrintFormat("Aegis AI: failed to close #%I64u retcode=%u", ticket, trade.ResultRetcode());
   }
}

void DeleteAllMyPendings()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      if(OrderGetInteger(ORDER_MAGIC) != Inp_Magic) continue;
      if(!trade.OrderDelete(ticket))
         PrintFormat("Aegis AI: failed to delete order #%I64u retcode=%u", ticket, trade.ResultRetcode());
   }
}

//+------------------------------------------------------------------+
//| 7. On-chart dashboard                                            |
//+------------------------------------------------------------------+
void SetLabel(const string name, const int y, const string text, const color clr)
{
   string obj = DASH_PREFIX + name;
   if(ObjectFind(0, obj) < 0)
   {
      ObjectCreate(0, obj, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, 16);
      ObjectSetInteger(0, obj, OBJPROP_FONTSIZE, 9);
      ObjectSetString (0, obj, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, obj, OBJPROP_HIDDEN, true);
   }
   ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
   ObjectSetString (0, obj, OBJPROP_TEXT, text);
   ObjectSetInteger(0, obj, OBJPROP_COLOR, clr);
}

void DrawDashboard()
{
   // backdrop
   string bg = DASH_PREFIX + "BG";
   if(ObjectFind(0, bg) < 0)
   {
      ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, 8);
      ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 18);
      ObjectSetInteger(0, bg, OBJPROP_XSIZE, 330);
      ObjectSetInteger(0, bg, OBJPROP_YSIZE, 188);
      ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'12,14,20');
      ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bg, OBJPROP_COLOR, C'180,140,50');
      ObjectSetInteger(0, bg, OBJPROP_BACK, false);
      ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);
   }

   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double dayPL   = equity - g_startOfDayBalance;
   double target  = DailyTargetMoney();
   double ddMoney = DailyDDMoney();
   double ddUsed  = MathMax(0.0, g_startOfDayBalance - equity);

   string status;
   color  stClr;
   if(g_tradingPaused)              { status = "MAX DD REACHED - SLEEPING"; stClr = C'235,80,80';  }
   else if(g_targetReached)         { status = "TARGET REACHED";            stClr = C'80,220,120'; }
   else if(CountMyPositions() > 0)  { status = "In Trade";                  stClr = C'90,170,255'; }
   else                             { status = "Scanning...";               stClr = C'200,200,200';}

   color gold  = C'212,175,55';
   color dim   = C'150,150,160';
   color white = C'230,230,235';
   color plClr = (dayPL >= 0.0) ? C'80,220,120' : C'235,80,80';

   string brain = !g_srv ? "OFFLINE (local mode)"
                 : !g_brainAllow ? "LOCK: " + StringSubstr(g_brainReason, 0, 30)
                 : "OK bias=" + g_brainBias;

   int y = 24, dy = 18;
   SetLabel("L0", y,        "AEGIS AUTO - AI Trading (24h)", gold);            y += dy;
   SetLabel("L1", y, StringFormat("Daily Target Rate : %.2f%%%s", g_dailyRate * 100.0, g_rateCapped ? " (MAX CAP)" : ""), white); y += dy;
   SetLabel("L2", y, StringFormat("Start Bal / Equity: $%.2f / $%.2f", g_startOfDayBalance, equity), white); y += dy;
   SetLabel("L3", y, StringFormat("Target $ / Day P&L: +$%.2f / %s$%.2f", target, dayPL >= 0 ? "+" : "-", MathAbs(dayPL)), plClr); y += dy;
   SetLabel("L4", y, StringFormat("DD Limit %.0f%%     : -$%.2f (used -$%.2f)", DailyDDPercent(), ddMoney, ddUsed), dim); y += dy;
   SetLabel("L5", y, StringFormat("Lot %.2f | Spread %.0f | ADX %.1f | x%d pts", CalculateLotSize(), SpreadPts(), g_lastADX, g_scale), dim); y += dy;
   SetLabel("L6", y, StringFormat("Status: %s", status), stClr);              y += dy;
   SetLabel("L7", y, StringFormat("AI Brain: %s", brain), g_srv ? (g_brainAllow ? C'120,200,255' : C'235,80,80') : dim);

   ChartRedraw(0);
}
//+------------------------------------------------------------------+
