#!/usr/bin/env node

/**
 * Script to parse sample IBKR Flex XML data from goat-fin and import into StockDecisionHelper
 *
 * Usage: node scripts/import-broker-sample.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import our broker data service
// Note: In production, this would be compiled TypeScript
// For now, we'll create a simple parsing wrapper

async function importBrokerSampleData() {
  console.log('🔍 Parsing sample IBKR Flex XML data from goat-fin...\n');

  // Read the sample file
  const sampleFilePath = path.join(
    __dirname,
    '../../goat-fin/sampleData/sample-flex-query.xml'
  );

  if (!fs.existsSync(sampleFilePath)) {
    console.error('❌ Sample file not found:', sampleFilePath);
    process.exit(1);
  }

  const xmlBuffer = fs.readFileSync(sampleFilePath);
  const xmlString = xmlBuffer.toString('utf-8');

  console.log(`📄 Loaded sample file: ${path.basename(sampleFilePath)}`);
  console.log(`   Size: ${(xmlBuffer.length / 1024).toFixed(2)} KB\n`);

  try {
    // Parse the XML using goat-fin's calculator
    const { calculateTaxesFromXmlStrings } = await import(
      '../../goat-fin/common/services/taxCalculator.js'
    );

    console.log('⚙️  Parsing with goat-fin tax calculator...\n');
    const results = await calculateTaxesFromXmlStrings([xmlString]);

    // Display results summary
    console.log('✅ Parse Results:');
    console.log(`   Country Results: ${results.countryResults?.length || 0} countries`);
    console.log(`   Symbol Results: ${results.symbolResults?.length || 0} symbols\n`);

    if (results.symbolResults && results.symbolResults.length > 0) {
      console.log('📊 Top 10 Symbols by Trade Count:');
      const sorted = results.symbolResults.sort((a, b) => b.trades.length - a.trades.length);
      sorted.slice(0, 10).forEach((sym, idx) => {
        const pnl = sym.nTotalPL_RON || 0;
        const color = pnl >= 0 ? '✅' : '❌';
        console.log(`   ${idx + 1}. ${sym.symbol}: ${sym.trades.length} trades, P&L: ${pnl.toFixed(2)} RON ${color}`);
      });
    }

    console.log('\n📈 P&L Analysis:');
    let totalPnl = 0;
    let totalTrades = 0;

    if (results.symbolResults) {
      for (const sym of results.symbolResults) {
        totalPnl += sym.nTotalPL_RON || 0;
        totalTrades += sym.trades.length;
      }
    }

    console.log(`   Total Trades: ${totalTrades}`);
    console.log(`   Total P&L (RON): ${totalPnl.toFixed(2)}`);
    console.log(`   Average P&L per Trade: ${(totalPnl / totalTrades).toFixed(2)} RON\n`);

    // Show country breakdown
    if (results.countryResults && results.countryResults.length > 0) {
      console.log('🌍 Country Breakdown:');
      for (const country of results.countryResults) {
        const pnl = country.nTotalPL_RON || 0;
        const color = pnl >= 0 ? '✅' : '❌';
        console.log(`   ${country.country}: ${country.trades.length} trades, P&L: ${pnl.toFixed(2)} RON ${color}`);
      }
    }

    console.log('\n🎯 Next Steps:');
    console.log('   1. Run Supabase migrations: npm run migrate');
    console.log('   2. Implement importTradesFromStatement() in brokerDataService.ts');
    console.log('   3. Import parsed data into StockDecisionHelper database');
    console.log('   4. View analytics dashboard with imported trades\n');

    // Save parsed results to JSON for inspection
    const outputPath = path.join(__dirname, '../data/parsed-sample-trades.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          metadata: {
            sourceFile: path.basename(sampleFilePath),
            parsedAt: new Date().toISOString(),
            totalTrades,
            totalCountries: results.countryResults?.length || 0,
            totalSymbols: results.symbolResults?.length || 0,
            totalPnl,
          },
          symbolResults: results.symbolResults,
          countryResults: results.countryResults,
        },
        null,
        2
      )
    );

    console.log(`💾 Parsed data saved to: ${outputPath}`);
    console.log('✨ Sample data parsing complete!\n');
  } catch (error) {
    console.error('❌ Error parsing sample data:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the import
importBrokerSampleData().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
