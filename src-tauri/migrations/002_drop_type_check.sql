-- SQLite 不支持 ALTER TABLE DROP CONSTRAINT，需要重建表去掉 CHECK
-- 新类型（如 screener）的校验由应用层 TypeScript AnalysisType 联合类型保证
CREATE TABLE analysis_records_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    analyzed_at INTEGER NOT NULL,
    type TEXT NOT NULL,
    result_json TEXT NOT NULL,
    stock_info_json TEXT,
    news_json TEXT
);

INSERT INTO analysis_records_new SELECT * FROM analysis_records;

DROP TABLE analysis_records;

ALTER TABLE analysis_records_new RENAME TO analysis_records;

CREATE INDEX IF NOT EXISTS idx_analysis_records_symbol_type_time
    ON analysis_records(symbol, type, analyzed_at DESC);
