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

import type { Period, PeriodType } from './types'

const MILLISECONDS: Record<Exclude<PeriodType, 'month' | 'year'>, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000
}

const MONDAY_AFTER_UNIX_EPOCH = 4 * MILLISECONDS.day

export function validatePeriod(period: Period): void {
  if (!Number.isInteger(period.span) || period.span <= 0) {
    throw new RangeError('period.span must be a positive integer')
  }
}

export function validateUtcOffset(utcOffsetMinutes: number): void {
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -24 * 60 || utcOffsetMinutes > 24 * 60) {
    throw new RangeError('utcOffsetMinutes must be an integer between -1440 and 1440')
  }
}

/** Returns the start timestamp of the period containing the input timestamp. */
export function getPeriodStart(timestamp: number, period: Period, utcOffsetMinutes = 0): number {
  if (!Number.isFinite(timestamp)) {
    throw new RangeError('timestamp must be a finite number')
  }

  validatePeriod(period)
  validateUtcOffset(utcOffsetMinutes)

  const offset = utcOffsetMinutes * MILLISECONDS.minute
  const shiftedTimestamp = timestamp + offset

  if (period.type === 'month') {
    return getMonthStart(shiftedTimestamp, period.span) - offset
  }

  if (period.type === 'year') {
    return getYearStart(shiftedTimestamp, period.span) - offset
  }

  const duration = MILLISECONDS[period.type] * period.span
  const anchor = period.type === 'week' ? MONDAY_AFTER_UNIX_EPOCH : 0
  return Math.floor((shiftedTimestamp - anchor) / duration) * duration + anchor - offset
}

function getMonthStart(timestamp: number, span: number): number {
  const date = new Date(timestamp)
  const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth()
  const firstMonthIndex = Math.floor(monthIndex / span) * span
  const year = Math.floor(firstMonthIndex / 12)
  const month = ((firstMonthIndex % 12) + 12) % 12
  return createUtcDate(year, month)
}

function getYearStart(timestamp: number, span: number): number {
  const year = new Date(timestamp).getUTCFullYear()
  return createUtcDate(Math.floor(year / span) * span, 0)
}

function createUtcDate(year: number, month: number): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 1)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}
