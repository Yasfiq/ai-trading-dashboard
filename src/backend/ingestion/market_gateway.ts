import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import {
  SymbolName,
  TickData,
  BarCloseData,
  MarketSummaryItem,
  SignalRecord,
  SignalEventRecord,
  EconomicNewsEvent,
} from '../../shared/types.js';
import { INSTRUMENTS, SIGNAL_EXPIRY_MS } from '../../shared/constants.js';
import { TradingDatabase } from '../storage/db.js';
import { evaluateConsensus } from '../engine/consensus_engine.js';
import { evaluateSignalLifecycle } from '../engine/lifecycle_state_machine.js';
import { checkSpreadSafety, isFeedHealthy } from '../engine/safety_filter.js';
import { BarInput } from '../engine/indicators.js';

export interface CandleRecord extends BarInput {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOpenMsc: number;
  timeCloseMsc: number;
}

export class MarketGateway extends EventEmitter {
  private db: TradingDatabase;
  private currentTicks: Map<SymbolName, TickData> = new Map();
  private h1Bars: Map<SymbolName, CandleRecord[]> = new Map();
  private m15Bars: Map<SymbolName, CandleRecord[]> = new Map();
  private m5Bars: Map<SymbolName, CandleRecord[]> = new Map();
  private activeSignals: Map<string, SignalRecord> = new Map();
  private economicNews: EconomicNewsEvent[] = [];

  constructor(db: TradingDatabase) {
    super();
    this.db = db;
    this.initBuffers();
    this.loadActiveSignalsFromDb();
  }

  private initBuffers() {
    const symbols: SymbolName[] = ['XAUUSD', 'XAGUSD', 'USDJPY', 'GBPUSD'];
    for (const sym of symbols) {
      this.h1Bars.set(sym, []);
      this.m15Bars.set(sym, []);
      this.m5Bars.set(sym, []);
    }
  }

  private loadActiveSignalsFromDb() {
    const signals = this.db.getActiveSignals();
    for (const sig of signals) {
      this.activeSignals.set(sig.id, sig);
    }
  }

  public setEconomicNews(news: EconomicNewsEvent[]) {
    this.economicNews = news;
    for (const item of news) {
      this.db.insertEconomicNews(item);
    }
    this.emit('news_updated', this.economicNews);
  }

  public getEconomicNews(): EconomicNewsEvent[] {
    return this.economicNews;
  }

  public ingestTick(tick: TickData) {
    this.currentTicks.set(tick.symbol, tick);

    // 1. Evaluate active signals for this symbol
    for (const [id, signal] of this.activeSignals.entries()) {
      if (signal.symbol === tick.symbol) {
        const evalResult = evaluateSignalLifecycle(signal, {
          bid: tick.bid,
          ask: tick.ask,
          time_msc: tick.time_msc,
        });

        if (evalResult.transitionOccurred) {
          const oldState = signal.lifecycleState;
          signal.lifecycleState = evalResult.newState;
          signal.lastUpdated = tick.time_msc;

          // Record in DB
          this.db.updateSignalState(id, evalResult.newState, tick.time_msc);

          const eventRecord: SignalEventRecord = {
            signalId: id,
            fromState: oldState,
            toState: evalResult.newState,
            triggerPrice: evalResult.triggerPrice,
            triggerBid: tick.bid,
            triggerAsk: tick.ask,
            timestamp: tick.time_msc,
            metadata: { reason: evalResult.reason },
          };
          this.db.recordSignalEvent(eventRecord);

          // Telegram alert format dispatch
          const message = this.formatTelegramMessage(signal, evalResult.newState, evalResult.reason);
          this.db.logNotification(id, evalResult.newState, message);

          // Check if terminal state reached
          const terminalStates = [
            'ALL_TP_DONE',
            'SL_HIT',
            'CLOSED_MANUAL',
            'INVALIDATED',
            'EXPIRED',
            'INVALIDATED_AMBIGUOUS_VOLATILITY',
          ];
          if (terminalStates.includes(evalResult.newState)) {
            this.activeSignals.delete(id);
          }

          // Broadcast transition
          this.emit('signal_transition', {
            signal,
            event: eventRecord,
            message,
          });
        }
      }
    }

    // Broadcast tick
    this.emit('tick', tick);
  }

  public ingestBarClose(bar: BarCloseData) {
    const bufferMap = bar.timeframe === 'H1' ? this.h1Bars : bar.timeframe === 'M15' ? this.m15Bars : this.m5Bars;
    const buffer = bufferMap.get(bar.symbol) || [];

    const record: CandleRecord = {
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      timeOpenMsc: bar.time_open_msc,
      timeCloseMsc: bar.time_close_msc,
    };

    buffer.push(record);
    if (buffer.length > 200) buffer.shift();
    bufferMap.set(bar.symbol, buffer);

    this.emit('bar_close', bar);

    // Evaluate signals on M15 or M5 bar close if H1 and M15 buffers have sufficient data
    const h1 = this.h1Bars.get(bar.symbol) || [];
    const m15 = this.m15Bars.get(bar.symbol) || [];
    const m5 = this.m5Bars.get(bar.symbol) || [];

    if (h1.length >= 20 && m15.length >= 20 && m5.length >= 10) {
      const latestTick = this.currentTicks.get(bar.symbol);
      const spec = INSTRUMENTS[bar.symbol];
      const spreadPips = latestTick
        ? (latestTick.ask - latestTick.bid) / spec.pipSize
        : spec.maxSpreadPips * 0.5;

      const consensus = evaluateConsensus({
        symbol: bar.symbol,
        currentSpreadPips: spreadPips,
        h1Bars: h1,
        m15Bars: m15,
        m5Bars: m5,
        newsEvents: this.economicNews,
        timestamp: bar.time_close_msc,
      });

      if (consensus.direction !== 'WAIT' && consensus.tradeLevels && consensus.confidence >= 65) {
        // Only 1 active signal per symbol at a time in ENTRY_ZONE_ACTIVE / ENTRY_CONFIRMED
        const existing = Array.from(this.activeSignals.values()).find(
          (s) => s.symbol === bar.symbol && (s.lifecycleState === 'ENTRY_ZONE_ACTIVE' || s.lifecycleState === 'ENTRY_CONFIRMED')
        );

        if (!existing) {
          const signalId = `sig_${bar.symbol.toLowerCase()}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          const newSignal: SignalRecord = {
            id: signalId,
            symbol: bar.symbol,
            direction: consensus.direction,
            confidence: consensus.confidence,
            confidenceLabel: consensus.confidenceLabel,
            lifecycleState: 'ENTRY_ZONE_ACTIVE',
            entryZone: consensus.tradeLevels.entryZone,
            stopLoss: consensus.tradeLevels.stopLoss,
            targets: consensus.tradeLevels.targets,
            riskRewardRatio: consensus.tradeLevels.riskRewardRatio,
            reasoning: consensus.reasoning,
            indicatorSnapshot: consensus.indicatorSnapshot,
            spreadPips,
            createdAt: bar.time_close_msc,
            expiresAt: bar.time_close_msc + SIGNAL_EXPIRY_MS,
            lastUpdated: bar.time_close_msc,
          };

          this.db.saveSignal(newSignal);
          this.activeSignals.set(signalId, newSignal);

          const alertMsg = this.formatTelegramMessage(newSignal, 'NEW_SIGNAL');
          this.db.logNotification(signalId, 'NEW_SIGNAL', alertMsg);

          this.emit('new_signal', { signal: newSignal, message: alertMsg });
        }
      }
    }
  }

  public getSummary(): MarketSummaryItem[] {
    const symbols: SymbolName[] = ['XAUUSD', 'XAGUSD', 'USDJPY', 'GBPUSD'];
    const now = Date.now();

    return symbols.map((sym) => {
      const spec = INSTRUMENTS[sym];
      const tick = this.currentTicks.get(sym);
      const bid = tick?.bid ?? (sym === 'XAUUSD' ? 2746.30 : sym === 'XAGUSD' ? 32.50 : sym === 'USDJPY' ? 153.20 : 1.2980);
      const ask = tick?.ask ?? (bid + spec.pipSize * 1.5);
      const spreadPips = tick ? (tick.ask - tick.bid) / spec.pipSize : 1.5;
      const lastTickTime = tick?.time_msc ?? now;
      const feedHealthy = tick ? isFeedHealthy(lastTickTime, now) : true;
      const safety = checkSpreadSafety(sym, spreadPips);

      const activeCount = Array.from(this.activeSignals.values()).filter((s) => s.symbol === sym).length;

      return {
        symbol: sym,
        bid,
        ask,
        spreadPips: Number(spreadPips.toFixed(1)),
        maxSpreadPips: spec.maxSpreadPips,
        safetyStatus: safety.status,
        feedHealthy,
        lastTickTime,
        activeSignalCount: activeCount,
      };
    });
  }

  public getActiveSignals(): SignalRecord[] {
    return Array.from(this.activeSignals.values());
  }

  public getHistorySignals(limit: number = 50): SignalRecord[] {
    return this.db.getSignalHistory(limit);
  }

  public getCandles(symbol: SymbolName, timeframe: 'H1' | 'M15' | 'M5'): CandleRecord[] {
    const map = timeframe === 'H1' ? this.h1Bars : timeframe === 'M15' ? this.m15Bars : this.m5Bars;
    return map.get(symbol) || [];
  }

  public seedHistoricalCandles(symbol: SymbolName, timeframe: 'H1' | 'M15' | 'M5', bars: CandleRecord[]) {
    const map = timeframe === 'H1' ? this.h1Bars : timeframe === 'M15' ? this.m15Bars : this.m5Bars;
    map.set(symbol, bars);
  }

  private formatTelegramMessage(signal: SignalRecord, eventType: string, note?: string): string {
    const dirEmoji = signal.direction === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    return `🚨 [AI SIGNAL ALERT] - ${signal.symbol}
Status: ${signal.lifecycleState} (${eventType})
Arah: ${dirEmoji}
Confidence: ${signal.confidence}% (${signal.confidenceLabel})
Timeframe: M5/M15/H1 Consensus

📍 Entry Zone: ${signal.entryZone.low.toFixed(2)} - ${signal.entryZone.high.toFixed(2)} (Suggested: ${signal.entryZone.suggested.toFixed(2)})
🛑 Stop Loss: ${signal.stopLoss.toFixed(2)}
🎯 Target 1: ${signal.targets.tp1.toFixed(2)} [1:1]
🎯 Target 2: ${signal.targets.tp2.toFixed(2)} [1:2]
🎯 Target 3: ${signal.targets.tp3.toFixed(2)} [1:3]

⚖️ Risk Plan:
R:R Ratio: 1:${signal.riskRewardRatio} | Spread: ${signal.spreadPips.toFixed(1)} pips
${note ? `\nCatatan: ${note}` : ''}`;
  }
}
