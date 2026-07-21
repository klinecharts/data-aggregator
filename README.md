# @klinecharts/data-aggregator

Aggregate real-time trades into K-line (candlestick) data compatible with
KLineCharts.

## Install

```bash
bun add @klinecharts/data-aggregator
```

## Usage

```ts
import { DataAggregator } from "@klinecharts/data-aggregator";

const aggregator = new DataAggregator(
  { type: "minute", span: 5 },
  { utcOffsetMinutes: 8 * 60 },
);

const result = aggregator.add({
  timestamp: Date.now(),
  price: 12.5,
  volume: 100,
});

// Update the current candle in KLineCharts.
chart.updateData(result.current);

// Present when the trade starts a new period.
if (result.closed) {
  await saveKLine(result.closed);
}
```

`turnover` is optional on a trade. When omitted, it is calculated as
`price * volume`.

## Periods

The supported period types are `second`, `minute`, `hour`, `day`, `week`,
`month`, and `year`. `span` must be a positive integer.

```ts
new DataAggregator({ type: "second", span: 15 });
new DataAggregator({ type: "hour", span: 4 });
new DataAggregator({ type: "month", span: 1 });
```

Period timestamps represent the start of each window. The default time zone is
UTC. Use `utcOffsetMinutes` for markets with a fixed offset. Weeks start on
Monday.

Trades must be added in timestamp order. Missing periods are not filled with
synthetic K-lines.

## Development

```bash
bun install
bun run check
bun run format
bun run build
```

The package is configured for public publishing under the `@klinecharts`
scope:

```bash
bun publish
```
