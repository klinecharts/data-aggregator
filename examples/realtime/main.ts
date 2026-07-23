import type { AggregationResult, KLineData, Period, RealtimeDataAggregatorOptions, TradingCalendar, TradingSession } from '../../src'
import { RealtimeDataAggregator } from '../../src'

const periodSpan = element<HTMLInputElement>('period-span')
const periodUnit = element<HTMLSelectElement>('period-unit')
const startTimeInput = element<HTMLInputElement>('start-time')
const tradeIntervalInput = element<HTMLInputElement>('trade-interval')
const utcOffsetInput = element<HTMLInputElement>('utc-offset-minutes')
const mergeSecondInput = element<HTMLInputElement>('merge-second')
const mergeMinuteInput = element<HTMLInputElement>('merge-minute')
const mergeHourInput = element<HTMLInputElement>('merge-hour')
const sessionsInput = element<HTMLTextAreaElement>('sessions')
const tradingCalendarInput = element<HTMLTextAreaElement>('trading-calendar')
const toggleButton = element<HTMLButtonElement>('toggle-button')
const stepButton = element<HTMLButtonElement>('step-button')
const nextPeriodButton = element<HTMLButtonElement>('next-period-button')
const resetButton = element<HTMLButtonElement>('reset-button')
const statusText = element<HTMLElement>('status-text')
const liveIndicator = document.querySelector<HTMLElement>('.live-indicator')!
const tableBody = element<HTMLTableSectionElement>('candle-table')
const tradeJson = element<HTMLElement>('trade-json')
const configurationError = element<HTMLElement>('config-error')

interface CachedConfiguration {
  version: 1
  periodSpan: number
  periodUnit: Period['type']
  startTime: string
  tradeIntervalMilliseconds?: number
  /** Legacy value cached by the previous example version. */
  tradeFrequency?: number
  utcOffsetMinutes: number
  mergeSecondAcrossTradingDay: boolean
  mergeMinuteAcrossTradingDay: boolean
  mergeHourAcrossTradingDay: boolean
  sessions: string
  tradingCalendar: string
}

const configurationCacheKey = '@klinecharts/data-aggregator:realtime-example:v1'
const maximumHistorySize = 10
const minuteMilliseconds = 60_000
const dayMilliseconds = 24 * 60 * minuteMilliseconds
const periodTypes: readonly Period['type'][] = ['second', 'minute', 'hour', 'day', 'week', 'month', 'year']
let aggregator = initializeAggregator()
saveConfiguration()
let closedCandles: KLineData[] = []
let currentCandle: KLineData | undefined
let price = 102.5
let virtualTime = 0
let running = true
let timer: ReturnType<typeof setInterval> | undefined

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) {
    throw new Error(`Missing #${id}`)
  }
  return value as T
}

function selectedPeriod(): Period {
  return {
    type: periodUnit.value as Period['type'],
    span: Number(periodSpan.value)
  }
}

function initializeAggregator(): RealtimeDataAggregator {
  restoreConfiguration()
  try {
    return createAggregator()
  } catch {
    clearCachedConfiguration()
    setDefaultConfiguration()
    return createAggregator()
  }
}

function setDefaultConfiguration(): void {
  periodSpan.value = '5'
  periodUnit.value = 'second'
  startTimeInput.value = formatDateTimeLocal(Date.now() - 45_000)
  tradeIntervalInput.value = '300'
  utcOffsetInput.value = '480'
  mergeSecondInput.checked = false
  mergeMinuteInput.checked = false
  mergeHourInput.checked = false
  sessionsInput.value = ''
  tradingCalendarInput.value = ''
}

function restoreConfiguration(): void {
  setDefaultConfiguration()
  try {
    const source = localStorage.getItem(configurationCacheKey)
    if (source === null) {
      return
    }
    const cached: unknown = JSON.parse(source)
    if (!isCachedConfiguration(cached)) {
      clearCachedConfiguration()
      return
    }
    periodSpan.value = cached.periodSpan.toString()
    periodUnit.value = cached.periodUnit
    startTimeInput.value = cached.startTime
    tradeIntervalInput.value = Math.round(cached.tradeIntervalMilliseconds ?? (cached.tradeFrequency === undefined ? 300 : 1_000 / cached.tradeFrequency)).toString()
    utcOffsetInput.value = cached.utcOffsetMinutes.toString()
    mergeSecondInput.checked = cached.mergeSecondAcrossTradingDay
    mergeMinuteInput.checked = cached.mergeMinuteAcrossTradingDay
    mergeHourInput.checked = cached.mergeHourAcrossTradingDay
    sessionsInput.value = cached.sessions
    tradingCalendarInput.value = cached.tradingCalendar
  } catch {
    clearCachedConfiguration()
  }
}

function saveConfiguration(): void {
  const cached: CachedConfiguration = {
    version: 1,
    periodSpan: Number(periodSpan.value),
    periodUnit: periodUnit.value as Period['type'],
    startTime: startTimeInput.value,
    tradeIntervalMilliseconds: Number(tradeIntervalInput.value),
    utcOffsetMinutes: Number(utcOffsetInput.value),
    mergeSecondAcrossTradingDay: mergeSecondInput.checked,
    mergeMinuteAcrossTradingDay: mergeMinuteInput.checked,
    mergeHourAcrossTradingDay: mergeHourInput.checked,
    sessions: sessionsInput.value,
    tradingCalendar: tradingCalendarInput.value
  }
  try {
    localStorage.setItem(configurationCacheKey, JSON.stringify(cached))
  } catch {
    // The example remains usable when browser storage is unavailable.
  }
}

function clearCachedConfiguration(): void {
  try {
    localStorage.removeItem(configurationCacheKey)
  } catch {
    // Ignore unavailable browser storage and continue with defaults.
  }
}

function isCachedConfiguration(value: unknown): value is CachedConfiguration {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const cached = value as Record<string, unknown>
  return (
    cached.version === 1 &&
    Number.isInteger(cached.periodSpan) &&
    Number(cached.periodSpan) > 0 &&
    typeof cached.periodUnit === 'string' &&
    periodTypes.includes(cached.periodUnit as Period['type']) &&
    typeof cached.startTime === 'string' &&
    Number.isFinite(new Date(cached.startTime).getTime()) &&
    (cached.tradeIntervalMilliseconds === undefined || (typeof cached.tradeIntervalMilliseconds === 'number' && Number.isInteger(cached.tradeIntervalMilliseconds) && cached.tradeIntervalMilliseconds >= 1 && cached.tradeIntervalMilliseconds <= 60_000)) &&
    (cached.tradeFrequency === undefined || (typeof cached.tradeFrequency === 'number' && Number.isFinite(cached.tradeFrequency) && cached.tradeFrequency >= 0.1 && cached.tradeFrequency <= 100)) &&
    Number.isInteger(cached.utcOffsetMinutes) &&
    typeof cached.mergeSecondAcrossTradingDay === 'boolean' &&
    typeof cached.mergeMinuteAcrossTradingDay === 'boolean' &&
    typeof cached.mergeHourAcrossTradingDay === 'boolean' &&
    typeof cached.sessions === 'string' &&
    typeof cached.tradingCalendar === 'string'
  )
}

function createAggregator(): RealtimeDataAggregator {
  const options: RealtimeDataAggregatorOptions = {
    utcOffsetMinutes: Number(utcOffsetInput.value),
    mergeSecondAcrossTradingDay: mergeSecondInput.checked,
    mergeMinuteAcrossTradingDay: mergeMinuteInput.checked,
    mergeHourAcrossTradingDay: mergeHourInput.checked
  }
  const sessions = parseJson<TradingSession[]>(sessionsInput.value, 'sessions')
  const tradingCalendar = parseJson<TradingCalendar>(tradingCalendarInput.value, 'tradingCalendar')
  if (sessions !== undefined) {
    options.sessions = sessions
  }
  if (tradingCalendar !== undefined) {
    options.tradingCalendar = tradingCalendar
  }
  const value = new RealtimeDataAggregator(options)
  value.setPeriod(selectedPeriod())
  return value
}

function pushTrade(timestamp = virtualTime + 1_000): void {
  virtualTime = timestamp
  const movement = (Math.random() - 0.48) * 0.8
  price = Math.max(1, price + movement)
  const trade = {
    timestamp: virtualTime,
    price: Number(price.toFixed(2)),
    volume: Math.round(1 + Math.random() * 18)
  }
  let result: AggregationResult
  try {
    result = aggregator.add(trade)
  } catch (error) {
    showConfigurationError(error)
    setRunning(false)
    return
  }
  currentCandle = result.current
  if (result.closed) {
    closedCandles.push(result.closed)
    closedCandles = closedCandles.slice(-maximumHistorySize)
  }
  tradeJson.textContent = JSON.stringify(trade, null, 2)
  render()
}

function reset(nextAggregator: RealtimeDataAggregator = createAggregator()): void {
  stopTimer()
  closedCandles = []
  currentCandle = undefined
  price = 102.5
  virtualTime = selectedStartTimestamp() - 1_000
  aggregator = nextAggregator
  pushTrade()
  if (running) {
    startTimer()
  }
}

function startTimer(): void {
  stopTimer()
  timer = setInterval(pushTrade, Number(tradeIntervalInput.value))
}

function moveToNextPeriod(): void {
  if (!currentCandle) {
    return
  }
  setRunning(false)
  try {
    clearConfigurationError()
    pushTrade(findNextPeriodTimestamp(currentCandle))
  } catch (error) {
    showConfigurationError(error)
  }
}

function findNextPeriodTimestamp(current: KLineData): number {
  const period = selectedPeriod()
  const probe = createAggregator()
  probe.setBaseData(current)
  let candidate = advanceByPeriod(current.timestamp, period)
  let acceptedTimestamp = false

  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    try {
      const result = probe.add({ timestamp: candidate, price: current.close, volume: 0 })
      if (result.closed !== undefined) {
        return candidate
      }
      acceptedTimestamp = true
    } catch {
      // Move through session gaps until the next valid trading timestamp.
      acceptedTimestamp = false
    }
    candidate += acceptedTimestamp && period.type === 'second' ? 1_000 : minuteMilliseconds
  }

  throw new RangeError('无法在可搜索范围内找到下一个交易周期')
}

function advanceByPeriod(timestamp: number, period: Period): number {
  if (period.type === 'second') {
    return timestamp + period.span * 1_000
  }
  if (period.type === 'minute') {
    return timestamp + period.span * minuteMilliseconds
  }
  if (period.type === 'hour') {
    return timestamp + period.span * 60 * minuteMilliseconds
  }
  const date = new Date(timestamp)
  if (period.type === 'day') {
    date.setUTCDate(date.getUTCDate() + period.span)
  } else if (period.type === 'week') {
    date.setUTCDate(date.getUTCDate() + period.span * 7)
  } else if (period.type === 'month') {
    date.setUTCMonth(date.getUTCMonth() + period.span)
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + period.span)
  }
  return date.getTime()
}

function stopTimer(): void {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function setRunning(value: boolean): void {
  running = value
  toggleButton.textContent = running ? '暂停' : '继续'
  statusText.textContent = running ? '运行中' : '已暂停'
  liveIndicator.classList.toggle('paused', !running)
  if (running) {
    startTimer()
  } else {
    stopTimer()
  }
}

function render(): void {
  if (!currentCandle) {
    return
  }
  element('last-price').textContent = formatPrice(currentCandle.close)
  element('open-price').textContent = formatPrice(currentCandle.open)
  element('high-price').textContent = formatPrice(currentCandle.high)
  element('low-price').textContent = formatPrice(currentCandle.low)
  element('volume').textContent = currentCandle.volume.toFixed(0)
  element('virtual-time').textContent = new Date(virtualTime).toLocaleString('zh-CN', { hour12: false })
  renderTable()
}

function renderTable(): void {
  const rows = [...closedCandles.map((candle) => ({ candle, current: false })), ...(currentCandle ? [{ candle: currentCandle, current: true }] : [])].slice(-8).reverse()
  tableBody.replaceChildren(
    ...rows.map(({ candle, current }) => {
      const row = document.createElement('tr')
      const values = [formatDateTime(candle.timestamp), current ? 'CURRENT' : 'CLOSED', formatPrice(candle.open), formatPrice(candle.high), formatPrice(candle.low), formatPrice(candle.close), candle.volume.toFixed(0)]
      for (const [index, value] of values.entries()) {
        const cell = document.createElement('td')
        if (index === 1) {
          const badge = document.createElement('span')
          badge.className = `badge${current ? '' : ' closed'}`
          badge.textContent = value
          cell.append(badge)
        } else {
          cell.textContent = value
        }
        row.append(cell)
      }
      return row
    })
  )
}

function formatPrice(value: number): string {
  return value.toFixed(2)
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function formatDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function selectedStartTimestamp(): number {
  return new Date(startTimeInput.value).getTime()
}

function parseJson<T>(source: string, label: string): T | undefined {
  if (source.trim() === '') {
    return undefined
  }
  try {
    return JSON.parse(source) as T
  } catch {
    throw new SyntaxError(`${label} 不是有效的 JSON`)
  }
}

function showConfigurationError(error: unknown): void {
  configurationError.textContent = error instanceof Error ? error.message : String(error)
  configurationError.hidden = false
}

function clearConfigurationError(): void {
  configurationError.textContent = ''
  configurationError.hidden = true
}

function applyConfiguration(): void {
  const span = Number(periodSpan.value)
  if (!Number.isInteger(span) || span <= 0) {
    periodSpan.setCustomValidity('请输入大于 0 的整数')
    periodSpan.reportValidity()
    return
  }
  periodSpan.setCustomValidity('')
  if (!Number.isFinite(selectedStartTimestamp())) {
    startTimeInput.setCustomValidity('请输入有效的开始时间')
    startTimeInput.reportValidity()
    return
  }
  startTimeInput.setCustomValidity('')
  const tradeIntervalMilliseconds = Number(tradeIntervalInput.value)
  if (!Number.isInteger(tradeIntervalMilliseconds) || tradeIntervalMilliseconds < 1 || tradeIntervalMilliseconds > 60_000) {
    tradeIntervalInput.setCustomValidity('请输入 1 到 60000 之间的毫秒数')
    tradeIntervalInput.reportValidity()
    return
  }
  tradeIntervalInput.setCustomValidity('')
  const utcOffsetMinutes = Number(utcOffsetInput.value)
  if (utcOffsetInput.value.trim() === '' || !Number.isInteger(utcOffsetMinutes)) {
    utcOffsetInput.setCustomValidity('请输入整数分钟偏移量')
    utcOffsetInput.reportValidity()
    return
  }
  utcOffsetInput.setCustomValidity('')
  try {
    const nextAggregator = createAggregator()
    clearConfigurationError()
    saveConfiguration()
    reset(nextAggregator)
  } catch (error) {
    showConfigurationError(error)
    setRunning(false)
  }
}

toggleButton.addEventListener('click', () => setRunning(!running))
stepButton.addEventListener('click', () => {
  setRunning(false)
  pushTrade()
})
nextPeriodButton.addEventListener('click', moveToNextPeriod)
resetButton.addEventListener('click', applyConfiguration)
periodSpan.addEventListener('change', applyConfiguration)
periodUnit.addEventListener('change', applyConfiguration)
startTimeInput.addEventListener('change', applyConfiguration)
tradeIntervalInput.addEventListener('change', applyConfiguration)
utcOffsetInput.addEventListener('change', applyConfiguration)
mergeSecondInput.addEventListener('change', applyConfiguration)
mergeMinuteInput.addEventListener('change', applyConfiguration)
mergeHourInput.addEventListener('change', applyConfiguration)
sessionsInput.addEventListener('change', applyConfiguration)
tradingCalendarInput.addEventListener('change', applyConfiguration)

reset()
