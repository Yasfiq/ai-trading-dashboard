import { SymbolName, TickData, BarCloseData } from '../../shared/types.js';
import { INSTRUMENTS } from '../../shared/constants.js';
import { MarketGateway, CandleRecord } from '../ingestion/market_gateway.js';

export class MarketSimulator {
  private gateway: MarketGateway;
  private intervalId: NodeJS.Timeout | null = null;
  private basePrices: Record<SymbolName, number> = {
    XAUUSD: 2745.50,
    XAGUSD: 32.40,
    USDJPY: 153.25,
    GBPUSD: 1.2985,
  };
  private currentPrices: Record<SymbolName, number>;
  private spreadMultipliers: Record<SymbolName, number> = {
    XAUUSD: 1.0,
    XAGUSD: 1.0,
    USDJPY: 1.0,
    GBPUSD: 1.0,
  };

  constructor(gateway: MarketGateway) {
    this.gateway = gateway;
    this.currentPrices = { ...this.basePrices };
    this.seedInitialHistory();
  }

  public seedInitialHistory() {
    const symbols: SymbolName[] = ['XAUUSD', 'XAGUSD', 'USDJPY', 'GBPUSD'];
    const now = Date.now();

    for (const sym of symbols) {
      const base = this.basePrices[sym];
      const spec = INSTRUMENTS[sym];

      // H1 bars (60 bars, ~2.5 days)
      const h1Bars: CandleRecord[] = [];
      let hp = base * 0.97;
      for (let i = 0; i < 60; i++) {
        const delta = (Math.random() - 0.48) * (spec.pipSize * 20);
        hp += delta;
        const timeOpen = now - (60 - i) * 3600 * 1000;
        h1Bars.push({
          open: hp - delta,
          high: hp + Math.abs(delta) * 1.5,
          low: hp - Math.abs(delta) * 1.5,
          close: hp,
          volume: Math.floor(1000 + Math.random() * 2000),
          timeOpenMsc: timeOpen,
          timeCloseMsc: timeOpen + 3600 * 1000,
        });
      }
      this.gateway.seedHistoricalCandles(sym, 'H1', h1Bars);

      // M15 bars (60 bars, 15 hours)
      const m15Bars: CandleRecord[] = [];
      let mp = base * 0.99;
      for (let i = 0; i < 60; i++) {
        const delta = (Math.random() - 0.47) * (spec.pipSize * 8);
        mp += delta;
        const timeOpen = now - (60 - i) * 15 * 60 * 1000;
        m15Bars.push({
          open: mp - delta,
          high: mp + Math.abs(delta) * 1.2,
          low: mp - Math.abs(delta) * 1.2,
          close: mp,
          volume: Math.floor(300 + Math.random() * 800),
          timeOpenMsc: timeOpen,
          timeCloseMsc: timeOpen + 15 * 60 * 1000,
        });
      }
      this.gateway.seedHistoricalCandles(sym, 'M15', m15Bars);

      // M5 bars (50 bars, ~4 hours)
      const m5Bars: CandleRecord[] = [];
      let p5 = base;
      for (let i = 0; i < 50; i++) {
        const delta = (Math.random() - 0.48) * (spec.pipSize * 4);
        p5 += delta;
        const timeOpen = now - (50 - i) * 5 * 60 * 1000;
        m5Bars.push({
          open: p5 - delta,
          high: p5 + Math.abs(delta) * 1.1,
          low: p5 - Math.abs(delta) * 1.1,
          close: p5,
          volume: Math.floor(100 + Math.random() * 300),
          timeOpenMsc: timeOpen,
          timeCloseMsc: timeOpen + 5 * 60 * 1000,
        });
      }
      this.gateway.seedHistoricalCandles(sym, 'M5', m5Bars);

      // Initial tick
      this.emitTick(sym);
    }
  }

  public emitTick(symbol: SymbolName, priceOverride?: number) {
    const spec = INSTRUMENTS[symbol];
    if (priceOverride !== undefined) {
      this.currentPrices[symbol] = priceOverride;
    } else {
      // Natural Brownian random walk
      const step = (Math.random() - 0.5) * (spec.pipSize * 0.8);
      this.currentPrices[symbol] = Number((this.currentPrices[symbol] + step).toFixed(5));
    }

    const mid = this.currentPrices[symbol];
    const baseSpreadPips = spec.maxSpreadPips * 0.4 * this.spreadMultipliers[symbol];
    const spreadDelta = (baseSpreadPips * spec.pipSize) / 2;

    const bid = Number((mid - spreadDelta).toFixed(5));
    const ask = Number((mid + spreadDelta).toFixed(5));
    const spread_points = Math.round((ask - bid) / spec.tickSize);

    const tick: TickData = {
      type: 'TICK',
      symbol,
      bid,
      ask,
      spread_points,
      time_msc: Date.now(),
    };

    this.gateway.ingestTick(tick);
  }

  public startLiveSimulation(intervalMs: number = 1000) {
    if (this.intervalId) return;
    const symbols: SymbolName[] = ['XAUUSD', 'XAGUSD', 'USDJPY', 'GBPUSD'];

    this.intervalId = setInterval(() => {
      for (const sym of symbols) {
        this.emitTick(sym);
      }
    }, intervalMs);
  }

  public stopLiveSimulation() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public setSpreadMultiplier(symbol: SymbolName, multiplier: number) {
    this.spreadMultipliers[symbol] = multiplier;
    this.emitTick(symbol);
  }

  public triggerBullishSignalSetup(symbol: SymbolName = 'XAUUSD') {
    const base = this.currentPrices[symbol];
    const spec = INSTRUMENTS[symbol];
    const now = Date.now();

    // Fabricate aligned bars:
    // H1 bullish: 120 bars rising
    const h1Bars: CandleRecord[] = Array.from({ length: 120 }, (_, i) => {
      const p = base - (120 - i) * (spec.pipSize * 15);
      return {
        open: p - spec.pipSize * 5,
        high: p + spec.pipSize * 5,
        low: p - spec.pipSize * 5,
        close: p,
        volume: 2000,
        timeOpenMsc: now - (120 - i) * 3600000,
        timeCloseMsc: now - (119 - i) * 3600000,
      };
    });
    this.gateway.seedHistoricalCandles(symbol, 'H1', h1Bars);

    // M15 bullish with steady slope:
    const m15Bars: CandleRecord[] = [];
    let m15p = base - spec.pipSize * 30;
    for (let i = 0; i < 60; i++) {
      const delta = (i % 5 < 3) ? +spec.pipSize * 2 : -spec.pipSize * 1;
      m15p += delta;
      m15Bars.push({
        open: m15p - delta,
        high: m15p + spec.pipSize * 2,
        low: m15p - spec.pipSize * 2,
        close: m15p,
        volume: 800,
        timeOpenMsc: now - (60 - i) * 900000,
        timeCloseMsc: now - (59 - i) * 900000,
      });
    }
    this.gateway.seedHistoricalCandles(symbol, 'M15', m15Bars);

    // M5 bullish confirmation:
    const m5Bars: CandleRecord[] = [];
    let m5p = base - spec.pipSize * 10;
    for (let i = 0; i < 30; i++) {
      const delta = (i % 4 < 2) ? +spec.pipSize * 1.5 : -spec.pipSize * 0.8;
      m5p += delta;
      m5Bars.push({
        open: m5p - delta,
        high: m5p + spec.pipSize * 1,
        low: m5p - spec.pipSize * 1,
        close: m5p,
        volume: 300,
        timeOpenMsc: now - (30 - i) * 300000,
        timeCloseMsc: now - (29 - i) * 300000,
      });
    }
    this.gateway.seedHistoricalCandles(symbol, 'M5', m5Bars);

    // Emit closing bar to trigger consensus
    const lastBar = m15Bars[m15Bars.length - 1];
    this.gateway.ingestBarClose({
      type: 'BAR_CLOSE',
      symbol,
      timeframe: 'M15',
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      close: lastBar.close,
      volume: lastBar.volume,
      time_open_msc: lastBar.timeOpenMsc,
      time_close_msc: lastBar.timeCloseMsc,
    });
  }

  public replayTickSequence(ticks: { bid: number; ask: number; delayMs?: number }[], symbol: SymbolName = 'XAUUSD'): Promise<void> {
    return new Promise((resolve) => {
      let idx = 0;
      const sendNext = () => {
        if (idx >= ticks.length) {
          resolve();
          return;
        }
        const item = ticks[idx++];
        const spec = INSTRUMENTS[symbol];
        this.currentPrices[symbol] = (item.bid + item.ask) / 2;

        this.gateway.ingestTick({
          type: 'TICK',
          symbol,
          bid: item.bid,
          ask: item.ask,
          spread_points: Math.round((item.ask - item.bid) / spec.tickSize),
          time_msc: Date.now(),
        });

        if (item.delayMs && item.delayMs > 0) {
          setTimeout(sendNext, item.delayMs);
        } else {
          setImmediate(sendNext);
        }
      };
      sendNext();
    });
  }
}
