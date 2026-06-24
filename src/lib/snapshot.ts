import { getDb } from "./db";
import { getLatestExchangeRate } from "./exchange-rate";
import { todayKST } from "./tz";
import { encryptNum, decryptNum } from "./crypto";
import { decryptHoldingFields } from "./holdings-crypto";
import { getQuotes } from "./yahoo-finance";

async function initSnapshotColumn(sql: ReturnType<typeof getDb>) {
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    UPDATE snapshots SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users) = 1
  `;
  // 암호화 컬럼 + NOT NULL 해제
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS total_krw_enc TEXT`;
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS total_usd_enc TEXT`;
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS stock_krw_enc TEXT`;
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS bank_krw_enc TEXT`;
  await sql`ALTER TABLE snapshots ALTER COLUMN total_krw DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE snapshots ALTER COLUMN total_usd DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE snapshots ALTER COLUMN stock_krw DROP NOT NULL`.catch(() => {});
  await sql`ALTER TABLE snapshots ALTER COLUMN bank_krw DROP NOT NULL`.catch(() => {});

  await sql`ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS value_krw_enc TEXT`;
  await sql`ALTER TABLE account_snapshots ALTER COLUMN value_krw DROP NOT NULL`.catch(() => {});

  // 일회성 마이그레이션
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`;
  const [done] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_snapshots_v1'` as { name: string }[];
  if (!done) {
    const sRows = (await sql`SELECT id, total_krw, total_usd, stock_krw, bank_krw FROM snapshots WHERE total_krw_enc IS NULL`) as { id: number; total_krw: number | null; total_usd: number | null; stock_krw: number | null; bank_krw: number | null }[];
    for (const r of sRows) {
      await sql`UPDATE snapshots SET
        total_krw_enc=${encryptNum(r.total_krw)},
        total_usd_enc=${encryptNum(r.total_usd)},
        stock_krw_enc=${encryptNum(r.stock_krw)},
        bank_krw_enc=${encryptNum(r.bank_krw)}
        WHERE id=${r.id}`;
    }
    const aRows = (await sql`SELECT id, value_krw FROM account_snapshots WHERE value_krw_enc IS NULL`) as { id: number; value_krw: number | null }[];
    for (const r of aRows) {
      await sql`UPDATE account_snapshots SET value_krw_enc=${encryptNum(r.value_krw)} WHERE id=${r.id}`;
    }
    await sql`INSERT INTO _migrations (name) VALUES ('encrypt_snapshots_v1')`;
  }
}

export async function createDailySnapshot(userId: number): Promise<boolean> {
  const sql = getDb();
  const today = todayKST();
  await initSnapshotColumn(sql);

  const existing = await sql`SELECT id FROM snapshots WHERE date = ${today} AND user_id = ${userId}`;
  if (existing.length > 0) return false;

  const exchangeRate = await getLatestExchangeRate();

  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`.catch(() => {});
  const holdingsRaw = await sql`
    SELECT h.ticker, h.currency,
           h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
           h.manual_price, h.manual_price_enc,
           COALESCE(p.price, 0) as price_market
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE a.type = 'stock' AND a.user_id = ${userId}
  ` as { ticker: string; currency: string;
         quantity: number | null; quantity_enc: string | null;
         avg_cost: number | null; avg_cost_enc: string | null;
         manual_price: number | null; manual_price_enc: string | null;
         price_market: number }[];

  let stockKrw = 0;
  for (const h of holdingsRaw) {
    const d = decryptHoldingFields(h);
    const qty = d.quantity ?? 0;
    const cost = d.avg_cost ?? 0;
    const manual = d.manual_price;
    const price =
      h.ticker === "CASH" ? cost :
      manual !== null && manual !== undefined && manual > 0 ? manual :
      (h.price_market || cost);
    const value = qty * price;
    stockKrw += h.currency === "USD" ? value * exchangeRate : value;
  }

  await sql`ALTER TABLE bank_balances ADD COLUMN IF NOT EXISTS balance_enc TEXT`.catch(() => {});
  const bankAccounts = await sql`
    SELECT bb.balance, bb.balance_enc, a.currency
    FROM bank_balances bb
    JOIN accounts a ON bb.account_id = a.id
    WHERE a.type = 'bank' AND a.user_id = ${userId}
      AND bb.date = (SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id)
    GROUP BY bb.account_id, bb.balance, bb.balance_enc, a.currency
  ` as { balance: number | null; balance_enc: string | null; currency: string }[];

  let bankKrw = 0;
  for (const b of bankAccounts) {
    const bal = b.balance_enc !== null ? (decryptNum(b.balance_enc) ?? 0) : (b.balance ?? 0);
    bankKrw += b.currency === "USD" ? bal * exchangeRate : bal;
  }

  const totalKrw = stockKrw + bankKrw;
  const totalUsd = totalKrw / exchangeRate;

  await sql`
    INSERT INTO snapshots (total_krw_enc, total_usd_enc, stock_krw_enc, bank_krw_enc, exchange_rate, date, user_id)
    VALUES (
      ${encryptNum(totalKrw)}, ${encryptNum(totalUsd)},
      ${encryptNum(stockKrw)}, ${encryptNum(bankKrw)},
      ${exchangeRate}, ${today}, ${userId}
    )
    ON CONFLICT DO NOTHING
  `;

  return true;
}

export async function createAccountSnapshots(userId: number): Promise<void> {
  const sql = getDb();
  const today = todayKST();
  const exchangeRate = await getLatestExchangeRate();

  const accounts = await sql`SELECT id, type, currency FROM accounts WHERE user_id = ${userId}` as {
    id: number;
    type: string;
    currency: string;
  }[];

  for (const acct of accounts) {
    let valueKrw = 0;

    if (acct.type === "stock") {
      const holdingsRaw = await sql`
        SELECT h.ticker, h.currency,
               h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
               h.manual_price, h.manual_price_enc,
               COALESCE(p.price, 0) as price_market
        FROM holdings h
        LEFT JOIN price_history p ON h.ticker = p.ticker
          AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
        WHERE h.account_id = ${acct.id}
      ` as { ticker: string; currency: string;
             quantity: number | null; quantity_enc: string | null;
             avg_cost: number | null; avg_cost_enc: string | null;
             manual_price: number | null; manual_price_enc: string | null;
             price_market: number }[];

      for (const h of holdingsRaw) {
        const d = decryptHoldingFields(h);
        const qty = d.quantity ?? 0;
        const cost = d.avg_cost ?? 0;
        const manual = d.manual_price;
        const price =
          h.ticker === "CASH" ? cost :
          manual !== null && manual !== undefined && manual > 0 ? manual :
          (h.price_market || cost);
        const val = qty * price;
        valueKrw += h.currency === "USD" ? val * exchangeRate : val;
      }
    } else {
      const [latest] = await sql`
        SELECT balance, balance_enc FROM bank_balances
        WHERE account_id = ${acct.id}
        ORDER BY date DESC LIMIT 1
      ` as { balance: number | null; balance_enc: string | null }[];
      if (latest) {
        const bal = latest.balance_enc !== null ? (decryptNum(latest.balance_enc) ?? 0) : (latest.balance ?? 0);
        valueKrw = acct.currency === "USD" ? bal * exchangeRate : bal;
      }
    }

    await sql`
      INSERT INTO account_snapshots (account_id, value_krw_enc, date)
      VALUES (${acct.id}, ${encryptNum(valueKrw)}, ${today})
      ON CONFLICT (account_id, date) DO UPDATE SET value_krw_enc = EXCLUDED.value_krw_enc
    `;
  }
}

export interface AccountDailyValue {
  current: number; // 현재 평가액 (KRW)
  prev: number;    // 전일 종가 기준 평가액 (KRW)
}

/**
 * 계좌별 "현재"·"전일 종가" 평가액(KRW)을 실시간 시세로 계산.
 *   - 주식: 실시간 시세(getQuotes)의 등락률로 전일 종가를 역산 → 스냅샷 불필요.
 *           manual_price는 전일=현재(변동 0), 실패 시 price_history fallback(변동 0).
 *   - 은행: 최신 잔액 (전일=현재, 일간 변동 없음).
 * "오늘 변화량" = current − prev. 종목별 실제 전일 종가 기준이라 장중 실시간 갱신 + KST 정확.
 */
export async function getAccountDailyValues(userId: number): Promise<Map<number, AccountDailyValue>> {
  const sql = getDb();
  const exchangeRate = await getLatestExchangeRate();
  // 전일 환율: 오늘(KST) 이전 가장 최근 기록. 없으면 오늘 환율(=FX 변동 0).
  const [prevRateRow] = await sql`
    SELECT rate FROM exchange_rates WHERE date < ${todayKST()} ORDER BY date DESC LIMIT 1
  ` as { rate: number }[];
  const prevRate = prevRateRow?.rate ?? exchangeRate;
  const values = new Map<number, AccountDailyValue>();
  const add = (id: number, current: number, prev: number) => {
    const v = values.get(id) ?? { current: 0, prev: 0 };
    v.current += current;
    v.prev += prev;
    values.set(id, v);
  };

  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS quantity_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_enc TEXT`.catch(() => {});
  await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_enc TEXT`.catch(() => {});

  const holdingsRaw = await sql`
    SELECT h.account_id, h.ticker, h.currency,
           h.quantity, h.quantity_enc, h.avg_cost, h.avg_cost_enc,
           h.manual_price, h.manual_price_enc,
           COALESCE(p.price, 0) as price_market
    FROM holdings h
    JOIN accounts a ON h.account_id = a.id
    LEFT JOIN price_history p ON h.ticker = p.ticker
      AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
    WHERE a.type = 'stock' AND a.user_id = ${userId}
  ` as { account_id: number; ticker: string; currency: string;
         quantity: number | null; quantity_enc: string | null;
         avg_cost: number | null; avg_cost_enc: string | null;
         manual_price: number | null; manual_price_enc: string | null;
         price_market: number }[];

  const decrypted = holdingsRaw.map((h) => ({ raw: h, d: decryptHoldingFields(h) }));
  const liveTickers = [...new Set(
    decrypted
      .filter((x) => x.raw.ticker !== "CASH" && (x.d.manual_price === null || x.d.manual_price === undefined))
      .map((x) => x.raw.ticker),
  )];
  const quotes = liveTickers.length > 0 ? await getQuotes(liveTickers) : [];
  const qMap = new Map(quotes.map((q) => [q.ticker, q]));

  for (const { raw, d } of decrypted) {
    const qty = d.quantity ?? 0;
    const cost = d.avg_cost ?? 0;
    const manual = d.manual_price;
    const live = qMap.get(raw.ticker);
    // 현재값은 오늘 환율, 전일값은 어제 환율 → 일간 변화에 FX 변동까지 포함
    const mul = raw.currency === "USD" ? exchangeRate : 1;
    const prevMul = raw.currency === "USD" ? prevRate : 1;

    const price =
      raw.ticker === "CASH" ? cost :
      manual !== null && manual !== undefined && manual > 0 ? manual :
      (live?.price ?? (raw.price_market || cost));
    // 전일 종가 = 현재가 / (1 + 등락률). 라이브 시세 없으면 변동 0(전일=현재).
    const changePct = (raw.ticker === "CASH" || manual != null) ? 0 : (live?.changePct ?? 0);
    const prevPrice = changePct !== 0 ? price / (1 + changePct / 100) : price;

    add(raw.account_id, qty * price * mul, qty * prevPrice * prevMul);
  }

  // 은행 계좌: 최신 잔액 (일간 변동 없음 → 전일=현재)
  const bankAccounts = await sql`
    SELECT id, currency FROM accounts WHERE user_id = ${userId} AND type = 'bank'
  ` as { id: number; currency: string }[];
  for (const acct of bankAccounts) {
    const [latest] = await sql`
      SELECT balance, balance_enc FROM bank_balances
      WHERE account_id = ${acct.id} ORDER BY date DESC LIMIT 1
    ` as { balance: number | null; balance_enc: string | null }[];
    if (!latest) continue;
    const bal = latest.balance_enc !== null ? (decryptNum(latest.balance_enc) ?? 0) : (latest.balance ?? 0);
    // 잔액은 그대로지만 USD 계좌는 환율 변동만큼 원화 평가액이 일간 변함
    if (acct.currency === "USD") {
      add(acct.id, bal * exchangeRate, bal * prevRate);
    } else {
      add(acct.id, bal, bal);
    }
  }

  return values;
}

interface SnapshotRow {
  total_krw: number | null; total_krw_enc: string | null;
  total_usd: number | null; total_usd_enc: string | null;
  stock_krw: number | null; stock_krw_enc: string | null;
  bank_krw: number | null; bank_krw_enc: string | null;
  exchange_rate: number;
  date: string;
}

function decryptSnapshotRow(r: SnapshotRow) {
  return {
    total_krw: r.total_krw_enc ? (decryptNum(r.total_krw_enc) ?? 0) : (r.total_krw ?? 0),
    total_usd: r.total_usd_enc ? (decryptNum(r.total_usd_enc) ?? 0) : (r.total_usd ?? 0),
    stock_krw: r.stock_krw_enc ? (decryptNum(r.stock_krw_enc) ?? 0) : (r.stock_krw ?? 0),
    bank_krw:  r.bank_krw_enc  ? (decryptNum(r.bank_krw_enc)  ?? 0) : (r.bank_krw  ?? 0),
    exchange_rate: r.exchange_rate,
    date: r.date,
  };
}

export async function getSnapshots(userId: number, startDate?: string, endDate?: string) {
  const sql = getDb();
  await initSnapshotColumn(sql);

  const rows = startDate && endDate
    ? await sql`
        SELECT total_krw, total_krw_enc, total_usd, total_usd_enc,
               stock_krw, stock_krw_enc, bank_krw, bank_krw_enc, exchange_rate, date
        FROM snapshots
        WHERE user_id = ${userId} AND date >= ${startDate} AND date <= ${endDate}
        ORDER BY date
      ` as SnapshotRow[]
    : await sql`
        SELECT total_krw, total_krw_enc, total_usd, total_usd_enc,
               stock_krw, stock_krw_enc, bank_krw, bank_krw_enc, exchange_rate, date
        FROM snapshots WHERE user_id = ${userId} ORDER BY date
      ` as SnapshotRow[];

  return rows.map(decryptSnapshotRow);
}
