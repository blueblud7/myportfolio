import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (!sql) {
    sql = neon(process.env.DATABASE_URL!);
  }
  return sql;
}

export default getDb;
