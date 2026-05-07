/**
 * 2-레이어 공유 캐시
 *   L1: 인메모리 Map — 같은 인스턴스 내 즉시 응답
 *   L2: Neon DB    — 인스턴스 간 공유, 재시작 후에도 유지
 *
 * 사용법:
 *   const data = await getStockCache<T>("stock-detail:AAPL");
 *   if (!data) { ... fetch ... await setStockCache("stock-detail:AAPL", result, 15 * 60_000); }
 */

import { getDb } from "./db";

const L1 = new Map<string, { data: unknown; expiresAt: number }>();
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS stock_cache (
      cache_key  TEXT        PRIMARY KEY,
      data       JSONB       NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_stock_cache_expires ON stock_cache (expires_at)
  `;
  tableReady = true;
}

export async function getStockCache<T>(key: string): Promise<T | null> {
  // L1
  const hit = L1.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;

  // L2
  try {
    await ensureTable();
    const sql = getDb();
    const rows = await sql`
      SELECT data FROM stock_cache
      WHERE cache_key = ${key} AND expires_at > NOW()
    ` as { data: T }[];
    if (rows[0]) {
      L1.set(key, { data: rows[0].data, expiresAt: Date.now() + 2 * 60_000 }); // L1 2분 재사용
      return rows[0].data;
    }
  } catch { /* DB 장애 시 skip */ }
  return null;
}

export async function setStockCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  L1.set(key, { data, expiresAt: Date.now() + ttlMs });

  try {
    await ensureTable();
    const sql = getDb();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await sql`
      INSERT INTO stock_cache (cache_key, data, expires_at)
      VALUES (${key}, ${JSON.stringify(data)}, ${expiresAt})
      ON CONFLICT (cache_key) DO UPDATE SET
        data       = EXCLUDED.data,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `;
    // 만료 항목 정리 (1% 확률, 24시간 이상 지난 것)
    if (Math.random() < 0.01) {
      sql`DELETE FROM stock_cache WHERE expires_at < NOW() - INTERVAL '24 hours'`.catch(() => {});
    }
  } catch { /* DB 장애 시 L1만 사용 */ }
}
