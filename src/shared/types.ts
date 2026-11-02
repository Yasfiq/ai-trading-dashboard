/**
 * AI Trading Signal Dashboard - Shared Types Contract
 * Strict non-repainting, deterministic risk-first trading terminal.
 */

export type SymbolName = 'XAUUSD' | 'XAGUSD' | 'USDJPY' | 'GBPUSD';

export type SignalDirection = 'BUY' | 'SELL' | 'WAIT';

export type LifecycleState =
  | 'ANALYZING'
  | 'WAITING_CONFIRMATION'
  | 'ENTRY_ZONE_ACTIVE'
  | 'ENTRY_CONFIRMED'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'TP3_HIT'
  | 'ALL_TP_DONE'
  | 'SL_HIT'
  | 'CLOSED_MANUAL'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'INVALIDATED_AMBIGUOUS_VOLATILITY';

export type SafetyStatus = 'SAFE' | 'WARNING' | 'BLOCKED';

export type ConfidenceLabel = 'HIGH CONFIDENCE' | 'MODERATE CONFIDENCE' | 'LOW / WAIT';

export interface InstrumentSpec {
  symbol: SymbolName;
  brokerSymbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  contractSize: number;
  tickSize: number;
  tickValue: number;
  pipSize: number;
  maxSpreadPips: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
}

export interface TickData {
  type: 'TICK';
  symbol: SymbolName;
  bid: number;
  ask: number;
  spread_points: number;
  time_msc: number;
}

export interface BarCloseData {
  type: 'BAR_CLOSE';
  symbol: SymbolName;
  timeframe: 'H1' | 'M15' | 'M5';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time_open_msc: number;
  time_close_msc: number;
}

export interface IndicatorSnapshot {
  h1: {
    ema50: number;
    ema200: number;
    adx14: number;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  m15: {
    ema20: number;
    rsi14: number;
    atr14: number;
    atrAvg50: number;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  m5: {
    rsi14: number;
    triggerConfirmed: boolean;
  };
}

export interface EntryZone {
  low: number;
  high: number;
  suggested: number;
}

export interface TargetPrices {
  tp1: number;
  tp2: number;
  tp3: number;
}

export interface SignalRecord {
  id: string;
  symbol: SymbolName;
  direction: SignalDirection;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  lifecycleState: LifecycleState;
  entryZone: EntryZone;
  stopLoss: number;
  targets: TargetPrices;
  riskRewardRatio: number; // e.g. 2.0
  reasoning: string[];
  indicatorSnapshot: IndicatorSnapshot;
  spreadPips: number;
  createdAt: number;
  expiresAt: number;
  lastUpdated: number;
  highestStateReached?: LifecycleState;
}

export interface SignalEventRecord {
  id?: number;
  signalId: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  triggerPrice: number;
  triggerBid: number;
  triggerAsk: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface EconomicNewsEvent {
  id: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY';
  eventName: string;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  scheduledAt: number; // epoch ms
}

export interface MarketSummaryItem {
  symbol: SymbolName;
  bid: number;
  ask: number;
  spreadPips: number;
  maxSpreadPips: number;
  safetyStatus: SafetyStatus;
  feedHealthy: boolean;
  lastTickTime: number;
  activeSignalCount: number;
}

export interface LotCalculationRequest {
  symbol: SymbolName;
  balance: number;
  riskPercentage: number;
  entryPrice: number;
  stopLossPrice: number;
}

export interface LotCalculationResult {
  riskAmountUsd: number;
  slDistancePoints: number;
  calculatedLot: number;
  tickValue: number;
  tickSize: number;
  potentialLossUsd: number;
}
