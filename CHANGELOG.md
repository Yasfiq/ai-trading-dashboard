# Changelog - AI Trading Signal Terminal MVP

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-11-02
### Added
- **Contract Freezing (`src/shared/types.ts`, `src/shared/constants.ts`)**:
  - Definisi tipe data instrumen, lifecycle 13 state, safety status, payload tick/bar, dan struktur sinyal.
  - Spesifikasi broker untuk 4 instrumen: `XAUUSD`, `XAGUSD`, `USDJPY`, `GBPUSD`.
- **Red-Green TDD Test Suite (`tests/unit/*`, `tests/integration/*`)**:
  - 23 Unit & integration tests dengan coverage 100% pada logika matematis dan transisi state.
- **Matematika Indikator (`src/backend/engine/indicators.ts`)**:
  - Implementasi EMA iteratif, RSI smoothed Wilder, True Range / ATR, ADX directional index.
- **Risk & Lot Management (`src/backend/engine/risk_calculator.ts`)**:
  - Kalkulasi lot broker-compliant, penyesuaian volume step, dan level TP1/TP2/TP3.
- **Circuit Breakers (`src/backend/engine/safety_filter.ts`)**:
  - Spread threshold checks (`SAFE`, `WARNING`, `BLOCKED`), kalender berita blackout `T-30m` hingga `T+15m`, dan deteksi staleness data feed (5000ms).
- **13-State Lifecycle Machine (`src/backend/engine/lifecycle_state_machine.ts`)**:
  - Penanganan transisi deterministik berbasis Ask/Bid tick langsung dengan audit event logger.
- **Multi-TF Consensus Engine (`src/backend/engine/consensus_engine.ts`)**:
  - Logika konsensus multi-timeframe H1-M15-M5 non-repainting dengan checklist explainable AI.
- **Audit Storage SQLite (`src/backend/storage/db.ts`)**:
  - Persistence berbasis ES Module native `node:sqlite` (`DatabaseSync`) dengan skema tabel instrumen, sinyal, dan transisi event.
- **Market Gateway & Simulator (`src/backend/ingestion/market_gateway.ts`, `src/backend/simulator/tick_feeder.ts`)**:
  - Buffer bar multi-timeframe, dispatching event WebSocket, dan simulator tick/volatilitas sintetis.
- **REST API & WebSocket Server (`src/backend/server.ts`)**:
  - Endpoint REST v1 lengkap, live WebSocket stream (`TICK`, `NEW_SIGNAL`, `SIGNAL_TRANSITION`), dan hosting bundle frontend statis.
- **Frontend Dashboard Terminal (`src/frontend/*`)**:
  - Dark terminal theme, 4 Instrument cards, 13-state visualizer stepper, TradingView Candlestick Chart, Dynamic Lot Calculator, dan Simulation Playback Controls.
