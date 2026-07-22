import { getPeriodStart, validatePeriod, validateUtcOffset } from './period.js'
import type { NormalizedTradingCalendar, NormalizedTradingSession } from './sessions.js'
import { getSessionPeriodStart, normalizeTradingCalendar, normalizeTradingSessions } from './sessions.js'
import type { AggregationResult, DataAggregatorOptions, KLineData, Period, TradeData } from './types.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

export class DataAggregator {
  private period: Period | undefined
  private readonly utcOffsetMinutes: number
  private readonly mergeMinuteKLinesAcrossTradingDays: boolean
  private readonly mergeHourKLinesAcrossTradingDays: boolean
  private readonly sessions: readonly NormalizedTradingSession[] | undefined
  private readonly tradingCalendar: NormalizedTradingCalendar
  private currentData: KLineData | undefined
  private lastTradeTimestamp: number | undefined

  constructor(options: DataAggregatorOptions = {}) {
    const utcOffsetMinutes = options.utcOffsetMinutes ?? 0
    validateUtcOffset(utcOffsetMinutes)
    validateBooleanOption(options.mergeMinuteKLinesAcrossTradingDays, 'mergeMinuteKLinesAcrossTradingDays')
    validateBooleanOption(options.mergeHourKLinesAcrossTradingDays, 'mergeHourKLinesAcrossTradingDays')

    this.utcOffsetMinutes = utcOffsetMinutes
    this.mergeMinuteKLinesAcrossTradingDays = options.mergeMinuteKLinesAcrossTradingDays ?? false
    this.mergeHourKLinesAcrossTradingDays = options.mergeHourKLinesAcrossTradingDays ?? false
    this.sessions = options.sessions === undefined ? undefined : normalizeTradingSessions(options.sessions)
    if (options.tradingCalendar !== undefined && this.sessions === undefined) {
      throw new RangeError('tradingCalendar requires sessions')
    }
    this.tradingCalendar = normalizeTradingCalendar(options.tradingCalendar)
  }

  /** Sets the aggregation period and clears any current aggregation state. */
  setPeriod(period: Period): void {
    validatePeriod(period)
    if (!this.period || this.period.type !== period.type || this.period.span !== period.span) {
      this.period = { ...period }
      this.reset()
    }
  }

  /** Seeds the current period with the last unclosed K-line. */
  setBaseData(data: KLineData): void {
    if (this.period === undefined) {
      throw new Error('period must be set before setting base data')
    }
    validateKLineData(data)
    this.currentData = { ...data }
    this.lastTradeTimestamp = undefined
  }

  add(trade: TradeData): AggregationResult {
    validateTrade(trade)

    if (this.lastTradeTimestamp !== undefined && trade.timestamp < this.lastTradeTimestamp) {
      throw new RangeError('trades must be added in timestamp order')
    }

    const periodStart = this.getTradePeriodStart(trade.timestamp)
    if (this.currentData !== undefined && periodStart < this.currentData.timestamp) {
      throw new RangeError('trades must be added in timestamp order')
    }
    const turnover = trade.turnover ?? trade.price * trade.volume
    let closed: KLineData | undefined

    if (this.currentData === undefined || this.currentData.timestamp !== periodStart) {
      if (this.currentData !== undefined) {
        closed = { ...this.currentData }
      }
      this.currentData = {
        timestamp: periodStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
        turnover
      }
    } else {
      this.currentData.high = Math.max(this.currentData.high, trade.price)
      this.currentData.low = Math.min(this.currentData.low, trade.price)
      this.currentData.close = trade.price
      this.currentData.volume += trade.volume
      this.currentData.turnover += turnover
    }

    this.lastTradeTimestamp = trade.timestamp
    const current = { ...this.currentData }
    return closed === undefined ? { current } : { current, closed }
  }

  reset(): void {
    this.currentData = undefined
    this.lastTradeTimestamp = undefined
  }

  private getTradePeriodStart(timestamp: number): number {
    if (this.period === undefined) {
      throw new Error('period must be set before adding trades')
    }
    const mergeAcrossTradingDays = (this.period.type === 'minute' && this.mergeMinuteKLinesAcrossTradingDays) || (this.period.type === 'hour' && this.mergeHourKLinesAcrossTradingDays)
    if (this.sessions === undefined) {
      if (!mergeAcrossTradingDays && (this.period.type === 'minute' || this.period.type === 'hour')) {
        return getIntradayPeriodStartWithinDay(timestamp, this.period, this.utcOffsetMinutes)
      }
      return getPeriodStart(timestamp, this.period, this.utcOffsetMinutes)
    }

    const periodStart = getSessionPeriodStart(timestamp, this.period, this.utcOffsetMinutes, this.sessions, this.tradingCalendar, mergeAcrossTradingDays)
    if (periodStart === undefined) {
      throw new RangeError('trade timestamp is outside the configured trading sessions')
    }
    return periodStart
  }
}

function getIntradayPeriodStartWithinDay(timestamp: number, period: Period, utcOffsetMinutes: number): number {
  const offset = utcOffsetMinutes * MINUTE
  const shiftedTimestamp = timestamp + offset
  const dayStart = Math.floor(shiftedTimestamp / DAY) * DAY
  const duration = period.span * (period.type === 'hour' ? 60 * MINUTE : MINUTE)
  return dayStart + Math.floor((shiftedTimestamp - dayStart) / duration) * duration - offset
}

function validateBooleanOption(value: boolean | undefined, name: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`)
  }
}

function validateKLineData(data: KLineData): void {
  if (!Number.isFinite(data.timestamp)) {
    throw new RangeError('data.timestamp must be a finite number')
  }
  if (!Number.isFinite(data.open) || data.open <= 0 || !Number.isFinite(data.high) || data.high <= 0 || !Number.isFinite(data.low) || data.low <= 0 || !Number.isFinite(data.close) || data.close <= 0) {
    throw new RangeError('data prices must be positive finite numbers')
  }
  if (data.high < Math.max(data.open, data.low, data.close) || data.low > Math.min(data.open, data.high, data.close)) {
    throw new RangeError('data.high and data.low must contain open and close')
  }
  if (!Number.isFinite(data.volume) || data.volume < 0) {
    throw new RangeError('data.volume must be a non-negative finite number')
  }
  if (!Number.isFinite(data.turnover) || data.turnover < 0) {
    throw new RangeError('data.turnover must be a non-negative finite number')
  }
}

function validateTrade(trade: TradeData): void {
  if (!Number.isFinite(trade.timestamp)) {
    throw new RangeError('trade.timestamp must be a finite number')
  }
  if (!Number.isFinite(trade.price) || trade.price <= 0) {
    throw new RangeError('trade.price must be a positive finite number')
  }
  if (!Number.isFinite(trade.volume) || trade.volume < 0) {
    throw new RangeError('trade.volume must be a non-negative finite number')
  }
  if (trade.turnover !== undefined && (!Number.isFinite(trade.turnover) || trade.turnover < 0)) {
    throw new RangeError('trade.turnover must be a non-negative finite number when provided')
  }
}
