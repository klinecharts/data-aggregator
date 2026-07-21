import { describe, expect, test } from 'bun:test'
import { DataAggregator } from './DataAggregator'

describe('DataAggregator', () => {
  test('aggregates trades into OHLCV data', () => {
    const aggregator = new DataAggregator({ type: 'minute', span: 1 })
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
    const aggregator = new DataAggregator({ type: 'minute', span: 1 })
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
    const aggregator = new DataAggregator({ type: 'minute', span: 1 })
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

  test('returns snapshots that cannot mutate internal state', () => {
    const aggregator = new DataAggregator({ type: 'minute', span: 1 })
    const result = aggregator.add({ timestamp: 0, price: 10, volume: 1 })

    result.current.close = 100
    expect(aggregator.current?.close).toBe(10)
  })

  test('rejects out-of-order and invalid trades', () => {
    const aggregator = new DataAggregator({ type: 'minute', span: 1 })
    aggregator.add({ timestamp: 2, price: 10, volume: 1 })

    expect(() => aggregator.add({ timestamp: 1, price: 11, volume: 1 })).toThrow('timestamp order')
    expect(() => aggregator.add({ timestamp: 3, price: 0, volume: 1 })).toThrow('positive')
    expect(() => aggregator.add({ timestamp: 3, price: 1, volume: -1 })).toThrow('non-negative')
  })

  test('can be reset and reused', () => {
    const aggregator = new DataAggregator({ type: 'day', span: 1 })
    aggregator.add({ timestamp: 100, price: 10, volume: 1 })
    aggregator.reset()

    expect(aggregator.current).toBeUndefined()
    expect(aggregator.add({ timestamp: 50, price: 8, volume: 2 }).current.open).toBe(8)
  })
})
