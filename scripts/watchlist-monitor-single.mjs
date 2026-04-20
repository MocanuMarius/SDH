/**
 * Single-pass watchlist check for GitHub Actions / cron environments.
 *
 * Same logic as watchlist-monitor.js but:
 *   - Runs ONE check pass and exits (no setInterval)
 *   - Exported as a default async function so the GH Actions runner can import it
 *   - Loads env from process.env directly (GH Actions injects secrets as env vars)
 *   - Falls back to .env.local for local testing
 */

import { createClient } from '@supabase/supabase-js'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Load .env.local if running locally ──────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
// Service-role key required — see scripts/watchlist-monitor.js for why.
// GitHub Actions deployments must expose SUPABASE_SERVICE_ROLE_KEY as a
// secret, not the anon key.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

function httpsGet(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Deecide/1.0' } }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
    }).on('error', () => resolve(null))
  })
}

function isNyseMarketOpen() {
  const now = new Date()
  const dayUTC = now.getUTCDay()
  if (dayUTC === 0 || dayUTC === 6) return false
  const year = now.getUTCFullYear()
  const marchFirst = new Date(Date.UTC(year, 2, 1))
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((7 - marchFirst.getUTCDay() + 0) % 7) + 7))
  const novFirst = new Date(Date.UTC(year, 10, 1))
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - novFirst.getUTCDay()) % 7)))
  const isDST = now >= dstStart && now < dstEnd
  const etOffset = isDST ? -4 : -5
  const etHour = now.getUTCHours() + etOffset
  const etMinute = now.getUTCMinutes()
  const etTotalMinutes = ((etHour % 24) + 24) % 24 * 60 + etMinute
  return etTotalMinutes >= 570 && etTotalMinutes < 960 // 9:30 AM - 4:00 PM ET
}

async function getQuote(ticker) {
  const json = await httpsGet(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`
  )
  const meta = json?.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice ?? meta?.previousClose
  if (!price) return null
  let marketState = meta?.marketState || 'UNKNOWN'
  if (marketState === 'UNKNOWN') marketState = isNyseMarketOpen() ? 'REGULAR' : 'CLOSED'
  return { price, marketState }
}

function evaluateCondition(price, condition, alertPrice) {
  switch (condition) {
    case '<':  return price < alertPrice
    case '>':  return price > alertPrice
    case '<=': return price <= alertPrice
    case '>=': return price >= alertPrice
    case '==': return Math.abs(price - alertPrice) < 0.01
    case '!=': return Math.abs(price - alertPrice) >= 0.01
    default:   return false
  }
}

function calcRearmPrice(price, condition) {
  if (condition === '>' || condition === '>=') return (price * 1.025).toFixed(2)
  if (condition === '<' || condition === '<=') return (price * 0.975).toFixed(2)
  return (price * 1.025).toFixed(2)
}

function formatAge(unixSec) {
  const h = Math.floor((Date.now() / 1000 - unixSec) / 3600)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

async function getNewsContext(ticker) {
  try {
    const json = await httpsGet(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=6&enableFuzzyQuery=false`
    )
    const articles = json?.news || []
    if (!articles.length) return ''
    const cutoff = Date.now() / 1000 - 48 * 3600
    const recent = articles.filter(a => a.providerPublishTime > cutoff)
    const toShow = (recent.length ? recent : articles).slice(0, 4)
    return '\n\n<b>Recent News</b>\n' +
      toShow.map(a => `- ${a.title} <i>(${a.publisher}, ${formatAge(a.providerPublishTime)})</i>`).join('\n')
  } catch { return '' }
}

function sendTelegramAlert(message) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => { res.on('data', () => {}); res.on('end', resolve) })
    req.on('error', (e) => { console.error('Telegram error:', e.message); resolve() })
    req.end(postData)
  })
}

/**
 * Single-pass check. Returns the number of alerts triggered.
 */
export default async function checkAlerts() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — watchlist RLS is user-scoped so anon key cannot read rows.')
    return 0
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID')
    return 0
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: alerts, error: dbError } = await supabase
    .from('watchlist_items').select('*').eq('status', 'active')

  if (dbError) { console.error('DB error:', dbError.message); return 0 }
  if (!alerts?.length) { console.log('No active alerts.'); return 0 }

  console.log(`Checking ${alerts.length} alert(s) at ${new Date().toISOString()}`)
  let triggered = 0

  const byTicker = {}
  for (const a of alerts) (byTicker[a.ticker] ||= []).push(a)

  for (const [ticker, tickerAlerts] of Object.entries(byTicker)) {
    const quote = await getQuote(ticker)
    if (!quote) { console.log(`  ${ticker}: price unavailable`); continue }

    const { price, marketState } = quote
    // No market-hours gate — alerts fire anytime using the last known price.
    // Yahoo returns previousClose when the market is closed, which is fine
    // for threshold alerts.
    console.log(`  ${ticker}: $${price.toFixed(2)} [${marketState}]`)

    for (const alert of tickerAlerts) {
      if (!evaluateCondition(price, alert.condition, alert.alert_price)) continue

      const newAlertPrice = calcRearmPrice(price, alert.condition)
      const newTriggerCount = alert.trigger_count + 1
      const newStatus = newTriggerCount >= 10 ? 'disabled' : 'active'

      await supabase.from('watchlist_items').update({
        alert_price: parseFloat(newAlertPrice),
        trigger_count: newTriggerCount,
        status: newStatus,
        last_triggered_at: new Date().toISOString(),
      }).eq('id', alert.id)

      await supabase.from('watchlist_alert_history').insert({
        watchlist_item_id: alert.id,
        ticker: alert.ticker,
        price_when_triggered: price,
        alert_price: alert.alert_price,
        condition: alert.condition,
      })

      await supabase.from('watchlist_audit_log').insert({
        watchlist_item_id: alert.id,
        event_type: newStatus === 'disabled' ? 'disabled' : 'triggered',
        details: {
          price_when_triggered: price,
          alert_price: alert.alert_price,
          condition: alert.condition,
          trigger_count: newTriggerCount,
          next_alert_price: parseFloat(newAlertPrice),
          market_state: marketState,
          reason: newStatus === 'disabled' ? 'auto_disabled_10_triggers' : undefined,
        },
      })

      if (newStatus === 'active') {
        await supabase.from('watchlist_audit_log').insert({
          watchlist_item_id: alert.id,
          event_type: 'rearmed',
          details: { from_price: alert.alert_price, to_price: parseFloat(newAlertPrice), condition: alert.condition, trigger_count: newTriggerCount },
        })
      }

      const newsContext = await getNewsContext(ticker)
      const pct = (((price - alert.alert_price) / alert.alert_price) * 100).toFixed(1)
      const dir = price > alert.alert_price ? '📈' : '📉'
      const message =
        `🔔 <b>Watchlist Alert!</b> ${dir}\n\n` +
        `<b>${ticker}</b>  ${alert.condition}  $${Number(alert.alert_price).toFixed(2)}\n` +
        `Price: <b>$${price.toFixed(2)}</b>  (${pct > 0 ? '+' : ''}${pct}%)\n\n` +
        `Trigger ${newTriggerCount}/10  ·  Next at $${newAlertPrice}\n` +
        `${newStatus === 'disabled' ? '❌ Auto-disabled (10/10)' : '✅ Re-armed'}` +
        newsContext

      await sendTelegramAlert(message)
      console.log(`  ✅ ${ticker}: TRIGGERED (${newTriggerCount}/10) -> next at $${newAlertPrice}`)
      triggered += 1
    }
  }

  console.log(`Done. ${triggered} alert(s) triggered.`)
  return triggered
}
