import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  Radio,
  Calculator,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Play,
  Zap,
  Sliders,
  DollarSign,
  AlertCircle,
  FileText,
  Volume2,
} from 'lucide-react';
import {
  SymbolName,
  MarketSummaryItem,
  SignalRecord,
  EconomicNewsEvent,
  LotCalculationResult,
  LifecycleState,
} from '../shared/types.js';
import { INSTRUMENTS } from '../shared/constants.js';
import { TradingChart } from './components/TradingChart.js';

const ALL_LIFECYCLE_STATES: { state: LifecycleState; label: string; desc: string }[] = [
  { state: 'ANALYZING', label: 'Analyzing', desc: 'Continuous candle evaluation' },
  { state: 'WAITING_CONFIRMATION', label: 'Wait Conf', desc: 'Awaiting M5/M15 bar close' },
  { state: 'ENTRY_ZONE_ACTIVE', label: 'Zone Active', desc: 'Valid signal published, waiting price touch' },
  { state: 'ENTRY_CONFIRMED', label: 'Entered', desc: 'Bid/Ask filled inside entry zone' },
  { state: 'TP1_HIT', label: 'TP 1 Hit', desc: 'Take Profit 1 (+1:1 RR) achieved' },
  { state: 'TP2_HIT', label: 'TP 2 Hit', desc: 'Take Profit 2 (+1:2 RR) achieved' },
  { state: 'TP3_HIT', label: 'TP 3 Hit', desc: 'Take Profit 3 achieved' },
  { state: 'ALL_TP_DONE', label: 'All TP Done', desc: 'Full target completed' },
  { state: 'SL_HIT', label: 'SL Hit', desc: 'Stopped out at defined SL' },
  { state: 'INVALIDATED', label: 'Invalidated', desc: 'SL breached prior to entry' },
  { state: 'EXPIRED', label: 'Expired', desc: 'Time limit exceeded > 4h' },
  { state: 'INVALIDATED_AMBIGUOUS_VOLATILITY', label: 'Volatility Guard', desc: 'Ambiguous freak spike filtered' },
];

export default function App() {
  const [marketSummary, setMarketSummary] = useState<MarketSummaryItem[]>([]);
  const [activeSignals, setActiveSignals] = useState<SignalRecord[]>([]);
  const [signalHistory, setSignalHistory] = useState<SignalRecord[]>([]);
  const [newsList, setNewsList] = useState<EconomicNewsEvent[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolName>('XAUUSD');
  const [candles, setCandles] = useState<any[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [telegramLogs, setTelegramLogs] = useState<{ id: string; msg: string; time: string }[]>([]);

  // Lot Calculator state
  const [calcBalance, setCalcBalance] = useState<number>(10000);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(1.0);
  const [calcEntry, setCalcEntry] = useState<number>(2746.30);
  const [calcSL, setCalcSL] = useState<number>(2739.00);
  const [calcResult, setCalcResult] = useState<LotCalculationResult | null>(null);

  // Simulation controls state
  const [spreadSpikeActive, setSpreadSpikeActive] = useState<boolean>(false);
  const [newsBlackoutActive, setNewsBlackoutActive] = useState<boolean>(false);

  // Active signal for currently selected symbol
  const currentSignal = useMemo(() => {
    return activeSignals.find((s) => s.symbol === selectedSymbol);
  }, [activeSignals, selectedSymbol]);

  // Fetch initial REST data
  const fetchData = async () => {
    try {
      const [sumRes, sigRes, histRes, newsRes] = await Promise.all([
        fetch('/api/v1/market/summary').then((r) => r.json()),
        fetch('/api/v1/signals/active').then((r) => r.json()),
        fetch('/api/v1/signals/history').then((r) => r.json()),
        fetch('/api/v1/news').then((r) => r.json()),
      ]);

      if (sumRes.data) setMarketSummary(sumRes.data);
      if (sigRes.data) setActiveSignals(sigRes.data);
      if (histRes.data) setSignalHistory(histRes.data);
      if (newsRes.data) setNewsList(newsRes.data);
    } catch (err) {
      console.error('Failed to fetch initial market data', err);
    }
  };

  const fetchCandles = async (sym: SymbolName) => {
    try {
      const res = await fetch(`/api/v1/candles/${sym}?timeframe=M15`).then((r) => r.json());
      if (res.data) setCandles(res.data);
    } catch (err) {
      console.error('Failed to fetch candles', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchCandles(selectedSymbol);
  }, [selectedSymbol]);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket;
    let pingInterval: NodeJS.Timeout;

    const connectWs = () => {
      const wsHost = import.meta.env.VITE_WS_HOST || (window.location.hostname.endsWith('.vercel.app') ? 'organisations-ppm-caribbean-silent.trycloudflare.com' : window.location.host);
      const protocol = window.location.protocol === 'https:' || wsHost.includes('trycloudflare.com') ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${wsHost}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'CONNECTED') {
            setMarketSummary(payload.data.summary);
            setActiveSignals(payload.data.activeSignals);
            setNewsList(payload.data.news);
          } else if (payload.type === 'TICK') {
            const tick = payload.data;
            setMarketSummary((prev) =>
              prev.map((item) => {
                if (item.symbol === tick.symbol) {
                  const spec = INSTRUMENTS[item.symbol];
                  const spreadPips = (tick.ask - tick.bid) / spec.pipSize;
                  return {
                    ...item,
                    bid: tick.bid,
                    ask: tick.ask,
                    spreadPips: Number(spreadPips.toFixed(1)),
                    lastTickTime: tick.time_msc,
                    feedHealthy: true,
                  };
                }
                return item;
              })
            );
          } else if (payload.type === 'NEW_SIGNAL') {
            const newSig = payload.data.signal;
            setActiveSignals((prev) => [newSig, ...prev.filter((s) => s.id !== newSig.id)]);
            setSignalHistory((prev) => [newSig, ...prev]);
            addTelegramLog(payload.data.message);
          } else if (payload.type === 'SIGNAL_TRANSITION') {
            const { signal, message } = payload.data;
            setActiveSignals((prev) => {
              const terminal = ['ALL_TP_DONE', 'SL_HIT', 'CLOSED_MANUAL', 'INVALIDATED', 'EXPIRED', 'INVALIDATED_AMBIGUOUS_VOLATILITY'];
              if (terminal.includes(signal.lifecycleState)) {
                return prev.filter((s) => s.id !== signal.id);
              }
              return prev.map((s) => (s.id === signal.id ? signal : s));
            });
            setSignalHistory((prev) =>
              prev.map((s) => (s.id === signal.id ? signal : s))
            );
            if (message) addTelegramLog(message);
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(pingInterval);
        setTimeout(connectWs, 3000);
      };
    };

    connectWs();
    return () => {
      clearInterval(pingInterval);
      if (ws) ws.close();
    };
  }, []);

  const addTelegramLog = (msg: string) => {
    setTelegramLogs((prev) => [
      { id: Math.random().toString(), msg, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 20),
    ]);
  };

  // Run Lot Calculation
  const runLotCalculator = async () => {
    try {
      const res = await fetch('/api/v1/calculator/lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          balance: calcBalance,
          riskPercentage: calcRiskPct,
          entryPrice: calcEntry,
          stopLossPrice: calcSL,
        }),
      }).then((r) => r.json());

      if (res.data) setCalcResult(res.data);
    } catch (err) {
      console.error('Lot calc failed', err);
    }
  };

  useEffect(() => {
    runLotCalculator();
  }, [selectedSymbol, calcBalance, calcRiskPct, calcEntry, calcSL]);

  const syncCalculatorFromSignal = () => {
    if (currentSignal) {
      setCalcEntry(currentSignal.entryZone.suggested);
      setCalcSL(currentSignal.stopLoss);
    }
  };

  // Simulation Handlers
  const handleTriggerSignal = async () => {
    await fetch('/api/v1/simulation/trigger-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: selectedSymbol }),
    });
    setTimeout(fetchData, 400);
  };

  const handleSimulateEntry = async () => {
    if (!currentSignal) return;
    const entryPrice = (currentSignal.entryZone.low + currentSignal.entryZone.high) / 2;
    await fetch('/api/v1/simulation/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedSymbol,
        bid: entryPrice - 0.2,
        ask: entryPrice,
      }),
    });
  };

  const handleSimulateTP1 = async () => {
    if (!currentSignal) return;
    await fetch('/api/v1/simulation/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedSymbol,
        bid: currentSignal.targets.tp1 + 0.2,
        ask: currentSignal.targets.tp1 + 0.4,
      }),
    });
  };

  const handleSimulateSL = async () => {
    if (!currentSignal) return;
    await fetch('/api/v1/simulation/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedSymbol,
        bid: currentSignal.stopLoss - 0.2,
        ask: currentSignal.stopLoss,
      }),
    });
  };

  const toggleSpreadSpike = async () => {
    const next = !spreadSpikeActive;
    setSpreadSpikeActive(next);
    await fetch('/api/v1/simulation/spread-multiplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedSymbol,
        multiplier: next ? 2.5 : 1.0, // 2.5x triggers BLOCKED spread
      }),
    });
  };

  const toggleNewsBlackout = async () => {
    const next = !newsBlackoutActive;
    setNewsBlackoutActive(next);
    await fetch('/api/v1/simulation/news-blackout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next, minutesFromNow: 15 }),
    });
    fetchData();
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#030712] text-slate-100">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between px-6 py-3.5 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight font-mono text-white">
                AI TRADING SIGNAL TERMINAL
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                MVP v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Actionable Risk-First Terminal • Non-Repainting Multi-TF Consensus
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          {/* Feed Bridge Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-400">MT5 Master Bridge:</span>
            <span className={wsConnected ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
              {wsConnected ? 'ONLINE (12ms)' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Active News Warning */}
          {newsBlackoutActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>NEWS BLACKOUT ACTIVE (T-15m)</span>
            </div>
          )}

          <div className="text-slate-500 hidden sm:block">
            {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
          </div>
        </div>
      </header>

      {/* 4 Instrument Summary Cards */}
      <section className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/60 border-b border-slate-900">
        {marketSummary.map((item) => {
          const isSelected = item.symbol === selectedSymbol;
          return (
            <button
              key={item.symbol}
              onClick={() => setSelectedSymbol(item.symbol)}
              className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-slate-900 border-cyan-500/60 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/30'
                  : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold font-mono tracking-wider text-slate-100">
                  {item.symbol}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                    item.safetyStatus === 'SAFE'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : item.safetyStatus === 'WARNING'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {item.safetyStatus}
                </span>
              </div>

              <div className="flex items-baseline justify-between font-mono">
                <div className="text-lg font-bold text-slate-100">
                  {item.bid.toFixed(item.symbol.includes('JPY') ? 3 : item.symbol.includes('USD') && !item.symbol.includes('XAU') && !item.symbol.includes('XAG') ? 5 : 2)}
                </div>
                <div className="text-xs text-slate-400">
                  Spread: <span className="text-cyan-400 font-semibold">{item.spreadPips} pips</span>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/60 pt-1.5">
                <span>Max: {item.maxSpreadPips} pips</span>
                <span>
                  Active Signals:{' '}
                  <span className={item.activeSignalCount > 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {item.activeSignalCount}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Main Grid Content */}
      <main className="flex-1 px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Chart & 13-State Lifecycle Tracker (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Chart Component */}
          <TradingChart symbol={selectedSymbol} activeSignal={currentSignal} candles={candles} />

          {/* 13-State Signal Lifecycle Visualizer */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold font-mono tracking-tight text-slate-200">
                  13-STATE SIGNAL LIFECYCLE TRACKER
                </h2>
              </div>
              {currentSignal ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      currentSignal.direction === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}
                  >
                    {currentSignal.direction} ({currentSignal.confidence}%)
                  </span>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    {currentSignal.lifecycleState}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-mono text-slate-500">NO ACTIVE SIGNAL FOR {selectedSymbol}</span>
              )}
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              {ALL_LIFECYCLE_STATES.map((step) => {
                const isCurrent = currentSignal?.lifecycleState === step.state;
                return (
                  <div
                    key={step.state}
                    className={`p-2.5 rounded-lg border text-xs font-mono transition-all ${
                      isCurrent
                        ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-400/50'
                        : 'bg-slate-950/50 border-slate-800/60 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-bold ${isCurrent ? 'text-cyan-300' : 'text-slate-300'}`}>
                        {step.label}
                      </span>
                      {isCurrent && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight truncate">{step.desc}</div>
                  </div>
                );
              })}
            </div>

            {/* Signal Details if Active */}
            {currentSignal && (
              <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block">Entry Zone:</span>
                  <span className="text-slate-200 font-bold">
                    {currentSignal.entryZone.low.toFixed(2)} - {currentSignal.entryZone.high.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Stop Loss:</span>
                  <span className="text-rose-400 font-bold">{currentSignal.stopLoss.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">TP Targets:</span>
                  <span className="text-emerald-400 font-bold">
                    {currentSignal.targets.tp1.toFixed(2)} / {currentSignal.targets.tp2.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">R:R Planned:</span>
                  <span className="text-cyan-400 font-bold">1:{currentSignal.riskRewardRatio}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Explainable AI & Lot Calculator (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Explainable AI Reasoning Checklist */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold font-mono tracking-tight text-slate-200">
                EXPLAINABLE AI CONFLUENCE AUDIT
              </h2>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {currentSignal ? (
                currentSignal.reasoning.map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 text-slate-300"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))
              ) : (
                <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/60 text-slate-500 text-center">
                  Market status WAIT for {selectedSymbol}. Waiting for H1/M15/M5 candle alignment.
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Broker Lot Size Calculator */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold font-mono tracking-tight text-slate-200">
                  DYNAMIC LOT CALCULATOR
                </h2>
              </div>
              {currentSignal && (
                <button
                  onClick={syncCalculatorFromSignal}
                  className="px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono transition-all"
                >
                  Sync Active Signal
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Account Balance ($)</label>
                <input
                  type="number"
                  value={calcBalance}
                  onChange={(e) => setCalcBalance(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Risk Percentage (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.25"
                    max="3.0"
                    step="0.25"
                    value={calcRiskPct}
                    onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                    className="flex-1 accent-cyan-400"
                  />
                  <span className="text-cyan-400 font-bold w-12 text-right">{calcRiskPct}%</span>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Entry Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={calcEntry}
                  onChange={(e) => setCalcEntry(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Stop Loss Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={calcSL}
                  onChange={(e) => setCalcSL(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Calculated Output Card */}
            {calcResult && (
              <div className="mt-4 p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-lg grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block">Max Risk Budget:</span>
                  <span className="text-slate-100 font-bold">${calcResult.riskAmountUsd.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">SL Distance:</span>
                  <span className="text-rose-400 font-bold">{calcResult.slDistancePoints} points</span>
                </div>
                <div className="col-span-2 p-2 bg-slate-950 rounded border border-cyan-500/40 flex items-center justify-between">
                  <span className="text-cyan-300 font-bold">RECOMMENDED LOT:</span>
                  <span className="text-lg font-bold text-emerald-400">{calcResult.calculatedLot} Lots</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Simulation Controls & Anti-Repaint Ledger */}
      <footer className="px-6 py-4 bg-slate-950 border-t border-slate-900 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Simulation Controls (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold font-mono tracking-tight text-slate-200">
              SIMULATION & VERIFICATION CONTROLS
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            <button
              onClick={handleTriggerSignal}
              className="px-2.5 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all text-center flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> Trigger BUY
            </button>
            <button
              onClick={handleSimulateEntry}
              disabled={!currentSignal}
              className="px-2.5 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-semibold transition-all text-center"
            >
              Touch Entry
            </button>
            <button
              onClick={handleSimulateTP1}
              disabled={!currentSignal}
              className="px-2.5 py-2 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold transition-all text-center"
            >
              Hit TP1
            </button>
            <button
              onClick={handleSimulateSL}
              disabled={!currentSignal}
              className="px-2.5 py-2 rounded bg-rose-600/80 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold transition-all text-center"
            >
              Hit SL
            </button>
            <button
              onClick={toggleSpreadSpike}
              className={`px-2.5 py-2 rounded border font-semibold transition-all text-center ${
                spreadSpikeActive
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Spread Spike
            </button>
            <button
              onClick={toggleNewsBlackout}
              className={`px-2.5 py-2 rounded border font-semibold transition-all text-center ${
                newsBlackoutActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              News Blackout
            </button>
          </div>
        </div>

        {/* Telegram Push Notification Stream & Ledger (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold font-mono tracking-tight text-slate-200">
                LIVE TELEGRAM ALERT DISPATCH LEDGER
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">FORMAT BAKU PRD 4.7</span>
          </div>

          <div className="h-28 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
            {telegramLogs.length > 0 ? (
              telegramLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded bg-slate-950/80 border border-slate-800/60 text-slate-300 whitespace-pre-wrap leading-relaxed"
                >
                  <span className="text-cyan-400 font-bold block mb-1">[{log.time}] Broadcasted Alert:</span>
                  {log.msg}
                </div>
              ))
            ) : (
              <div className="text-slate-600 text-center py-6 text-xs">
                No alert broadcast yet. Ticks and signal triggers will stream alerts here.
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
