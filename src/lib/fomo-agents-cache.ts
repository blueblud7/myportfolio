import { getDb } from "./db";
import type { AgentsResult } from "@/types/fomo";

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS fomo_agents_cache (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT only_one_row CHECK (id = 1)
    )
  `;
}

export async function readFomoCache(): Promise<{ data: AgentsResult; generated_at: string } | null> {
  const sql = getDb();
  await ensureTable(sql);
  const rows = await sql`SELECT data, generated_at FROM fomo_agents_cache WHERE id = 1` as { data: AgentsResult; generated_at: string }[];
  if (rows.length === 0) return null;
  return { data: rows[0].data, generated_at: rows[0].generated_at };
}

export async function writeFomoCache(data: AgentsResult): Promise<void> {
  const sql = getDb();
  await ensureTable(sql);
  await sql`
    INSERT INTO fomo_agents_cache (id, data, generated_at)
    VALUES (1, ${JSON.stringify(data)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      generated_at = EXCLUDED.generated_at
  `;
}
