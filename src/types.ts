/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
  /** Continue second K-lines with trading time from later trading days. Defaults to false. */
  mergeSecondAcrossTradingDay?: boolean
  /** Continue minute K-lines with trading time from later trading days. Defaults to false. */
  mergeMinuteAcrossTradingDay?: boolean
  /** Continue hour K-lines with trading time from later trading days. Defaults to false. */
  mergeHourAcrossTradingDay?: boolean
  /** Local trading sessions. Trades outside these intervals are rejected. */
  sessions?: readonly TradingSession[]
  /** Trading-day rules used with sessions. */
  tradingCalendar?: TradingCalendar
}
