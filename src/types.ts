export type PeriodType = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export interface Period {
  type: PeriodType
  span: number
}

export interface TradeData {
  /** Unix timestamp in milliseconds. */
  timestamp: number
  price: number
  volume: number
  /** Defaults to price multiplied by volume when omitted. */
  turnover?: number
}

export interface KLineData {
  /** Start of the period as a Unix timestamp in milliseconds. */
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  turnover: number
}

export interface AggregationResult {
  /** The current, possibly still forming K-line. */
  current: KLineData
  /** The preceding K-line when this trade starts a new period. */
  closed?: KLineData
}

export interface DataAggregatorOptions {
  /** Fixed offset from UTC in minutes. Defaults to UTC. */
  utcOffsetMinutes?: number
}
