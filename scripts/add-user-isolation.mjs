/**
 * 멀티유저 격리 마이그레이션
 * 실행: node --env-file=.env.local scripts/add-user-isolation.mjs
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 필요합니다');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  console.log('=== 멀티유저 격리 마이그레이션 시작 ===\n');

  // 1. accounts에 user_id 추가
  console.log('1. accounts 테이블 user_id 컬럼 추가...');
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner TEXT`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER`;
  await sql`UPDATE accounts SET sort_order = id WHERE sort_order IS NULL`;

  // 2. snapshots - UNIQUE(date) → UNIQUE(user_id, date)
  console.log('2. snapshots 테이블 user_id 컬럼 추가 및 제약 변경...');
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  // 기존 UNIQUE(date) 제약 제거 (없으면 무시)
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'snapshots_date_key' AND conrelid = 'snapshots'::regclass
      ) THEN
        ALTER TABLE snapshots DROP CONSTRAINT snapshots_date_key;
      END IF;
    END $$;
  `;
  // 새 제약 추가 (없으면)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'snapshots_user_id_date_key' AND conrelid = 'snapshots'::regclass
      ) THEN
        ALTER TABLE snapshots ADD CONSTRAINT snapshots_user_id_date_key UNIQUE (user_id, date);
      END IF;
    END $$;
  `;

  // 3. diary에 user_id 추가
  console.log('3. diary 테이블 user_id 컬럼 추가...');
  await sql`ALTER TABLE diary ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;

  // 4. price_alerts에 user_id 추가
  console.log('4. price_alerts 테이블 user_id 컬럼 추가...');
  await sql`ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;

  // 5. watchlist - UNIQUE(ticker) → UNIQUE(user_id, ticker)
  console.log('5. watchlist 테이블 user_id 컬럼 추가 및 제약 변경...');
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'watchlist_ticker_key' AND conrelid = 'watchlist'::regclass
      ) THEN
        ALTER TABLE watchlist DROP CONSTRAINT watchlist_ticker_key;
      END IF;
    END $$;
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'watchlist_user_id_ticker_key' AND conrelid = 'watchlist'::regclass
      ) THEN
        ALTER TABLE watchlist ADD CONSTRAINT watchlist_user_id_ticker_key UNIQUE (user_id, ticker);
      END IF;
    END $$;
  `;

  // 6. 기존 데이터 귀속 (유저가 1명이면 자동 할당)
  const users = await sql`SELECT id, username FROM users LIMIT 1`;
  if (users.length > 0) {
    const firstUser = users[0];
    console.log(`\n6. 기존 데이터를 유저 '${firstUser.username}' (id=${firstUser.id})에게 귀속...`);

    const acctRows = await sql`UPDATE accounts SET user_id = ${firstUser.id} WHERE user_id IS NULL RETURNING id`;
    console.log(`   accounts: ${acctRows.length}행 업데이트`);

    const snapRows = await sql`UPDATE snapshots SET user_id = ${firstUser.id} WHERE user_id IS NULL RETURNING id`;
    console.log(`   snapshots: ${snapRows.length}행 업데이트`);

    const diaryRows = await sql`UPDATE diary SET user_id = ${firstUser.id} WHERE user_id IS NULL RETURNING id`;
    console.log(`   diary: ${diaryRows.length}행 업데이트`);

    const alertRows = await sql`UPDATE price_alerts SET user_id = ${firstUser.id} WHERE user_id IS NULL RETURNING id`;
    console.log(`   price_alerts: ${alertRows.length}행 업데이트`);

    const watchRows = await sql`UPDATE watchlist SET user_id = ${firstUser.id} WHERE user_id IS NULL RETURNING id`;
    console.log(`   watchlist: ${watchRows.length}행 업데이트`);
  } else {
    console.log('\n6. 등록된 유저 없음 - 기존 데이터 귀속 생략');
  }

  console.log('\n=== 마이그레이션 완료 ===');
}

run().catch((e) => {
  console.error('마이그레이션 실패:', e);
  process.exit(1);
});
