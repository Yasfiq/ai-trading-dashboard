import { InstrumentSpec, LotCalculationRequest, LotCalculationResult, EntryZone, TargetPrices } from '../../shared/types.js';

export function calculateLotSize(req: LotCalculationRequest, spec: InstrumentSpec): LotCalculationResult {
  const riskAmountUsd = req.balance * (req.riskPercentage / 100);
  const priceDistance = Math.abs(req.entryPrice - req.stopLossPrice);
  const slDistancePoints = Math.round(priceDistance / spec.tickSize);

  if (slDistancePoints <= 0) {
    return {
      riskAmountUsd,
      slDistancePoints: 0,
      calculatedLot: spec.volumeMin,
      tickValue: spec.tickValue,
      tickSize: spec.tickSize,
      potentialLossUsd: 0,
    };
  }

  // Cost per 1 standard lot = slDistancePoints * tickValue
  const riskPerOneLot = slDistancePoints * spec.tickValue;
  const rawLot = riskAmountUsd / riskPerOneLot;

  // Floor to volumeStep
  const step = spec.volumeStep;
  const steppedLot = Math.floor(rawLot / step) * step;

  // Clamp within broker limits
  const calculatedLot = Math.min(Math.max(Number(steppedLot.toFixed(2)), spec.volumeMin), spec.volumeMax);

  const potentialLossUsd = Number((calculatedLot * slDistancePoints * spec.tickValue).toFixed(2));

  return {
    riskAmountUsd: Number(riskAmountUsd.toFixed(2)),
    slDistancePoints,
    calculatedLot,
    tickValue: spec.tickValue,
    tickSize: spec.tickSize,
    potentialLossUsd,
  };
}

export function calculateTradeLevels(
  direction: 'BUY' | 'SELL',
  pClose: number,
  atr: number
): {
  entryZone: EntryZone;
  stopLoss: number;
  targets: TargetPrices;
  riskRewardRatio: number;
} {
  if (direction === 'BUY') {
    const low = pClose - 0.25 * atr;
    const high = pClose + 0.10 * atr;
    const suggested = pClose;
    const stopLoss = low - 1.20 * atr;
    const riskPoints = suggested - stopLoss;
    const tp1 = suggested + 1.0 * riskPoints;
    const tp2 = suggested + 2.0 * riskPoints;
    const tp3 = suggested + 3.0 * riskPoints;

    return {
      entryZone: { low, high, suggested },
      stopLoss,
      targets: { tp1, tp2, tp3 },
      riskRewardRatio: 2.0,
    };
  } else {
    const high = pClose + 0.25 * atr;
    const low = pClose - 0.10 * atr;
    const suggested = pClose;
    const stopLoss = high + 1.20 * atr;
    const riskPoints = stopLoss - suggested;
    const tp1 = suggested - 1.0 * riskPoints;
    const tp2 = suggested - 2.0 * riskPoints;
    const tp3 = suggested - 3.0 * riskPoints;

    return {
      entryZone: { low, high, suggested },
      stopLoss,
      targets: { tp1, tp2, tp3 },
      riskRewardRatio: 2.0,
    };
  }
}
