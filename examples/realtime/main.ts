import type { KLineData, Period } from '../../src'
import { DataAggregator } from '../../src'

const periodSpan = element<HTMLInputElement>('period-span')
const periodUnit = element<HTMLSelectElement>('period-unit')
const speedSelect = element<HTMLSelectElement>('speed-select')
const toggleButton = element<HTMLButtonElement>('toggle-button')
const stepButton = element<HTMLButtonElement>('step-button')
const resetButton = element<HTMLButtonElement>('reset-button')
const statusText = element<HTMLElement>('status-text')
const liveIndicator = document.querySelector<HTMLElement>('.live-indicator')!
const tableBody = element<HTMLTableSectionElement>('candle-table')
const tradeJson = element<HTMLElement>('trade-json')

const maximumHistorySize = 10
let aggregator = createAggregator()
let closedCandles: KLineData[] = []
let currentCandle: KLineData | undefined
let price = 102.5
let virtualTime = Math.floor((Date.now() - 45_000) / 1_000) * 1_000
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

function createAggregator(): DataAggregator {
  const value = new DataAggregator({ utcOffsetMinutes: 8 * 60 })
  value.setPeriod(selectedPeriod())
  return value
}

function pushTrade(): void {
  virtualTime += 1_000
  const movement = (Math.random() - 0.48) * 0.8
  price = Math.max(1, price + movement)
  const trade = {
    timestamp: virtualTime,
    price: Number(price.toFixed(2)),
    volume: Math.round(1 + Math.random() * 18)
  }
  const result = aggregator.add(trade)
  currentCandle = result.current
  if (result.closed) {
    closedCandles.push(result.closed)
    closedCandles = closedCandles.slice(-maximumHistorySize)
  }
  tradeJson.textContent = JSON.stringify(trade, null, 2)
  render()
}

function reset(): void {
  stopTimer()
  closedCandles = []
  currentCandle = undefined
  price = 102.5
  virtualTime = Math.floor((Date.now() - 45_000) / 1_000) * 1_000
  aggregator = createAggregator()
  for (let index = 0; index < 45; index += 1) {
    pushTrade()
  }
  if (running) {
    startTimer()
  }
}

function startTimer(): void {
  stopTimer()
  timer = setInterval(pushTrade, Number(speedSelect.value))
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
      const values = [new Date(candle.timestamp).toLocaleTimeString('zh-CN', { hour12: false }), current ? 'CURRENT' : 'CLOSED', formatPrice(candle.open), formatPrice(candle.high), formatPrice(candle.low), formatPrice(candle.close), candle.volume.toFixed(0)]
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

function applyPeriod(): void {
  const span = Number(periodSpan.value)
  if (!Number.isInteger(span) || span <= 0) {
    periodSpan.setCustomValidity('请输入大于 0 的整数')
    periodSpan.reportValidity()
    return
  }
  periodSpan.setCustomValidity('')
  reset()
}

toggleButton.addEventListener('click', () => setRunning(!running))
stepButton.addEventListener('click', () => {
  setRunning(false)
  pushTrade()
})
resetButton.addEventListener('click', applyPeriod)
periodSpan.addEventListener('change', applyPeriod)
periodUnit.addEventListener('change', applyPeriod)
speedSelect.addEventListener('change', () => {
  if (running) {
    startTimer()
  }
})

reset()
