import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { encryptNum, decryptNum } from "@/lib/crypto";

const DEFAULT_ITEMS = [
  // Housing
  { name: "임대/모기지", name_en: "Rent/Mortgage", amount: 0, type: "expense", category: "housing", sort_order: 1 },
  { name: "공과금", name_en: "Utilities", amount: 0, type: "expense", category: "housing", sort_order: 2 },
  { name: "HOA", name_en: "HOA", amount: 0, type: "expense", category: "housing", sort_order: 3 },
  { name: "집 유지보수", name_en: "Home Maintenance", amount: 0, type: "expense", category: "housing", sort_order: 4 },
  // Food
  { name: "식료품", name_en: "Groceries", amount: 0, type: "expense", category: "food", sort_order: 10 },
  { name: "외식", name_en: "Dining Out", amount: 0, type: "expense", category: "food", sort_order: 11 },
  // Transportation
  { name: "자동차 할부", name_en: "Car Payment", amount: 0, type: "expense", category: "transportation", sort_order: 20 },
  { name: "자동차 보험", name_en: "Car Insurance", amount: 0, type: "expense", category: "transportation", sort_order: 21 },
  { name: "주유비", name_en: "Gas", amount: 0, type: "expense", category: "transportation", sort_order: 22 },
  // Healthcare
  { name: "건강보험", name_en: "Health Insurance", amount: 0, type: "expense", category: "healthcare", sort_order: 30 },
  { name: "의료비", name_en: "Medical Expenses", amount: 0, type: "expense", category: "healthcare", sort_order: 31 },
  { name: "치과/시력", name_en: "Dental/Vision", amount: 0, type: "expense", category: "healthcare", sort_order: 32 },
  { name: "생명보험", name_en: "Life Insurance", amount: 0, type: "expense", category: "healthcare", sort_order: 33 },
  // Communication & Subscriptions
  { name: "휴대폰 + 인터넷", name_en: "Cell Phone + Internet", amount: 0, type: "expense", category: "communication", sort_order: 40 },
  { name: "구독 서비스", name_en: "Subscriptions", amount: 0, type: "expense", category: "communication", sort_order: 41 },
  // Education & Personal
  { name: "교육", name_en: "Education", amount: 0, type: "expense", category: "education", sort_order: 50 },
  { name: "의류/쇼핑", name_en: "Clothing/Shopping", amount: 0, type: "expense", category: "personal", sort_order: 60 },
  { name: "헬스장/피트니스", name_en: "Gym/Fitness", amount: 0, type: "expense", category: "personal", sort_order: 61 },
  { name: "미용/개인관리", name_en: "Personal Care", amount: 0, type: "expense", category: "personal", sort_order: 62 },
  { name: "반려동물", name_en: "Pet Expenses", amount: 0, type: "expense", category: "personal", sort_order: 63 },
  // Entertainment & Travel
  { name: "엔터테인먼트/취미", name_en: "Entertainment/Hobbies", amount: 0, type: "expense", category: "entertainment", sort_order: 70 },
  { name: "여행", name_en: "Travel", amount: 0, type: "expense", category: "entertainment", sort_order: 71 },
  // Savings & Tax
  { name: "은퇴/401k 적립", name_en: "Retirement/401k", amount: 0, type: "expense", category: "savings", sort_order: 80 },
  { name: "세금/회계사", name_en: "Tax/Accountant", amount: 0, type: "expense", category: "savings", sort_order: 81 },
  { name: "선물/기부", name_en: "Gifts/Donations", amount: 0, type: "expense", category: "savings", sort_order: 82 },
  // Misc
  { name: "기타", name_en: "Misc", amount: 0, type: "expense", category: "misc", sort_order: 90 },
  // Income
  { name: "급여", name_en: "Salary", amount: 0, type: "income", category: "income", sort_order: 100 },
  { name: "회사 보험 혜택", name_en: "Insurance (Company)", amount: 0, type: "income", category: "income", sort_order: 101 },
  { name: "부업/기타 수입", name_en: "Side Income", amount: 0, type: "income", category: "income", sort_order: 102 },
];

async function ensureTable(sql: ReturnType<typeof getDb>) {
  await sql`
    CREATE TABLE IF NOT EXISTS expense_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT NOT NULL DEFAULT '',
      amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      type TEXT NOT NULL DEFAULT 'expense',
      category TEXT NOT NULL DEFAULT 'misc',
      sort_order INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
    )
  `;
  await sql`ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`.catch(() => {});
  // 기존 데이터 귀속 (user_id 없는 행은 최초 가입 유저에게)
  await sql`
    UPDATE expense_items SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
    WHERE user_id IS NULL
  `.catch(() => {});
  // 일회성 마이그레이션 테이블
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`.catch(() => {});

  // amount 암호화 컬럼 + 평문 NOT NULL 제거
  await sql`ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS amount_enc TEXT`;
  await sql`ALTER TABLE expense_items ALTER COLUMN amount DROP NOT NULL`.catch(() => {});

  // 일회성 마이그레이션: 중복 제거 (같은 user_id, name, type, category에서 가장 오래된 것만 남김)
  const [dedupDone] = await sql`SELECT name FROM _migrations WHERE name = 'dedup_expenses_v1'` as { name: string }[];
  if (!dedupDone) {
    await sql`
      DELETE FROM expense_items a
      USING expense_items b
      WHERE a.user_id = b.user_id
        AND a.name = b.name
        AND a.type = b.type
        AND a.category = b.category
        AND a.id > b.id
    `;
    await sql`INSERT INTO _migrations (name) VALUES ('dedup_expenses_v1')`;
  }

  // race condition 방지용 unique constraint
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS expense_items_unique_per_user
    ON expense_items (user_id, name, type, category)
  `.catch(() => {});

  // 일회성 마이그레이션: amount → amount_enc
  const [encDone] = await sql`SELECT name FROM _migrations WHERE name = 'encrypt_expenses_v1'` as { name: string }[];
  if (!encDone) {
    const rows = await sql`SELECT id, amount FROM expense_items WHERE amount_enc IS NULL` as { id: number; amount: number | null }[];
    for (const r of rows) {
      await sql`UPDATE expense_items SET amount_enc = ${encryptNum(r.amount)} WHERE id = ${r.id}`;
    }
    await sql`INSERT INTO _migrations (name) VALUES ('encrypt_expenses_v1')`;
  }
  // 첫 번째 유저 외 expense_items 초기화 (구버전 기본값으로 시딩된 데이터 정리)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = 'reset_non_owner_expenses_v1') THEN
        DELETE FROM expense_items
        WHERE user_id != (SELECT id FROM users ORDER BY id LIMIT 1);
        INSERT INTO _migrations (name) VALUES ('reset_non_owner_expenses_v1');
      END IF;
    END $$;
  `.catch(() => {});
}

interface ExpenseRow {
  id: number;
  name: string;
  name_en: string;
  amount: number | null;
  amount_enc: string | null;
  currency: string;
  type: string;
  category: string;
  sort_order: number;
  user_id: number;
  created_at: string;
}

function decryptExpense(r: ExpenseRow) {
  return {
    ...r,
    amount: r.amount_enc !== null ? decryptNum(r.amount_enc) ?? 0 : (r.amount ?? 0),
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);
  const rows = await sql`SELECT * FROM expense_items WHERE user_id = ${user.id} ORDER BY sort_order, id` as ExpenseRow[];

  if (rows.length === 0) {
    for (const item of DEFAULT_ITEMS) {
      await sql`
        INSERT INTO expense_items (name, name_en, amount_enc, currency, type, category, sort_order, user_id)
        VALUES (${item.name}, ${item.name_en}, ${encryptNum(item.amount)}, 'USD', ${item.type}, ${item.category}, ${item.sort_order}, ${user.id})
        ON CONFLICT (user_id, name, type, category) DO NOTHING
      `;
    }
    const seeded = await sql`SELECT * FROM expense_items WHERE user_id = ${user.id} ORDER BY sort_order, id` as ExpenseRow[];
    return NextResponse.json(seeded.map(decryptExpense));
  }

  return NextResponse.json(rows.map(decryptExpense));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);
  const { name, name_en, amount, currency, type, category, sort_order } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });

  const [row] = await sql`
    INSERT INTO expense_items (name, name_en, amount_enc, currency, type, category, sort_order, user_id)
    VALUES (${name}, ${name_en ?? ""}, ${encryptNum(Number(amount ?? 0))}, ${currency ?? "USD"}, ${type}, ${category ?? "misc"}, ${sort_order ?? 999}, ${user.id})
    RETURNING *
  ` as ExpenseRow[];
  return NextResponse.json(decryptExpense(row), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  await ensureTable(sql);
  const { id, name, name_en, amount, currency, type, category, sort_order } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [row] = await sql`
    UPDATE expense_items
    SET name=${name}, name_en=${name_en ?? ""}, amount_enc=${encryptNum(Number(amount ?? 0))},
        currency=${currency ?? "USD"}, type=${type}, category=${category ?? "misc"},
        sort_order=${sort_order ?? 999}
    WHERE id=${id} AND user_id=${user.id}
    RETURNING *
  ` as ExpenseRow[];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(decryptExpense(row));
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sql`DELETE FROM expense_items WHERE id=${id} AND user_id=${user.id}`;
  return NextResponse.json({ deleted: true });
}
