import { Database } from 'bun:sqlite';
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
test('upgrading existing databases preserves positions and makes analysis retries idempotent', () => {
  const db = new Database(':memory:');
  try {
    const directory = join(import.meta.dir, '../src-tauri/migrations');
    const files = readdirSync(directory)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files.filter((f) => Number(f.slice(0, 3)) <= 4))
      db.exec(readFileSync(join(directory, file), 'utf8'));
    db.run(
      'INSERT INTO positions (symbol,shares,cost_price,opened_at,updated_at) VALUES (?,?,?,?,?)',
      ['AAPL', 10, 100, 1, 1],
    );
    for (const file of files.filter((f) => Number(f.slice(0, 3)) > 4))
      db.exec(readFileSync(join(directory, file), 'utf8'));
    expect(db.query('SELECT shares FROM positions WHERE symbol=?').get('AAPL')).toEqual({
      shares: 10,
    });
    const insert = db.query(
      'INSERT OR IGNORE INTO analysis_records (symbol,analyzed_at,type,result_json,analysis_key) VALUES (?,?,?,?,?)',
    );
    insert.run('AAPL', 1, 'deep', '{}', 'analysis-id');
    insert.run('AAPL', 1, 'deep', '{}', 'analysis-id');
    expect(db.query('SELECT COUNT(*) AS n FROM analysis_records').get()).toEqual({ n: 1 });
    const signal = db.query(
      'INSERT OR IGNORE INTO master_signals (master_id,symbol,signal,confidence,recorded_at,analysis_key) VALUES (?,?,?,?,?,?)',
    );
    signal.run('m', 'AAPL', 'bullish', 80, 1, 'analysis-id');
    signal.run('m', 'AAPL', 'bullish', 80, 1, 'analysis-id');
    expect(db.query('SELECT COUNT(*) AS n FROM master_signals').get()).toEqual({ n: 1 });
    db.run('INSERT INTO workspace_records (key,value,updated_at) VALUES (?,?,?)', [
      'research',
      '{}',
      1,
    ]);
    expect(db.query('SELECT value FROM workspace_records WHERE key=?').get('research')).toEqual({
      value: '{}',
    });
  } finally {
    db.close();
  }
});
