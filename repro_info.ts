
import { parseSymbol } from './sidecar/parsers/exchange';
import { fetchStockInfo } from './sidecar/stock-info';

async function test(symbol: string) {
  console.log(`Testing symbol: ${symbol}`);
  const parsed = parseSymbol(symbol);
  console.log('Parsed:', JSON.stringify(parsed, null, 2));
  const info = await fetchStockInfo(parsed);
  console.log('Info:', JSON.stringify(info, null, 2));
  console.log('-------------------');
}

async function run() {
  await test('601012'); // Longi (A-share)
  await test('AAPL');   // Apple (US)
  await test('NVDA');   // Nvidia (US)
  await test('688693'); // Kaiwei (A-share)
}

run().catch(console.error);
