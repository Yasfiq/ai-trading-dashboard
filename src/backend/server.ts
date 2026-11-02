import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TradingDatabase } from './storage/db.js';
import { MarketGateway } from './ingestion/market_gateway.js';
import { MarketSimulator } from './simulator/tick_feeder.js';
import { calculateLotSize } from './engine/risk_calculator.js';
import { INSTRUMENTS } from '../shared/constants.js';
import { SymbolName, LotCalculationRequest, EconomicNewsEvent } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createServer(opts: { dbPath?: string; enableLiveSim?: boolean } = {}) {
  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });
  await fastify.register(fastifyWebsocket);

  const db = new TradingDatabase(opts.dbPath || path.join(process.cwd(), 'data', 'trading.db'));
  const gateway = new MarketGateway(db);
  const simulator = new MarketSimulator(gateway);

  // Seed sample economic news
  const now = Date.now();
  const sampleNews: EconomicNewsEvent[] = [
    {
      id: 'news_nfp_upcoming',
      currency: 'USD',
      eventName: 'US Non-Farm Payrolls (NFP)',
      impactLevel: 'HIGH',
      scheduledAt: now + 3 * 3600 * 1000, // in 3 hours
    },
    {
      id: 'news_cpi_tomorrow',
      currency: 'USD',
      eventName: 'US Core CPI m/m',
      impactLevel: 'HIGH',
      scheduledAt: now + 24 * 3600 * 1000,
    },
    {
      id: 'news_boe_rate',
      currency: 'GBP',
      eventName: 'BOE Official Bank Rate',
      impactLevel: 'HIGH',
      scheduledAt: now + 48 * 3600 * 1000,
    },
  ];
  gateway.setEconomicNews(sampleNews);

  // WebSocket connections pool
  const wsClients = new Set<any>();

  fastify.register(async function (fastifyInstance) {
    fastifyInstance.get('/ws', { websocket: true }, (socket, req) => {
      wsClients.add(socket);

      // Send initial snapshot on connect
      socket.send(
        JSON.stringify({
          type: 'CONNECTED',
          data: {
            summary: gateway.getSummary(),
            activeSignals: gateway.getActiveSignals(),
            news: gateway.getEconomicNews(),
          },
        })
      );

      socket.on('message', (message: any) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'PING') {
            socket.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          }
        } catch {
          // ignore invalid json
        }
      });

      socket.on('close', () => {
        wsClients.delete(socket);
      });
    });
  });

  const broadcastWs = (payload: any) => {
    const raw = JSON.stringify(payload);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(raw);
      }
    }
  };

  // Wire Gateway events to WebSocket broadcast
  gateway.on('tick', (tick) => {
    broadcastWs({ type: 'TICK', data: tick });
  });

  gateway.on('new_signal', (payload) => {
    broadcastWs({ type: 'NEW_SIGNAL', data: payload });
  });

  gateway.on('signal_transition', (payload) => {
    broadcastWs({ type: 'SIGNAL_TRANSITION', data: payload });
  });

  gateway.on('news_updated', (news) => {
    broadcastWs({ type: 'NEWS_UPDATED', data: news });
  });

  // REST API Routes
  // 1. GET /api/v1/market/summary
  fastify.get('/api/v1/market/summary', async () => {
    return {
      status: 'success',
      timestamp: Date.now(),
      data: gateway.getSummary(),
    };
  });

  // 2. GET /api/v1/signals/active
  fastify.get('/api/v1/signals/active', async () => {
    return {
      status: 'success',
      timestamp: Date.now(),
      data: gateway.getActiveSignals(),
    };
  });

  // 3. GET /api/v1/signals/history
  fastify.get('/api/v1/signals/history', async (request) => {
    const limit = Number((request.query as any)?.limit || 50);
    return {
      status: 'success',
      timestamp: Date.now(),
      data: gateway.getHistorySignals(limit),
    };
  });

  // 4. GET /api/v1/signals/:id/events
  fastify.get('/api/v1/signals/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const events = db.getSignalEvents(id);
    return {
      status: 'success',
      data: events,
    };
  });

  // 5. POST /api/v1/calculator/lot
  fastify.post('/api/v1/calculator/lot', async (request, reply) => {
    const body = request.body as LotCalculationRequest;
    if (!body || !body.symbol || !body.balance || !body.riskPercentage || !body.entryPrice || !body.stopLossPrice) {
      reply.status(400);
      return { status: 'error', message: 'Missing required parameters' };
    }

    const spec = INSTRUMENTS[body.symbol];
    if (!spec) {
      reply.status(400);
      return { status: 'error', message: `Unknown symbol: ${body.symbol}` };
    }

    const result = calculateLotSize(body, spec);
    return {
      status: 'success',
      data: result,
    };
  });

  // 6. GET /api/v1/news
  fastify.get('/api/v1/news', async () => {
    return {
      status: 'success',
      data: gateway.getEconomicNews(),
    };
  });

  // 7. GET /api/v1/candles/:symbol
  fastify.get('/api/v1/candles/:symbol', async (request) => {
    const { symbol } = request.params as { symbol: SymbolName };
    const timeframe = ((request.query as any)?.timeframe || 'M15') as 'H1' | 'M15' | 'M5';
    const candles = gateway.getCandles(symbol, timeframe);
    return {
      status: 'success',
      symbol,
      timeframe,
      data: candles,
    };
  });

  // Simulation Controls & Testing Endpoints
  fastify.post('/api/v1/simulation/trigger-signal', async (request) => {
    const symbol = ((request.body as any)?.symbol || 'XAUUSD') as SymbolName;
    simulator.triggerBullishSignalSetup(symbol);
    return { status: 'success', message: `Triggered bullish signal setup for ${symbol}` };
  });

  fastify.post('/api/v1/simulation/tick', async (request) => {
    const body = request.body as { symbol: SymbolName; bid: number; ask: number };
    const spec = INSTRUMENTS[body.symbol];
    gateway.ingestTick({
      type: 'TICK',
      symbol: body.symbol,
      bid: body.bid,
      ask: body.ask,
      spread_points: Math.round((body.ask - body.bid) / spec.tickSize),
      time_msc: Date.now(),
    });
    return { status: 'success' };
  });

  fastify.post('/api/v1/simulation/spread-multiplier', async (request) => {
    const { symbol, multiplier } = request.body as { symbol: SymbolName; multiplier: number };
    simulator.setSpreadMultiplier(symbol, multiplier);
    return { status: 'success', symbol, multiplier };
  });

  fastify.post('/api/v1/simulation/news-blackout', async (request) => {
    const { active, minutesFromNow = 10 } = request.body as { active: boolean; minutesFromNow?: number };
    if (active) {
      gateway.setEconomicNews([
        {
          id: 'test_blackout_event',
          currency: 'USD',
          eventName: 'EMERGENCY FOMC STATEMENT',
          impactLevel: 'HIGH',
          scheduledAt: Date.now() + minutesFromNow * 60 * 1000,
        },
      ]);
    } else {
      gateway.setEconomicNews([]);
    }
    return { status: 'success', blackoutActive: active };
  });

  // Static files for built frontend UI
  const distPath = path.join(__dirname, '../../dist');
  if (fs.existsSync(distPath)) {
    await fastify.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
    });
    fastify.setNotFoundHandler((req, reply) => {
      reply.sendFile('index.html');
    });
  }

  if (opts.enableLiveSim !== false) {
    simulator.startLiveSimulation(1000);
  }

  return {
    fastify,
    db,
    gateway,
    simulator,
  };
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const port = Number(process.env.PORT) || 3000;
  createServer()
    .then(({ fastify }) => {
      fastify.listen({ port, host: '0.0.0.0' }, (err, address) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }
        console.log(`AI Trading Signal Terminal Server listening on ${address}`);
      });
    })
    .catch(console.error);
}
