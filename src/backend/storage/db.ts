import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {
  SymbolName,
  SignalRecord,
  SignalEventRecord,
  EconomicNewsEvent,
  InstrumentSpec,
} from '../../shared/types.js';
import { INSTRUMENTS } from '../../shared/constants.js';

export class TradingDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
    this.seedInstruments();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instruments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE NOT NULL,
        broker_symbol TEXT NOT NULL,
        base_currency TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        contract_size REAL NOT NULL,
        tick_size REAL NOT NULL,
        tick_value REAL NOT NULL,
        max_spread_pips REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        confidence_score INTEGER NOT NULL,
        confidence_label TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        entry_low REAL NOT NULL,
        entry_high REAL NOT NULL,
        suggested_entry REAL NOT NULL,
        stop_loss REAL NOT NULL,
        tp1 REAL NOT NULL,
        tp2 REAL NOT NULL,
        tp3 REAL NOT NULL,
        risk_reward_ratio REAL NOT NULL,
        spread_pips REAL NOT NULL,
        strategy_version TEXT NOT NULL DEFAULT 'v1.0.0-rules',
        indicator_snapshot_json TEXT NOT NULL,
        reasoning_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_updated INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        trigger_price REAL NOT NULL,
        trigger_bid REAL NOT NULL,
        trigger_ask REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (signal_id) REFERENCES signals(id)
      );

      CREATE TABLE IF NOT EXISTS economic_news (
        id TEXT PRIMARY KEY,
        currency TEXT NOT NULL,
        event_name TEXT NOT NULL,
        impact_level TEXT NOT NULL,
        scheduled_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'TELEGRAM',
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_signals_state ON signals(symbol, lifecycle_state);
      CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_signal ON signal_events(signal_id);
    `);
  }

  private seedInstruments() {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO instruments 
      (symbol, broker_symbol, base_currency, quote_currency, contract_size, tick_size, tick_value, max_spread_pips, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const spec of Object.values(INSTRUMENTS)) {
      stmt.run(
        spec.symbol,
        spec.brokerSymbol,
        spec.baseCurrency,
        spec.quoteCurrency,
        spec.contractSize,
        spec.tickSize,
        spec.tickValue,
        spec.maxSpreadPips,
        now
      );
    }
  }

  public saveSignal(signal: SignalRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO signals 
      (id, symbol, direction, confidence_score, confidence_label, lifecycle_state, entry_low, entry_high, suggested_entry, stop_loss, tp1, tp2, tp3, risk_reward_ratio, spread_pips, indicator_snapshot_json, reasoning_json, created_at, expires_at, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      signal.id,
      signal.symbol,
      signal.direction,
      signal.confidence,
      signal.confidenceLabel,
      signal.lifecycleState,
      signal.entryZone.low,
      signal.entryZone.high,
      signal.entryZone.suggested,
      signal.stopLoss,
      signal.targets.tp1,
      signal.targets.tp2,
      signal.targets.tp3,
      signal.riskRewardRatio,
      signal.spreadPips,
      JSON.stringify(signal.indicatorSnapshot),
      JSON.stringify(signal.reasoning),
      signal.createdAt,
      signal.expiresAt,
      signal.lastUpdated
    );
  }

  public updateSignalState(id: string, newState: string, lastUpdated: number = Date.now()) {
    const stmt = this.db.prepare(`
      UPDATE signals SET lifecycle_state = ?, last_updated = ? WHERE id = ?
    `);
    stmt.run(newState, lastUpdated, id);
  }

  public recordSignalEvent(event: SignalEventRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO signal_events 
      (signal_id, from_state, to_state, trigger_price, trigger_bid, trigger_ask, timestamp, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.signalId,
      event.fromState,
      event.toState,
      event.triggerPrice,
      event.triggerBid,
      event.triggerAsk,
      event.timestamp,
      event.metadata ? JSON.stringify(event.metadata) : null
    );
  }

  public getActiveSignals(): SignalRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM signals 
      WHERE lifecycle_state NOT IN ('ALL_TP_DONE', 'SL_HIT', 'CLOSED_MANUAL', 'INVALIDATED', 'EXPIRED', 'INVALIDATED_AMBIGUOUS_VOLATILITY')
      ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRowToSignal);
  }

  public getSignalHistory(limit: number = 50): SignalRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM signals ORDER BY created_at DESC LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(this.mapRowToSignal);
  }

  public getSignalEvents(signalId: string): SignalEventRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM signal_events WHERE signal_id = ? ORDER BY timestamp ASC
    `);
    const rows = stmt.all(signalId) as any[];
    return rows.map((r) => ({
      id: r.id,
      signalId: r.signal_id,
      fromState: r.from_state,
      toState: r.to_state,
      triggerPrice: r.trigger_price,
      triggerBid: r.trigger_bid,
      triggerAsk: r.trigger_ask,
      timestamp: r.timestamp,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
    }));
  }

  public logNotification(signalId: string, eventType: string, message: string, status: string = 'SENT') {
    const stmt = this.db.prepare(`
      INSERT INTO notification_logs (signal_id, event_type, message, status, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(signalId, eventType, message, status, Date.now());
  }

  public getEconomicNews(): EconomicNewsEvent[] {
    const stmt = this.db.prepare(`SELECT * FROM economic_news ORDER BY scheduled_at ASC`);
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      currency: r.currency,
      eventName: r.event_name,
      impactLevel: r.impact_level,
      scheduledAt: r.scheduled_at,
    }));
  }

  public insertEconomicNews(news: EconomicNewsEvent) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO economic_news (id, currency, event_name, impact_level, scheduled_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(news.id, news.currency, news.eventName, news.impactLevel, news.scheduledAt);
  }

  private mapRowToSignal(r: any): SignalRecord {
    return {
      id: r.id,
      symbol: r.symbol as SymbolName,
      direction: r.direction,
      confidence: r.confidence_score,
      confidenceLabel: r.confidence_label,
      lifecycleState: r.lifecycle_state,
      entryZone: {
        low: r.entry_low,
        high: r.entry_high,
        suggested: r.suggested_entry,
      },
      stopLoss: r.stop_loss,
      targets: {
        tp1: r.tp1,
        tp2: r.tp2,
        tp3: r.tp3,
      },
      riskRewardRatio: r.risk_reward_ratio,
      spreadPips: r.spread_pips,
      reasoning: JSON.parse(r.reasoning_json),
      indicatorSnapshot: JSON.parse(r.indicator_snapshot_json),
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      lastUpdated: r.last_updated,
    };
  }

  public close() {
    this.db.close();
  }
}
