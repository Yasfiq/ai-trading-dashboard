# AI Trading Signal Terminal (MVP v1.0)
> Actionable Risk-First Terminal dengan Non-Repainting Multi-Timeframe Consensus & 13-State Deterministic Lifecycle

## 1. Ikhtisar Arsitektur
Sistem terminal trading algoritmik dirancang memprioritaskan mitigasi risiko broker, transparansi audit, dan pencegahan repainting sinyal.
- **Backend Runtime**: Node.js v26 + TypeScript + Fastify + `@fastify/websocket`
- **Database / Audit Storage**: Embedded SQLite native ES Module (`node:sqlite` / `DatabaseSync`)
- **Frontend UI**: React 19 + Vite + Tailwind CSS + TradingView Lightweight Charts + Lucide Icons
- **Broker Specs**: XAUUSD, XAGUSD, USDJPY, GBPUSD dengan model kontrak riil (tickSize, tickValue, pipSize, maxSpread threshold)

## 2. Fitur Utama
1. **Multi-Timeframe Consensus Engine (H1, M15, M5)**
   - *H1 Trend Filter*: EMA 50 > EMA 200 dan ADX(14) > 25.
   - *M15 Momentum*: EMA 20 alignment & RSI(14) Wilder smoothing (45-65 bullish, 35-55 bearish).
   - *M5 Execution Trigger*: Konfirmasi candle close non-repainting.
2. **Circuit Breaker & Safety Guard**
   - *Spread Gatekeeper*: Sinyal diblok otomatis bila spread > maxSpreadPips (`SAFE`, `WARNING`, `BLOCKED`).
   - *News Blackout Window*: Proteksi berita berdampak HIGH pada jendela `T-30m` hingga `T+15m`.
   - *Stale Feed Detector*: Alert otomatis bila feed tick terputus > 5.000 ms.
3. **13-State Deterministic Lifecycle Machine**
   - Transisi status: `ANALYZING` -> `WAITING_CONFIRMATION` -> `ENTRY_ZONE_ACTIVE` -> `ENTRY_CONFIRMED` -> `TP1_HIT` -> `TP2_HIT` -> `TP3_HIT` -> `ALL_TP_DONE`
   - Terminal cancellation: `SL_HIT`, `INVALIDATED`, `EXPIRED`, `CLOSED_MANUAL`, `INVALIDATED_AMBIGUOUS_VOLATILITY`.
4. **Dynamic Broker Lot Calculator**
   - Formula presisi: `Lot = (Balance * Risk%) / (SL_Distance_Points * TickValue_Per_Point)`
   - Auto-clamping & step normalization (`minVolume`, `maxVolume`, `volumeStep`).
5. **Interactive Dark Terminal UI**
   - Live tick streaming via WebSocket.
   - Stepper interaktif 13-state lifecycle.
   - Explainable AI Confluence Checklist.
   - Interactive candlestick chart overlay.
   - Simulation & circuit breaker testing controls.

## 3. Struktur Direktori
```
ai-trading-dashboard/
├── src/
│   ├── shared/
│   │   ├── types.ts              # Contract freezing: tipe data backend & frontend
│   │   └── constants.ts          # Broker specs, circuit breaker thresholds
│   ├── backend/
│   │   ├── engine/
│   │   │   ├── indicators.ts     # Formula Wilder RSI, EMA, ATR, ADX
│   │   │   ├── risk_calculator.ts# Formula lot sizing & target RR
│   │   │   ├── safety_filter.ts  # Circuit breaker spread & news blackout
│   │   │   ├── lifecycle_state_machine.ts # 13-state deterministic tracker
│   │   │   └── consensus_engine.ts        # H1-M15-M5 consensus engine
│   │   ├── storage/
│   │   │   └── db.ts             # SQLite schema & immutable audit ledger
│   │   ├── ingestion/
│   │   │   └── market_gateway.ts # Tick & bar close event routing
│   │   ├── simulator/
│   │   │   └── tick_feeder.ts    # Real-time tick & candle synthetic generator
│   │   └── server.ts             # Fastify REST & WebSocket server
│   └── frontend/
│       ├── components/
│       │   └── TradingChart.tsx  # TradingView Lightweight Candlestick Chart
│       ├── App.tsx               # Terminal workspace & simulation controls
│       ├── main.tsx              # React mounting root
│       └── index.css             # Tailwind dark terminal styles
├── tests/
│   ├── unit/                     # TDD unit tests (Indicators, Risk, Safety, Lifecycle, Consensus)
│   └── integration/              # Fastify REST & WebSocket API tests
├── dist/                         # Compiled client production assets
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 4. Cara Menjalankan
```bash
# 1. Jalankan Seluruh Test Suite (Vitest)
npm test

# 2. Build Frontend UI
npm run build:client

# 3. Jalankan Terminal Server (REST + WebSocket + Simulator)
npm run server
# Buka di browser: http://localhost:3000
```
