-- 虚拟大师组合（前向跟踪）：每次深度分析落账各大师的 signal + 当时价，
-- 供后续命中率/净值统计。LLM 判断不可重现，故只能从落账之日起前向积累。
CREATE TABLE IF NOT EXISTS master_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    master_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    signal TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    price_at REAL,
    recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_master_signals_master ON master_signals(master_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_signals_symbol ON master_signals(symbol, recorded_at DESC);
