-- 研究资料独立于配置，绝不保存 API Key。
CREATE TABLE IF NOT EXISTS workspace_records (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
