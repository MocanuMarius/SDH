#!/usr/bin/env node
/**
 * Watchlist Price Monitor
 * Runs every 60 seconds, checks prices, sends Telegram alerts with news context.
 * Auto-loads .env.local — no separate env sourcing needed.
 */

import { createClient } from '@supabase/supabase-js';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Load .env.local automatically ────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// Service-role key is REQUIRED now that watchlist_items has user-scoped RLS
// (migration 20260420130000). Anon requests have auth.uid() = null and see
// zero rows — the monitor would silently never fire any alerts. The old
// anon-only config pre-dates RLS tightening.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('   Watchlist tables are user-scoped (RLS) so the monitor needs the service-role key to see all users\' rows.');
  process.exit(1);
}
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'); process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const priceCache = new Map();
const CACHE_TTL = 30_000;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Deecide/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// ── Time-based NYSE market hours check (fallback when Yahoo returns UNKNOWN) ──
// NYSE: Mon–Fri 9:30 AM – 4:00 PM Eastern (ET = UTC-5 / EDT = UTC-4)
function isNyseMarketOpen() {
  const now = new Date();
  const dayUTC = now.getUTCDay(); // 0=Sun, 6=Sat
  if (dayUTC === 0 || dayUTC === 6) return false;

  // Determine ET offset: EDT (UTC-4) Mar 2nd Sun → Nov 1st Sun; else EST (UTC-5)
  const year = now.getUTCFullYear();
  // DST start: 2nd Sunday of March
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((7 - marchFirst.getUTCDay() + 0) % 7) + 7));
  // DST end: 1st Sunday of November
  const novFirst = new Date(Date.UTC(year, 10, 1));
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - novFirst.getUTCDay()) % 7)));
  const isDST = now >= dstStart && now < dstEnd;
  const etOffset = isDST ? -4 : -5;

  const etHour = now.getUTCHours() + etOffset;
  const etMinute = now.getUTCMinutes();
  const etTotalMinutes = ((etHour % 24) + 24) % 24 * 60 + etMinute;
  const openMinutes = 9 * 60 + 30;   // 9:30 AM
  const closeMinutes = 16 * 60;      // 4:00 PM

  return etTotalMinutes >= openMinutes && etTotalMinutes < closeMinutes;
}

// ── Price fetch (v8/chart — v7/quote is auth-gated) ───────────────────────────
// Returns { price, marketState } or null. marketState: REGULAR | PRE | POST | CLOSED etc.
async function getQuote(ticker) {
  const now = Date.now();
  const cached = priceCache.get(ticker);
  if (cached && now - cached.time < CACHE_TTL) return cached;

  const json = await httpsGet(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`
  );
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  if (!price) return null;

  let marketState = meta?.marketState || 'UNKNOWN';
  // Yahoo sometimes returns UNKNOWN even during live hours — use time-based fallback
  if (marketState === 'UNKNOWN') {
    marketState = isNyseMarketOpen() ? 'REGULAR' : 'CLOSED';
    console.log(`   ⚠️  Yahoo returned UNKNOWN for ${ticker} — time-based fallback: ${marketState}`);
  }

  const result = { price, marketState };
  priceCache.set(ticker, { ...result, time: now });
  return result;
}

// ── Re-arm price: move the goalpost in the direction of the condition ──────────
// > / >= : price went up  → next target is 10% above trigger price
// < / <= : price went down → next target is 10% below trigger price
function calcRearmPrice(price, condition) {
  if (condition === '>' || condition === '>=') return (price * 1.025).toFixed(2);
  if (condition === '<' || condition === '<=') return (price * 0.975).toFixed(2);
  return (price * 1.025).toFixed(2); // fallback for == / !=
}

// ── News context ──────────────────────────────────────────────────────────────
function formatAge(unixSec) {
  const h = Math.floor((Date.now() / 1000 - unixSec) / 3600);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function getNewsContext(ticker) {
  try {
    const json = await httpsGet(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=6&enableFuzzyQuery=false`
    );
    const articles = json?.news || [];
    if (!articles.length) return '';

    const cutoff = Date.now() / 1000 - 48 * 3600;
    const recent = articles.filter(a => a.providerPublishTime > cutoff);
    const toShow = (recent.length ? recent : articles).slice(0, 4);

    return '\n\n📰 <b>Recent News</b>\n' +
      toShow.map(a => `• ${a.title} <i>(${a.publisher}, ${formatAge(a.providerPublishTime)})</i>`).join('\n');
  } catch {
    return '';
  }
}

// ── Condition eval ────────────────────────────────────────────────────────────
function evaluateCondition(price, condition, alertPrice) {
  switch (condition) {
    case '<':  return price < alertPrice;
    case '>':  return price > alertPrice;
    case '<=': return price <= alertPrice;
    case '>=': return price >= alertPrice;
    case '==': return Math.abs(price - alertPrice) < 0.01;
    case '!=': return Math.abs(price - alertPrice) >= 0.01;
    default:   return false;
  }
}

// ── Telegram send ─────────────────────────────────────────────────────────────
function sendTelegramAlert(message) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', (e) => { console.error('❌ Telegram error:', e.message); resolve(); });
    req.end(postData);
  });
}

// ── Main check loop ───────────────────────────────────────────────────────────
async function checkAlerts() {
  try {
    // Retry DB fetch up to 3× in case of transient network errors on startup
    let alerts, dbError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase
        .from('watchlist_items').select('*').eq('status', 'active');
      if (!error) { alerts = data; break; }
      dbError = error;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
    }

    if (dbError && !alerts) { console.error('❌ DB error:', dbError.message); return; }
    if (!alerts?.length) return;

    console.log(`⏰ [${new Date().toISOString()}] Checking ${alerts.length} alert(s)...`);

    const byTicker = {};
    for (const a of alerts) {
      (byTicker[a.ticker] ||= []).push(a);
    }

    for (const [ticker, tickerAlerts] of Object.entries(byTicker)) {
      const quote = await getQuote(ticker);
      if (!quote) { console.log(`⚠️  ${ticker}: price unavailable`); continue; }

      const { price, marketState } = quote;

      // Only trigger during live market hours — skip when market is closed/unknown
      if (marketState !== 'REGULAR' && marketState !== 'PRE' && marketState !== 'POST') {
        console.log(`⏸️  ${ticker}: $${price.toFixed(2)} (market ${marketState} — skipping)`);
        continue;
      }

      console.log(`📊 ${ticker}: $${price.toFixed(2)} [${marketState}]`);

      for (const alert of tickerAlerts) {
        if (!evaluateCondition(price, alert.condition, alert.alert_price)) continue;

        const newAlertPrice = calcRearmPrice(price, alert.condition);
        const newTriggerCount = alert.trigger_count + 1;
        const newStatus = newTriggerCount >= 10 ? 'disabled' : 'active';

        await supabase.from('watchlist_items').update({
          alert_price: parseFloat(newAlertPrice),
          trigger_count: newTriggerCount,
          status: newStatus,
          last_triggered_at: new Date().toISOString(),
        }).eq('id', alert.id);

        await supabase.from('watchlist_alert_history').insert({
          watchlist_item_id: alert.id,
          ticker: alert.ticker,
          price_when_triggered: price,
          alert_price: alert.alert_price,
          condition: alert.condition,
        });

        // Audit log
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
        });

        if (newStatus === 'active') {
          await supabase.from('watchlist_audit_log').insert({
            watchlist_item_id: alert.id,
            event_type: 'rearmed',
            details: {
              from_price: alert.alert_price,
              to_price: parseFloat(newAlertPrice),
              condition: alert.condition,
              trigger_count: newTriggerCount,
            },
          });
        }

        const newsContext = await getNewsContext(ticker);
        const pct = (((price - alert.alert_price) / alert.alert_price) * 100).toFixed(1);
        const dir = price > alert.alert_price ? '📈' : '📉';

        const message =
          `🔔 <b>Watchlist Alert!</b> ${dir}\n\n` +
          `<b>${ticker}</b>  ${alert.condition}  $${Number(alert.alert_price).toFixed(2)}\n` +
          `Price: <b>$${price.toFixed(2)}</b>  (${pct > 0 ? '+' : ''}${pct}%)\n\n` +
          `Trigger ${newTriggerCount}/10  ·  Next at $${newAlertPrice}\n` +
          `${newStatus === 'disabled' ? '❌ Auto-disabled (10/10)' : '✅ Re-armed'}` +
          newsContext;

        await sendTelegramAlert(message);
        console.log(`✅ ${ticker}: TRIGGERED (${newTriggerCount}/10) → next at $${newAlertPrice}`);
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
console.log('🚀 Watchlist Monitor started');
console.log(`📍 ${SUPABASE_URL}`);
console.log('⏱️  Checking every 60 seconds...\n');

await checkAlerts();
setInterval(checkAlerts, 60_000);

process.on('SIGINT', () => { console.log('\n👋 Stopped.'); process.exit(0); });
