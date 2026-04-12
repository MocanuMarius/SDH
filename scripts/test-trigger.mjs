import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');

// Load .env.local
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Get TSLA alert
const { data: alerts } = await supabase
  .from('watchlist_items')
  .select('*')
  .eq('ticker', 'TSLA')
  .single();

if (!alerts) {
  console.error('❌ TSLA alert not found');
  process.exit(1);
}

console.log('✅ Found TSLA alert:', alerts);

// Simulate a trigger
const currentPrice = 371.75;
const newAlertPrice = (currentPrice * 1.025).toFixed(2); // 2.5% re-arm
const newTriggerCount = alerts.trigger_count + 1;

// Update the alert
await supabase
  .from('watchlist_items')
  .update({
    alert_price: parseFloat(newAlertPrice),
    trigger_count: newTriggerCount,
    last_triggered_at: new Date().toISOString(),
  })
  .eq('id', alerts.id);

// Create history record
await supabase
  .from('watchlist_alert_history')
  .insert({
    watchlist_item_id: alerts.id,
    ticker: 'TSLA',
    price_when_triggered: currentPrice,
    alert_price: alerts.alert_price,
    condition: alerts.condition,
  });

// Create audit log
await supabase
  .from('watchlist_audit_log')
  .insert({
    watchlist_item_id: alerts.id,
    event_type: 'triggered',
    details: {
      price_when_triggered: currentPrice,
      alert_price: alerts.alert_price,
      condition: alerts.condition,
      trigger_count: newTriggerCount,
      next_alert_price: parseFloat(newAlertPrice),
      market_state: 'REGULAR',
    },
  });

// Create re-arm log
await supabase
  .from('watchlist_audit_log')
  .insert({
    watchlist_item_id: alerts.id,
    event_type: 'rearmed',
    details: {
      from_price: alerts.alert_price,
      to_price: parseFloat(newAlertPrice),
      condition: alerts.condition,
      trigger_count: newTriggerCount,
    },
  });

console.log('✅ TSLA alert triggered!');
console.log(`   Price: $${currentPrice}`);
console.log(`   Trigger: ${newTriggerCount}/10`);
console.log(`   Next alert at: $${newAlertPrice}`);
