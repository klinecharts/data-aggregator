import { describe, expect, test } from 'bun:test'
import { getPeriodStart } from './period'

describe('getPeriodStart', () => {
  test('aligns fixed periods', () => {
    const timestamp = Date.UTC(2026, 6, 21, 10, 17, 42, 123)

    expect(getPeriodStart(timestamp, { type: 'second', span: 15 })).toBe(Date.UTC(2026, 6, 21, 10, 17, 30))
    expect(getPeriodStart(timestamp, { type: 'minute', span: 5 })).toBe(Date.UTC(2026, 6, 21, 10, 15))
    expect(getPeriodStart(timestamp, { type: 'hour', span: 4 })).toBe(Date.UTC(2026, 6, 21, 8))
  })

  test('uses Monday as the start of a week', () => {
    const sunday = Date.UTC(2026, 6, 26, 12)
    expect(getPeriodStart(sunday, { type: 'week', span: 1 })).toBe(Date.UTC(2026, 6, 20))
  })

  test('aligns calendar months and years', () => {
    const timestamp = Date.UTC(2026, 6, 21, 12)
    expect(getPeriodStart(timestamp, { type: 'month', span: 3 })).toBe(Date.UTC(2026, 6, 1))
    expect(getPeriodStart(timestamp, { type: 'year', span: 5 })).toBe(Date.UTC(2025, 0, 1))
  })

  test('aligns day boundaries using a fixed UTC offset', () => {
    const timestamp = Date.UTC(2026, 6, 21, 2)
    expect(getPeriodStart(timestamp, { type: 'day', span: 1 }, 8 * 60)).toBe(Date.UTC(2026, 6, 20, 16))
  })

  test('rejects invalid periods and offsets', () => {
    expect(() => getPeriodStart(0, { type: 'minute', span: 0 })).toThrow()
    expect(() => getPeriodStart(0, { type: 'minute', span: 1 }, 1.5)).toThrow()
  })
})
