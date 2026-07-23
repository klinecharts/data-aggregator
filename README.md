# @klinecharts/data-aggregator

Aggregate real-time transaction data into candlestick data.

## Install

```bash
npm install @klinecharts/data-aggregator
```

## Usage

```ts
import { DataAggregator } from "@klinecharts/data-aggregator";

const aggregator = new DataAggregator({ utcOffsetMinutes: 8 * 60 });
aggregator.setPeriod({ type: "minute", span: 5 });

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
const aggregator = new DataAggregator();
aggregator.setPeriod({ type: "second", span: 15 });
aggregator.setPeriod({ type: "hour", span: 4 });
aggregator.setPeriod({ type: "month", span: 1 });
```

Call `setPeriod` before adding trades. Setting it again clears the current
K-line and timestamp-order state.

To resume aggregation from the last unclosed K-line, set it as base data after
setting the period:

```ts
aggregator.setBaseData(lastUnclosedKLine);
```

Trades in the same period update this K-line. The base K-line is returned as
`closed` when a trade starts a new period.

Period timestamps represent the start of each window. The default time zone is
UTC. Use `utcOffsetMinutes` for markets with a fixed offset. Weeks start on
Monday.

Trades must be added in timestamp order. Missing periods are not filled with
synthetic K-lines.

## 24/7 trading

Omit `sessions` for a market that trades continuously. The local trading-day
boundary is defined by `utcOffsetMinutes`. The second, minute, and hour merge
options also apply to 24/7 trading:

```ts
const aggregator = new DataAggregator({
  utcOffsetMinutes: 0,
  mergeSecondAcrossTradingDay: true,
  mergeMinuteAcrossTradingDay: true,
  mergeHourAcrossTradingDay: true,
});
```

When an option is `false`, that period is truncated at local midnight. When it
is `true`, the period can continue across midnight without interruption.

## Trading sessions

Use `sessions` for markets with a midday break or other discontinuous trading
hours. Session times use the local clock defined by `utcOffsetMinutes`.

```ts
const aggregator = new DataAggregator({
  utcOffsetMinutes: 8 * 60,
  mergeSecondAcrossTradingDay: false,
  mergeMinuteAcrossTradingDay: false,
  mergeHourAcrossTradingDay: false,
  sessions: [
    { start: "09:30", end: "11:30" },
    { start: "13:00", end: "15:00" },
  ],
});
aggregator.setPeriod({ type: "hour", span: 1 });
```

By default, second, minute, and hour K-lines do not cross a trading-day
boundary. If the remaining trading time is shorter than the configured period,
that shorter K-line is treated as complete. Enable
`mergeSecondAcrossTradingDay`,
`mergeMinuteAcrossTradingDay`, or
`mergeHourAcrossTradingDay` to continue it with effective trading time
from later trading days. Breaks, weekends, and holidays do not count toward the
period duration. The three settings are independent and default to `false`.

No synthetic K-lines are created during a break, and trades outside the
configured sessions are rejected. Use an end time earlier than the start time
for a session that crosses midnight, such as `21:00` to `02:00`.
An overnight session belongs to the natural date on which it ends, so Monday
`21:00` through Tuesday `02:00` is aggregated with Tuesday's day session for
day, week, month, and year periods.

Saturday and Sunday are non-trading days by default. Supply exchange holidays
as local calendar dates; an overnight session is assigned to the next available
trading day after weekends and holidays.

```ts
const aggregator = new DataAggregator({
  sessions: [
    { start: "21:00", end: "02:00" },
    { start: "09:00", end: "15:00" },
  ],
  tradingCalendar: {
    holidays: ["2026-01-01", "2026-02-16", "2026-02-17"],
    extraTradingDays: [],
    weekendDays: [0, 6],
  },
});
aggregator.setPeriod({ type: "day", span: 1 });
```

`extraTradingDays` overrides both `holidays` and `weekendDays`. Dates use the
same local time zone as the configured sessions.

## Development

```bash
bun install
bun run dev
```

Open the URL printed in the terminal to use the real-time aggregation example.
It continuously generates trades, displays the current and closed K-lines, and
provides pause, single-step, next-period, and reset controls, plus an editable
period amount, selectable time unit, configurable simulation start time, and
trade interval in milliseconds. The example
also exposes every `DataAggregator` option: `utcOffsetMinutes`, the
three cross-trading-day merge flags, `sessions`, and `tradingCalendar`.
Structured options are entered as JSON. The example imports directly from
`src`, so source and example changes are hot reloaded by Bun. The period, start
time, and aggregator options are cached in browser storage and restored on the
next visit.

The example source is under `examples`. Run tests continuously while
developing with:

```bash
bun run test:watch
```

Other development checks remain available separately:

```bash
bun run check
bun run format
bun run build
```
