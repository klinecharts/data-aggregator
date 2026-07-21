import { getPeriodStart, validatePeriod, validateUtcOffset } from './period.js'
import type { AggregationResult, DataAggregatorOptions, KLineData, Period, TradeData } from './types.js'

export class DataAggregator {
  readonly #period: Period
  readonly #utcOffsetMinutes: number
  #current: KLineData | undefined
  #lastTradeTimestamp: number | undefined

  constructor(period: Period, options: DataAggregatorOptions = {}) {
    validatePeriod(period)
    const utcOffsetMinutes = options.utcOffsetMinutes ?? 0
    validateUtcOffset(utcOffsetMinutes)

    this.#period = { ...period }
    this.#utcOffsetMinutes = utcOffsetMinutes
  }

  get period(): Period {
    return { ...this.#period }
  }

  get current(): KLineData | undefined {
    return this.#current === undefined ? undefined : { ...this.#current }
  }

  add(trade: TradeData): AggregationResult {
    validateTrade(trade)

    if (this.#lastTradeTimestamp !== undefined && trade.timestamp < this.#lastTradeTimestamp) {
      throw new RangeError('trades must be added in timestamp order')
    }

    const periodStart = getPeriodStart(trade.timestamp, this.#period, this.#utcOffsetMinutes)
    const turnover = trade.turnover ?? trade.price * trade.volume
    let closed: KLineData | undefined

    if (this.#current === undefined || this.#current.timestamp !== periodStart) {
      if (this.#current !== undefined) {
        closed = { ...this.#current }
      }
      this.#current = {
        timestamp: periodStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
        turnover
      }
    } else {
      this.#current.high = Math.max(this.#current.high, trade.price)
      this.#current.low = Math.min(this.#current.low, trade.price)
      this.#current.close = trade.price
      this.#current.volume += trade.volume
      this.#current.turnover += turnover
    }

    this.#lastTradeTimestamp = trade.timestamp
    const current = { ...this.#current }
    return closed === undefined ? { current } : { current, closed }
  }

  reset(): void {
    this.#current = undefined
    this.#lastTradeTimestamp = undefined
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
