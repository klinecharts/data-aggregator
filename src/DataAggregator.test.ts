import { describe, expect, test } from 'bun:test'
import { DataAggregator } from './DataAggregator'
import type { DataAggregatorOptions, Period } from './types'

function createAggregator(period: Period, options?: DataAggregatorOptions): DataAggregator {
  const aggregator = new DataAggregator(options)
  aggregator.setPeriod(period)
  return aggregator
}

describe('DataAggregator', () => {
  test('aggregates trades into OHLCV data', () => {
    const aggregator = createAggregator({ type: 'minute', span: 1 })
    const start = Date.UTC(2026, 6, 21, 10, 0)

    aggregator.add({ timestamp: start + 1_000, price: 10, volume: 2 })
    aggregator.add({
      timestamp: start + 2_000,
      price: 12,
      volume: 3,
      turnover: 35
    })
    const result = aggregator.add({
      timestamp: start + 3_000,
      price: 9,
      volume: 1
    })

    expect(result).toEqual({
      current: {
        timestamp: start,
        open: 10,
        high: 12,
        low: 9,
        close: 9,
        volume: 6,
        turnover: 64
      }
    })
  })

  test('returns the closed K-line when a new period starts', () => {
    const aggregator = createAggregator({ type: 'minute', span: 1 })
    const start = Date.UTC(2026, 6, 21, 10, 0)

    aggregator.add({ timestamp: start, price: 10, volume: 2 })
    const result = aggregator.add({
      timestamp: start + 60_000,
      price: 11,
      volume: 3
    })

    expect(result.closed).toEqual({
      timestamp: start,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 2,
      turnover: 20
    })
    expect(result.current.timestamp).toBe(start + 60_000)
    expect(result.current.open).toBe(11)
  })

  test('does not create empty K-lines across a gap', () => {
    const aggregator = createAggregator({ type: 'minute', span: 1 })
    const start = Date.UTC(2026, 6, 21, 10, 0)

    aggregator.add({ timestamp: start, price: 10, volume: 1 })
    const result = aggregator.add({
      timestamp: start + 5 * 60_000,
      price: 12,
      volume: 1
    })

    expect(result.closed?.timestamp).toBe(start)
    expect(result.current.timestamp).toBe(start + 5 * 60_000)
  })

  test('aligns intraday K-lines to discontinuous trading sessions', () => {
    const aggregator = createAggregator(
      { type: 'hour', span: 1 },
      {
        utcOffsetMinutes: 8 * 60,
        sessions: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      }
    )
    const morningOpen = Date.UTC(2026, 6, 21, 1, 30)

    aggregator.add({ timestamp: morningOpen + 45 * 60_000, price: 10, volume: 1 })
    const lateMorning = aggregator.add({ timestamp: morningOpen + 75 * 60_000, price: 11, volume: 1 })
    const afternoon = aggregator.add({ timestamp: morningOpen + 3 * 60 * 60_000 + 40 * 60_000, price: 12, volume: 1 })

    expect(lateMorning.closed?.timestamp).toBe(morningOpen)
    expect(lateMorning.current.timestamp).toBe(morningOpen + 60 * 60_000)
    expect(afternoon.closed?.timestamp).toBe(morningOpen + 60 * 60_000)
    expect(afternoon.current.timestamp).toBe(morningOpen + 3.5 * 60 * 60_000)
  })

  test('closes an incomplete hour K-line at the trading-day boundary by default', () => {
    const aggregator = createAggregator(
      { type: 'hour', span: 5 },
      {
        mergeHourKLinesAcrossTradingDays: false,
        sessions: [{ start: '09:00', end: '13:00' }]
      }
    )
    const thursdayOpen = Date.UTC(2026, 6, 23, 9)
    const fridayOpen = Date.UTC(2026, 6, 24, 9)

    aggregator.add({ timestamp: thursdayOpen + 30 * 60_000, price: 10, volume: 1 })
    aggregator.add({ timestamp: thursdayOpen + 3.5 * 60 * 60_000, price: 11, volume: 1 })
    const result = aggregator.add({ timestamp: fridayOpen + 30 * 60_000, price: 12, volume: 1 })

    expect(result.closed?.timestamp).toBe(thursdayOpen)
    expect(result.closed?.volume).toBe(2)
    expect(result.current.timestamp).toBe(fridayOpen)
  })

  test('uses the local calendar day as the boundary when sessions are omitted', () => {
    const aggregator = createAggregator({ type: 'hour', span: 5 })
    const dayStart = Date.UTC(2026, 6, 23)

    aggregator.add({ timestamp: dayStart + 23 * 60 * 60_000, price: 10, volume: 1 })
    const result = aggregator.add({ timestamp: dayStart + 24.5 * 60 * 60_000, price: 11, volume: 1 })

    expect(result.closed?.timestamp).toBe(dayStart + 20 * 60 * 60_000)
    expect(result.current.timestamp).toBe(dayStart + 24 * 60 * 60_000)
  })

  test('continues an hour K-line with trading time from the next trading day', () => {
    const aggregator = createAggregator(
      { type: 'hour', span: 5 },
      {
        mergeHourKLinesAcrossTradingDays: true,
        sessions: [{ start: '09:00', end: '13:00' }]
      }
    )
    const thursdayOpen = Date.UTC(2026, 6, 23, 9)
    const fridayOpen = Date.UTC(2026, 6, 24, 9)

    aggregator.add({ timestamp: thursdayOpen + 30 * 60_000, price: 10, volume: 1 })
    aggregator.add({ timestamp: thursdayOpen + 3.5 * 60 * 60_000, price: 11, volume: 1 })
    const continued = aggregator.add({ timestamp: fridayOpen + 30 * 60_000, price: 12, volume: 1 })
    const completed = aggregator.add({ timestamp: fridayOpen + 1.5 * 60 * 60_000, price: 13, volume: 1 })

    expect(continued.closed).toBeUndefined()
    expect(continued.current.timestamp).toBe(thursdayOpen)
    expect(continued.current.volume).toBe(3)
    expect(completed.closed?.timestamp).toBe(thursdayOpen)
    expect(completed.current.timestamp).toBe(fridayOpen + 60 * 60_000)
  })

  test('controls cross-trading-day merging independently for minute K-lines', () => {
    const options = {
      mergeMinuteKLinesAcrossTradingDays: true,
      mergeHourKLinesAcrossTradingDays: false,
      sessions: [{ start: '09:00', end: '13:00' }]
    }
    const aggregator = createAggregator({ type: 'minute', span: 300 }, options)
    const thursdayOpen = Date.UTC(2026, 6, 23, 9)
    const fridayOpen = Date.UTC(2026, 6, 24, 9)

    aggregator.add({ timestamp: thursdayOpen + 30 * 60_000, price: 10, volume: 1 })
    const result = aggregator.add({ timestamp: fridayOpen + 30 * 60_000, price: 11, volume: 1 })

    expect(result.closed).toBeUndefined()
    expect(result.current.timestamp).toBe(thursdayOpen)
  })

  test('does not count holidays toward a cross-trading-day period', () => {
    const aggregator = createAggregator(
      { type: 'hour', span: 5 },
      {
        mergeHourKLinesAcrossTradingDays: true,
        sessions: [{ start: '09:00', end: '13:00' }],
        tradingCalendar: { holidays: ['2026-07-24'] }
      }
    )
    const thursdayOpen = Date.UTC(2026, 6, 23, 9)
    const mondayOpen = Date.UTC(2026, 6, 27, 9)

    aggregator.add({ timestamp: thursdayOpen + 30 * 60_000, price: 10, volume: 1 })
    const continued = aggregator.add({ timestamp: mondayOpen + 30 * 60_000, price: 11, volume: 1 })
    const completed = aggregator.add({ timestamp: mondayOpen + 1.5 * 60 * 60_000, price: 12, volume: 1 })

    expect(continued.closed).toBeUndefined()
    expect(continued.current.timestamp).toBe(thursdayOpen)
    expect(completed.closed?.timestamp).toBe(thursdayOpen)
  })

  test('rejects trades outside configured sessions', () => {
    const aggregator = createAggregator(
      { type: 'minute', span: 30 },
      {
        sessions: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      }
    )

    expect(() => aggregator.add({ timestamp: Date.UTC(2026, 6, 21, 12), price: 10, volume: 1 })).toThrow('outside')
  })

  test('supports sessions that cross midnight', () => {
    const aggregator = createAggregator({ type: 'hour', span: 1 }, { sessions: [{ start: '21:00', end: '02:00' }] })
    const sessionOpen = Date.UTC(2026, 6, 21, 21)

    aggregator.add({ timestamp: sessionOpen + 30 * 60_000, price: 10, volume: 1 })
    const afterMidnight = aggregator.add({ timestamp: sessionOpen + 3 * 60 * 60_000 + 15 * 60_000, price: 11, volume: 1 })

    expect(afterMidnight.current.timestamp).toBe(sessionOpen + 3 * 60 * 60_000)
  })

  test('assigns an overnight session and the following day session to the same trading day', () => {
    const aggregator = createAggregator(
      { type: 'day', span: 1 },
      {
        utcOffsetMinutes: 8 * 60,
        sessions: [
          { start: '21:00', end: '02:00' },
          { start: '09:00', end: '15:00' }
        ]
      }
    )
    const mondayNight = Date.UTC(2026, 6, 20, 13, 30)
    const tuesdayMorning = Date.UTC(2026, 6, 21, 1, 30)
    const tuesdayTradingDay = Date.UTC(2026, 6, 20, 16)

    aggregator.add({ timestamp: mondayNight, price: 10, volume: 1 })
    const afterMidnight = aggregator.add({ timestamp: Date.UTC(2026, 6, 20, 17), price: 11, volume: 2 })
    const daySession = aggregator.add({ timestamp: tuesdayMorning, price: 12, volume: 3 })

    expect(afterMidnight.closed).toBeUndefined()
    expect(daySession.closed).toBeUndefined()
    expect(daySession.current).toEqual({
      timestamp: tuesdayTradingDay,
      open: 10,
      high: 12,
      low: 10,
      close: 12,
      volume: 6,
      turnover: 68
    })
  })

  test('uses the overnight trading day at calendar period boundaries', () => {
    const aggregator = createAggregator({ type: 'week', span: 1 }, { sessions: [{ start: '21:00', end: '02:00' }] })
    const fridayNight = Date.UTC(2026, 6, 17, 21, 30)

    const result = aggregator.add({ timestamp: fridayNight, price: 10, volume: 1 })

    expect(result.current.timestamp).toBe(Date.UTC(2026, 6, 20))
  })

  test('rolls an overnight session past weekends and holidays', () => {
    const aggregator = createAggregator(
      { type: 'day', span: 1 },
      {
        sessions: [
          { start: '21:00', end: '02:00' },
          { start: '09:00', end: '15:00' }
        ],
        tradingCalendar: { holidays: ['2026-07-20'] }
      }
    )
    const fridayNight = Date.UTC(2026, 6, 17, 21, 30)
    const tuesdayMorning = Date.UTC(2026, 6, 21, 9, 30)

    aggregator.add({ timestamp: fridayNight, price: 10, volume: 1 })
    const result = aggregator.add({ timestamp: tuesdayMorning, price: 12, volume: 2 })

    expect(result.closed).toBeUndefined()
    expect(result.current.timestamp).toBe(Date.UTC(2026, 6, 21))
    expect(result.current.volume).toBe(3)
  })

  test('rejects regular sessions on closed days and allows explicit extra trading days', () => {
    const closedWeekend = createAggregator({ type: 'day', span: 1 }, { sessions: [{ start: '09:00', end: '15:00' }] })
    const openWeekend = createAggregator(
      { type: 'day', span: 1 },
      {
        sessions: [{ start: '09:00', end: '15:00' }],
        tradingCalendar: { extraTradingDays: ['2026-07-18'] }
      }
    )
    const saturdayMorning = Date.UTC(2026, 6, 18, 10)

    expect(() => closedWeekend.add({ timestamp: saturdayMorning, price: 10, volume: 1 })).toThrow('outside')
    expect(openWeekend.add({ timestamp: saturdayMorning, price: 10, volume: 1 }).current.timestamp).toBe(Date.UTC(2026, 6, 18))
  })

  test('validates trading session configuration', () => {
    expect(() => createAggregator({ type: 'minute', span: 1 }, { sessions: [] })).toThrow('at least one')
    expect(() => createAggregator({ type: 'minute', span: 1 }, { sessions: [{ start: '9:30', end: '11:30' }] })).toThrow('HH:mm')
    expect(() =>
      createAggregator(
        { type: 'minute', span: 1 },
        {
          sessions: [
            { start: '09:30', end: '11:30' },
            { start: '11:00', end: '13:00' }
          ]
        }
      )
    ).toThrow('overlap')
    expect(() => createAggregator({ type: 'minute', span: 1 }, { sessions: [{ start: '09:00', end: '15:00' }], tradingCalendar: { holidays: ['2026-02-30'] } })).toThrow('valid dates')
    expect(() => createAggregator({ type: 'minute', span: 1 }, { tradingCalendar: { holidays: ['2026-07-20'] } })).toThrow('requires sessions')
    expect(() => new DataAggregator({ mergeHourKLinesAcrossTradingDays: 1 as never })).toThrow('must be a boolean')
  })

  test('returns snapshots that cannot mutate internal state', () => {
    const aggregator = createAggregator({ type: 'minute', span: 1 })
    const result = aggregator.add({ timestamp: 0, price: 10, volume: 1 })

    result.current.close = 100
    expect(aggregator.add({ timestamp: 1, price: 10, volume: 0 }).current.close).toBe(10)
  })

  test('requires a period before adding trades', () => {
    const aggregator = new DataAggregator()

    expect(() => aggregator.add({ timestamp: 0, price: 10, volume: 1 })).toThrow('period must be set')
  })

  test('continues aggregating from an unclosed base K-line', () => {
    const aggregator = new DataAggregator()
    const start = Date.UTC(2026, 6, 21, 10)
    aggregator.setPeriod({ type: 'minute', span: 1 })
    aggregator.setBaseData({
      timestamp: start,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 5,
      turnover: 53
    })

    const current = aggregator.add({ timestamp: start + 30_000, price: 13, volume: 2 })
    const next = aggregator.add({ timestamp: start + 60_000, price: 8, volume: 1 })

    expect(current.current).toEqual({
      timestamp: start,
      open: 10,
      high: 13,
      low: 9,
      close: 13,
      volume: 7,
      turnover: 79
    })
    expect(next.closed).toEqual(current.current)
    expect(next.current.open).toBe(8)
  })

  test('copies base data and clears it when the period changes', () => {
    const aggregator = new DataAggregator()
    aggregator.setPeriod({ type: 'minute', span: 1 })
    const base = { timestamp: 0, open: 10, high: 10, low: 10, close: 10, volume: 1, turnover: 10 }
    aggregator.setBaseData(base)
    base.close = 20

    expect(aggregator.add({ timestamp: 1, price: 10, volume: 0 }).current.close).toBe(10)
    aggregator.setPeriod({ type: 'hour', span: 1 })
    expect(aggregator.add({ timestamp: 2, price: 8, volume: 1 }).closed).toBeUndefined()
  })

  test('resumes an overnight trading day whose session starts before its K-line timestamp', () => {
    const aggregator = new DataAggregator({
      utcOffsetMinutes: 8 * 60,
      sessions: [
        { start: '21:00', end: '02:00' },
        { start: '09:00', end: '15:00' }
      ]
    })
    const tuesdayTradingDay = Date.UTC(2026, 6, 20, 16)
    aggregator.setPeriod({ type: 'day', span: 1 })
    aggregator.setBaseData({
      timestamp: tuesdayTradingDay,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 1,
      turnover: 10
    })

    const result = aggregator.add({ timestamp: Date.UTC(2026, 6, 20, 14), price: 11, volume: 2 })

    expect(result.closed).toBeUndefined()
    expect(result.current.timestamp).toBe(tuesdayTradingDay)
    expect(result.current.volume).toBe(3)
  })

  test('validates base K-line data', () => {
    const aggregator = new DataAggregator()
    const base = { timestamp: 0, open: 10, high: 10, low: 10, close: 10, volume: 1, turnover: 10 }

    expect(() => aggregator.setBaseData(base)).toThrow('period must be set')
    aggregator.setPeriod({ type: 'minute', span: 1 })
    expect(() => aggregator.setBaseData({ ...base, high: 9 })).toThrow('contain open and close')
    expect(() => aggregator.setBaseData({ ...base, volume: -1 })).toThrow('non-negative')
  })

  test('rejects out-of-order and invalid trades', () => {
    const aggregator = createAggregator({ type: 'minute', span: 1 })
    aggregator.add({ timestamp: 2, price: 10, volume: 1 })

    expect(() => aggregator.add({ timestamp: 1, price: 11, volume: 1 })).toThrow('timestamp order')
    expect(() => aggregator.add({ timestamp: 3, price: 0, volume: 1 })).toThrow('positive')
    expect(() => aggregator.add({ timestamp: 3, price: 1, volume: -1 })).toThrow('non-negative')
  })

  test('can be reset and reused', () => {
    const aggregator = createAggregator({ type: 'day', span: 1 })
    aggregator.add({ timestamp: 100, price: 10, volume: 1 })
    aggregator.reset()

    expect(aggregator.add({ timestamp: 50, price: 8, volume: 2 }).current.open).toBe(8)
  })
})
