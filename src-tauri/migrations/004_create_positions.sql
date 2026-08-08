-- 用户真实持仓。与 master_signals（虚拟大师组合）无关：那张表记的是 AI 的判断，
-- 这张表记的是用户自己的钱。
--
-- 一只标的一行，shares 与 cost_price 是**加权平均后**的结果，不记逐笔流水。
-- 加仓时由前端按加权平均并回写这一行——先把"我现在浮盈多少"做对，
-- 逐笔流水与已实现盈亏是另一个量级的需求，需要时再加 transactions 表。
--
-- shares 用 REAL 而非 INTEGER：港股碎股、美股零股都可能是小数。
CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT,
    shares REAL NOT NULL,
    cost_price REAL NOT NULL,
    opened_at INTEGER NOT NULL,
    note TEXT,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
