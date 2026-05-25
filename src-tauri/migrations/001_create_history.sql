CREATE TABLE IF NOT EXISTS analysis_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    analyzed_at INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ai', 'deep', 'quant', 'backtest')),
    result_json TEXT NOT NULL,
    stock_info_json TEXT,
    news_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_analysis_records_symbol_type_time
    ON analysis_records(symbol, type, analyzed_at DESC);
