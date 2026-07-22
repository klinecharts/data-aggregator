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

export interface TradingSession {
  /** Session start in HH:mm local time. */
  start: string
  /** Session end in HH:mm local time. Use an earlier time for an overnight session. */
  end: string
}

export interface TradingCalendar {
  /** Closed local dates in YYYY-MM-DD format. */
  holidays?: readonly string[]
  /** Local dates that trade despite falling on a configured weekend or holiday. */
  extraTradingDays?: readonly string[]
  /** Non-trading weekdays, where 0 is Sunday and 6 is Saturday. Defaults to [0, 6]. */
  weekendDays?: readonly number[]
}

export interface DataAggregatorOptions {
  /** Fixed offset from UTC in minutes. Defaults to UTC. */
  utcOffsetMinutes?: number
  /** Continue minute K-lines with trading time from later trading days. Defaults to false. */
  mergeMinuteKLinesAcrossTradingDays?: boolean
  /** Continue hour K-lines with trading time from later trading days. Defaults to false. */
  mergeHourKLinesAcrossTradingDays?: boolean
  /** Local trading sessions. Trades outside these intervals are rejected. */
  sessions?: readonly TradingSession[]
  /** Trading-day rules used with sessions. */
  tradingCalendar?: TradingCalendar
}
