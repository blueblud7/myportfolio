/**
 * PCR 히스토리 backfill 스크립트
 * VIX 히스토리 데이터(Yahoo Finance)를 기반으로 과거 PCR 추정값을 DB에 저장합니다.
 *
 * 실행: node scripts/seed-pcr-history.mjs
 *
 * ※ source='vix_estimated' 로 저장되므로 CBOE 실측값과 구분됩니다.
 * ※ ON CONFLICT (date, symbol) → CBOE 실측값이 있으면 덮어쓰지 않습니다.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import { default as YahooFinance } from 'yahoo-finance2';

const sql = neon(process.env.DATABASE_URL);
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

// VIX → 추정 PCR 변환 (역사적 회귀 기반 근사치)
// SPY PCR ≈ 0.45 + 0.025 * VIX
// QQQ PCR ≈ SPY * 1.07  (나스닥 ETF는 풋 수요 다소 높음)
function vixToPcr(vix, symbol) {
  const base = 0.45 + 0.025 * vix;
  // 시장 상태에 따른 약간의 랜덤 노이즈 추가 (±3%)
  const noise = (Math.random() - 0.5) * 0.06;
  const spy = Math.max(0.5, Math.min(2.0, base + noise));
  return symbol === 'QQQ' ? +(spy * 1.07).toFixed(3) : +spy.toFixed(3);
}

async function main() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1); // 1년 치

  console.log(`VIX 히스토리 조회: ${start.toISOString().slice(0,10)} ~ ${end.toISOString().slice(0,10)}`);

  const vixRows = await yf.chart('^VIX', {
    period1: Math.floor(start.getTime() / 1000),
    period2: Math.floor(end.getTime() / 1000),
    interval: '1d',
  }, { validateResult: false });

  const quotes = vixRows?.quotes ?? [];
  console.log(`VIX 데이터: ${quotes.length}개 거래일`);

  let inserted = 0;
  for (const q of quotes) {
    if (!q.close || !q.date) continue;
    const date = new Date(q.date).toISOString().slice(0, 10);
    const vix = q.close;

    for (const symbol of ['SPY', 'QQQ']) {
      const pcr = vixToPcr(vix, symbol);
      // 이미 CBOE 실측값이 있으면 건너뜀 (DO NOTHING)
      await sql`
        INSERT INTO pcr_snapshots (date, symbol, pcr, call_volume, put_volume, basis, source)
        VALUES (${date}, ${symbol}, ${pcr}, 0, 0, 'openInterest', 'vix_estimated')
        ON CONFLICT (date, symbol) DO NOTHING
      `;
      inserted++;
    }
  }

  console.log(`✅ ${inserted}개 레코드 seed 완료 (source=vix_estimated)`);

  // 확인
  const count = await sql`SELECT count(*) FROM pcr_snapshots`;
  console.log('총 레코드:', count[0].count);
}

main().catch(console.error);
