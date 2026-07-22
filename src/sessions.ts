import { getPeriodStart } from './period.js'
import type { Period, TradingCalendar, TradingSession } from './types.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const INTRADAY_PERIOD_DURATION: Partial<Record<Period['type'], number>> = {
  second: 1_000,
  minute: MINUTE,
  hour: 60 * MINUTE
}

export interface NormalizedTradingSession {
  startMinutes: number
  endMinutes: number
}

export interface NormalizedTradingCalendar {
  holidays: ReadonlySet<number>
  extraTradingDays: ReadonlySet<number>
  weekendDays: ReadonlySet<number>
}

interface TradingSessionOccurrence {
  start: number
  tradingDayTimestamp: number
  sessionIndex: number
}

interface TradingTimePosition {
  coordinate: number
  elapsedInTradingDay: number
  tradingDayLocalStart: number
  tradingDayOrdinal: number
}

export function normalizeTradingCalendar(calendar: TradingCalendar = {}): NormalizedTradingCalendar {
  const weekendDays = calendar.weekendDays ?? [0, 6]
  for (const weekday of weekendDays) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new RangeError('tradingCalendar.weekendDays must contain integers from 0 to 6')
    }
  }

  return {
    holidays: new Set((calendar.holidays ?? []).map((date) => parseLocalDate(date, 'holidays'))),
    extraTradingDays: new Set((calendar.extraTradingDays ?? []).map((date) => parseLocalDate(date, 'extraTradingDays'))),
    weekendDays: new Set(weekendDays)
  }
}

export function normalizeTradingSessions(sessions: readonly TradingSession[]): readonly NormalizedTradingSession[] {
  if (sessions.length === 0) {
    throw new RangeError('sessions must contain at least one trading session')
  }

  const normalized = sessions.map((session) => ({
    startMinutes: parseTime(session.start, 'start'),
    endMinutes: parseTime(session.end, 'end')
  }))

  for (const session of normalized) {
    if (session.startMinutes === session.endMinutes) {
      throw new RangeError('a trading session start and end must be different')
    }
  }

  validateSessionsDoNotOverlap(normalized)
  return normalized
}

export function getSessionPeriodStart(timestamp: number, period: Period, utcOffsetMinutes: number, sessions: readonly NormalizedTradingSession[], calendar: NormalizedTradingCalendar, mergeAcrossTradingDays = false): number | undefined {
  const occurrence = findSessionOccurrence(timestamp, utcOffsetMinutes, sessions, calendar)
  if (occurrence === undefined) {
    return undefined
  }

  const baseDuration = INTRADAY_PERIOD_DURATION[period.type]
  if (baseDuration === undefined) {
    return getPeriodStart(occurrence.tradingDayTimestamp, period, utcOffsetMinutes)
  }

  const duration = baseDuration * period.span
  if (period.type === 'second') {
    return occurrence.start + Math.floor((timestamp - occurrence.start) / duration) * duration
  }

  const position = getTradingTimePosition(timestamp, occurrence, utcOffsetMinutes, sessions, calendar)
  const coordinate = mergeAcrossTradingDays ? position.coordinate : position.elapsedInTradingDay
  const periodCoordinate = Math.floor(coordinate / duration) * duration
  const absolutePeriodCoordinate = mergeAcrossTradingDays ? periodCoordinate : position.tradingDayOrdinal * getTradingDayDuration(sessions) + periodCoordinate
  return tradingTimeCoordinateToTimestamp(absolutePeriodCoordinate, position, utcOffsetMinutes, sessions, calendar)
}

function findSessionOccurrence(timestamp: number, utcOffsetMinutes: number, sessions: readonly NormalizedTradingSession[], calendar: NormalizedTradingCalendar): TradingSessionOccurrence | undefined {
  const offset = utcOffsetMinutes * MINUTE
  const localTimestamp = timestamp + offset
  const localDayStart = Math.floor(localTimestamp / DAY) * DAY

  for (const [sessionIndex, session] of sessions.entries()) {
    const overnight = session.endMinutes < session.startMinutes
    let localSessionStart = localDayStart + session.startMinutes * MINUTE

    if (overnight && localTimestamp < localDayStart + session.endMinutes * MINUTE) {
      localSessionStart -= DAY
    }

    const durationMinutes = overnight ? 24 * 60 - session.startMinutes + session.endMinutes : session.endMinutes - session.startMinutes
    if (localTimestamp >= localSessionStart && localTimestamp < localSessionStart + durationMinutes * MINUTE) {
      const sessionDate = Math.floor(localSessionStart / DAY) * DAY
      if (!isTradingDay(sessionDate, calendar)) {
        return undefined
      }

      return {
        start: localSessionStart - offset,
        tradingDayTimestamp: (overnight ? getNextTradingDay(sessionDate, calendar) : sessionDate) - offset,
        sessionIndex
      }
    }
  }

  return undefined
}

function getTradingTimePosition(timestamp: number, occurrence: TradingSessionOccurrence, utcOffsetMinutes: number, sessions: readonly NormalizedTradingSession[], calendar: NormalizedTradingCalendar): TradingTimePosition {
  let elapsedInTradingDay = timestamp - occurrence.start
  for (const sessionIndex of getTradingDaySessionIndexes(sessions)) {
    if (sessionIndex === occurrence.sessionIndex) {
      break
    }
    const session = sessions[sessionIndex]
    if (session !== undefined) {
      elapsedInTradingDay += getSessionDuration(session)
    }
  }

  const tradingDayLocalStart = occurrence.tradingDayTimestamp + utcOffsetMinutes * MINUTE
  const tradingDayOrdinal = countTradingDaysBefore(tradingDayLocalStart, calendar)
  return {
    coordinate: tradingDayOrdinal * getTradingDayDuration(sessions) + elapsedInTradingDay,
    elapsedInTradingDay,
    tradingDayLocalStart,
    tradingDayOrdinal
  }
}

function tradingTimeCoordinateToTimestamp(coordinate: number, currentPosition: TradingTimePosition, utcOffsetMinutes: number, sessions: readonly NormalizedTradingSession[], calendar: NormalizedTradingCalendar): number {
  const tradingDayDuration = getTradingDayDuration(sessions)
  const targetOrdinal = Math.floor(coordinate / tradingDayDuration)
  let elapsed = coordinate - targetOrdinal * tradingDayDuration
  const tradingDayLocalStart = moveTradingDay(currentPosition.tradingDayLocalStart, targetOrdinal - currentPosition.tradingDayOrdinal, calendar)

  for (const sessionIndex of getTradingDaySessionIndexes(sessions)) {
    const session = sessions[sessionIndex]
    if (session === undefined) {
      continue
    }
    const sessionDuration = getSessionDuration(session)
    if (elapsed < sessionDuration) {
      const sessionDay = session.endMinutes < session.startMinutes ? getPreviousTradingDay(tradingDayLocalStart, calendar) : tradingDayLocalStart
      return sessionDay + session.startMinutes * MINUTE + elapsed - utcOffsetMinutes * MINUTE
    }
    elapsed -= sessionDuration
  }

  throw new RangeError('period start is outside the configured trading sessions')
}

function getTradingDaySessionIndexes(sessions: readonly NormalizedTradingSession[]): readonly number[] {
  return sessions
    .map((session, index) => ({ index, overnight: session.endMinutes < session.startMinutes, startMinutes: session.startMinutes }))
    .sort((left, right) => Number(right.overnight) - Number(left.overnight) || left.startMinutes - right.startMinutes)
    .map(({ index }) => index)
}

function getTradingDayDuration(sessions: readonly NormalizedTradingSession[]): number {
  return sessions.reduce((total, session) => total + getSessionDuration(session), 0)
}

function getSessionDuration(session: NormalizedTradingSession): number {
  const durationMinutes = session.endMinutes < session.startMinutes ? 24 * 60 - session.startMinutes + session.endMinutes : session.endMinutes - session.startMinutes
  return durationMinutes * MINUTE
}

function countTradingDaysBefore(localDayStart: number, calendar: NormalizedTradingCalendar): number {
  return localDayStart >= 0 ? countTradingDays(0, localDayStart, calendar) : -countTradingDays(localDayStart, 0, calendar)
}

function countTradingDays(start: number, end: number, calendar: NormalizedTradingCalendar): number {
  const dayCount = Math.floor((end - start) / DAY)
  const fullWeeks = Math.floor(dayCount / 7)
  let count = fullWeeks * (7 - calendar.weekendDays.size)
  const remainder = dayCount % 7
  const startWeekday = new Date(start).getUTCDay()
  for (let index = 0; index < remainder; index += 1) {
    if (!calendar.weekendDays.has((startWeekday + index) % 7)) {
      count += 1
    }
  }

  for (const holiday of calendar.holidays) {
    if (holiday >= start && holiday < end && !calendar.extraTradingDays.has(holiday) && !calendar.weekendDays.has(new Date(holiday).getUTCDay())) {
      count -= 1
    }
  }
  for (const extraTradingDay of calendar.extraTradingDays) {
    if (extraTradingDay >= start && extraTradingDay < end && calendar.weekendDays.has(new Date(extraTradingDay).getUTCDay())) {
      count += 1
    }
  }
  return count
}

function moveTradingDay(localDayStart: number, distance: number, calendar: NormalizedTradingCalendar): number {
  let result = localDayStart
  const step = distance < 0 ? -DAY : DAY
  for (let remaining = Math.abs(distance); remaining > 0; ) {
    result += step
    if (isTradingDay(result, calendar)) {
      remaining -= 1
    }
  }
  return result
}

function isTradingDay(localDayStart: number, calendar: NormalizedTradingCalendar): boolean {
  if (calendar.extraTradingDays.has(localDayStart)) {
    return true
  }
  return !calendar.holidays.has(localDayStart) && !calendar.weekendDays.has(new Date(localDayStart).getUTCDay())
}

function getNextTradingDay(localDayStart: number, calendar: NormalizedTradingCalendar): number {
  let nextDay = localDayStart + DAY
  while (!isTradingDay(nextDay, calendar)) {
    nextDay += DAY
  }
  return nextDay
}

function getPreviousTradingDay(localDayStart: number, calendar: NormalizedTradingCalendar): number {
  let previousDay = localDayStart - DAY
  while (!isTradingDay(previousDay, calendar)) {
    previousDay -= DAY
  }
  return previousDay
}

function parseTime(value: string, field: 'start' | 'end'): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (match === null) {
    throw new RangeError(`session ${field} must use HH:mm format`)
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  const isEndOfDay = field === 'end' && hour === 24 && minute === 0
  if ((!isEndOfDay && (hour < 0 || hour > 23)) || minute < 0 || minute > 59) {
    throw new RangeError(`session ${field} must be a valid local time`)
  }

  return hour * 60 + minute
}

function parseLocalDate(value: string, field: 'holidays' | 'extraTradingDays'): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new RangeError(`tradingCalendar.${field} must use YYYY-MM-DD format`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`tradingCalendar.${field} must contain valid dates`)
  }
  return date.getTime()
}

function validateSessionsDoNotOverlap(sessions: readonly NormalizedTradingSession[]): void {
  const intervals = sessions
    .flatMap((session) => {
      if (session.endMinutes > session.startMinutes) {
        return [{ start: session.startMinutes, end: session.endMinutes }]
      }
      return [
        { start: session.startMinutes, end: 24 * 60 },
        { start: 0, end: session.endMinutes }
      ]
    })
    .sort((left, right) => left.start - right.start)

  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1]
    const current = intervals[index]
    if (previous !== undefined && current !== undefined && current.start < previous.end) {
      throw new RangeError('trading sessions must not overlap')
    }
  }
}
