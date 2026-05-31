import Database from "@tauri-apps/plugin-sql";
import { isTauri } from "@tauri-apps/api/core";
import type {
  AnalysisRecordSummary,
  AnalysisRecord,
  SaveAnalysisParams,
  HistoryQuery,
  MasterSignal,
  MasterSignalRecord,
} from "../../shared/types";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:history.db").catch((err) => {
      dbPromise = null;
      return Promise.reject(err);
    });
  }
  return dbPromise;
}

interface RawRow {
  id: number;
  symbol: string;
  analyzed_at: number;
  type: string;
  result_json: string;
  stock_info_json: string | null;
  news_json?: string | null;
}

function rowToSummary(r: RawRow): AnalysisRecordSummary {
  return {
    id: r.id,
    symbol: r.symbol,
    analyzedAt: r.analyzed_at,
    type: r.type as AnalysisRecordSummary["type"],
    resultJson: r.result_json,
    stockInfoJson: r.stock_info_json,
  };
}

export async function saveAnalysisRecord(params: SaveAnalysisParams): Promise<number> {
  if (!isTauri()) return Date.now();

  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO analysis_records (symbol, analyzed_at, type, result_json, stock_info_json, news_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.symbol,
      Date.now(),
      params.analysisType,
      params.resultJson,
      params.stockInfoJson ?? null,
      params.newsJson ?? null,
    ],
  );
  return result.lastInsertId ?? 0;
}

export async function getAnalysisHistory(query: HistoryQuery): Promise<AnalysisRecordSummary[]> {
  if (!isTauri()) return [];

  const db = await getDb();
  const conditions = ["symbol = $1"];
  const bindValues: unknown[] = [query.symbol];
  let idx = 2;

  if (query.analysisType) {
    conditions.push(`type = $${idx}`);
    bindValues.push(query.analysisType);
    idx++;
  }

  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;

  const sql = `SELECT id, symbol, analyzed_at, type, result_json, stock_info_json
    FROM analysis_records
    WHERE ${conditions.join(" AND ")}
    ORDER BY analyzed_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}`;
  bindValues.push(limit, offset);

  const rows = await db.select<RawRow[]>(sql, bindValues);
  return rows.map(rowToSummary);
}

export async function getAnalysisDetail(id: number): Promise<AnalysisRecord | null> {
  if (!isTauri()) return null;

  const db = await getDb();
  const rows = await db.select<RawRow[]>(
    `SELECT id, symbol, analyzed_at, type, result_json, stock_info_json, news_json
     FROM analysis_records WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return { ...rowToSummary(r), newsJson: r.news_json ?? null };
}

/**
 * 落账一次深度分析的各大师 signal（虚拟大师组合前向跟踪的数据基础）。
 * priceAt 可空——缺失时后续命中率/净值统计可用 recorded_at + symbol 回查历史 K 线补价。
 */
export async function saveMasterSignals(symbol: string, signals: MasterSignal[], priceAt?: number): Promise<void> {
  if (!isTauri() || signals.length === 0) return;

  const db = await getDb();
  const recordedAt = Date.now();
  for (const s of signals) {
    await db.execute(
      `INSERT INTO master_signals (master_id, symbol, signal, confidence, price_at, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [s.masterId, symbol, s.signal, s.confidence, priceAt ?? null, recordedAt],
    );
  }
}

interface RawSignalRow {
  id: number;
  master_id: string;
  symbol: string;
  signal: string;
  confidence: number;
  price_at: number | null;
  recorded_at: number;
}

/** 读取全部已落账的大师 signal，供虚拟组合命中率/净值聚合（前向跟踪 · 轨道 A）。 */
export async function getAllMasterSignals(): Promise<MasterSignalRecord[]> {
  if (!isTauri()) return [];

  const db = await getDb();
  const rows = await db.select<RawSignalRow[]>(
    `SELECT id, master_id, symbol, signal, confidence, price_at, recorded_at
     FROM master_signals ORDER BY recorded_at ASC`,
  );
  return rows.map(r => ({
    id: r.id,
    masterId: r.master_id,
    symbol: r.symbol,
    signal: r.signal as MasterSignalRecord["signal"],
    confidence: r.confidence,
    priceAt: r.price_at,
    recordedAt: r.recorded_at,
  }));
}

export async function deleteAnalysisRecords(ids: number[]): Promise<number> {
  if (!isTauri() || ids.length === 0) return 0;

  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const result = await db.execute(
    `DELETE FROM analysis_records WHERE id IN (${placeholders})`,
    ids,
  );
  return result.rowsAffected;
}
