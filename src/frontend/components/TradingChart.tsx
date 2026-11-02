import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { SignalRecord } from '../../shared/types.js';

interface ChartProps {
  symbol: string;
  activeSignal?: SignalRecord;
  candles: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    timeCloseMsc: number;
  }>;
}

export const TradingChart: React.FC<ChartProps> = ({ symbol, activeSignal, candles }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#131b2e' },
        horzLines: { color: '#131b2e' },
      },
      crosshair: {
        vertLine: { color: '#38bdf8', width: 1, style: 3 },
        horzLine: { color: '#38bdf8', width: 1, style: 3 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#1e293b',
      },
      rightPriceScale: {
        borderColor: '#1e293b',
      },
    });

    const candlestickSeries = (chart as any).addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    // Convert candles to lightweight-charts format
    const formatted: CandlestickData<Time>[] = candles.map((c) => ({
      time: Math.floor(c.timeCloseMsc / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    // Dedupe by time and sort
    const uniqueMap = new Map<number, CandlestickData<Time>>();
    for (const item of formatted) {
      uniqueMap.set(Number(item.time), item);
    }
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => Number(a.time) - Number(b.time));

    seriesRef.current.setData(sorted);
  }, [candles]);

  return (
    <div className="relative w-full h-[360px] bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
        <span className="font-bold text-cyan-400">{symbol}</span>
        <span className="text-slate-400">M15 Interday Chart</span>
        {activeSignal && (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              activeSignal.direction === 'BUY'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {activeSignal.direction} ZONE: {activeSignal.entryZone.low.toFixed(2)} -{' '}
            {activeSignal.entryZone.high.toFixed(2)}
          </span>
        )}
      </div>

      {activeSignal && (
        <div className="absolute top-3 right-4 z-10 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono">
          <span className="text-rose-400">SL: {activeSignal.stopLoss.toFixed(2)}</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400">TP1: {activeSignal.targets.tp1.toFixed(2)}</span>
          <span className="text-emerald-400">TP2: {activeSignal.targets.tp2.toFixed(2)}</span>
          <span className="text-emerald-400">TP3: {activeSignal.targets.tp3.toFixed(2)}</span>
        </div>
      )}

      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};
