-- 唯一分析 ID 保证写入重试与缓存结果不会重复落账。
ALTER TABLE analysis_records ADD COLUMN analysis_key TEXT;
ALTER TABLE analysis_records ADD COLUMN metadata_json TEXT;
CREATE UNIQUE INDEX idx_analysis_key ON analysis_records(analysis_key);
ALTER TABLE master_signals ADD COLUMN analysis_key TEXT;
ALTER TABLE master_signals ADD COLUMN model_fingerprint TEXT;
CREATE UNIQUE INDEX idx_master_analysis_key ON master_signals(analysis_key, master_id);
