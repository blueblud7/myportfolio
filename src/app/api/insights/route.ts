import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/lib/db";
import { getLatestExchangeRate } from "@/lib/exchange-rate";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    const sql = getDb();
    const exchangeRate = await getLatestExchangeRate();

    // 포트폴리오 데이터 수집
    const holdings = await sql`
      SELECT h.ticker, h.name, h.quantity, h.avg_cost, h.currency,
             a.name as account_name, a.type as account_type,
             COALESCE(p.price, h.avg_cost) as current_price
      FROM holdings h
      JOIN accounts a ON h.account_id = a.id
      LEFT JOIN price_history p ON h.ticker = p.ticker
        AND p.date = (SELECT MAX(date) FROM price_history WHERE ticker = h.ticker)
      ORDER BY a.name, h.ticker
    ` as {
      ticker: string; name: string; quantity: number; avg_cost: number; currency: string;
      account_name: string; account_type: string; current_price: number;
    }[];

    const accounts = await sql`SELECT name, type, currency FROM accounts ORDER BY name`;

    const bankBalances = await sql`
      SELECT bb.balance, a.name, a.currency
      FROM bank_balances bb
      JOIN accounts a ON bb.account_id = a.id
      WHERE bb.date = (SELECT MAX(b2.date) FROM bank_balances b2 WHERE b2.account_id = bb.account_id)
      GROUP BY bb.account_id, bb.balance, a.name, a.currency
    ` as { balance: number; name: string; currency: string }[];

    // 포트폴리오 요약 계산
    let totalStockKrw = 0;
    let totalCostKrw = 0;
    const holdingsSummary = holdings.map((h) => {
      const value = h.quantity * h.current_price;
      const cost = h.quantity * h.avg_cost;
      const valueKrw = h.currency === "USD" ? value * exchangeRate : value;
      const costKrw = h.currency === "USD" ? cost * exchangeRate : cost;
      totalStockKrw += valueKrw;
      totalCostKrw += costKrw;
      const gainLossPct = costKrw > 0 ? ((valueKrw - costKrw) / costKrw) * 100 : 0;
      return {
        ticker: h.ticker,
        name: h.name,
        account: h.account_name,
        quantity: h.quantity,
        avgCost: h.avg_cost,
        currentPrice: h.current_price,
        currency: h.currency,
        valueKrw: Math.round(valueKrw),
        gainLossPct: Math.round(gainLossPct * 10) / 10,
        pct: 0,
      };
    });

    // 비중 계산
    for (const h of holdingsSummary) {
      h.pct = totalStockKrw > 0 ? Math.round((h.valueKrw / totalStockKrw) * 1000) / 10 : 0;
    }

    let totalBankKrw = 0;
    for (const b of bankBalances) {
      totalBankKrw += b.currency === "USD" ? b.balance * exchangeRate : b.balance;
    }

    const totalKrw = totalStockKrw + totalBankKrw;
    const totalGainLoss = ((totalStockKrw - totalCostKrw) / totalCostKrw) * 100;

    const portfolioContext = `
## 포트폴리오 현황 (기준일: ${new Date().toLocaleDateString("ko-KR")})

### 총 자산
- 총 자산: ₩${totalKrw.toLocaleString("ko-KR")} ($${(totalKrw / exchangeRate).toLocaleString("en-US", { maximumFractionDigits: 0 })})
- 주식 자산: ₩${totalStockKrw.toLocaleString("ko-KR")} (${Math.round(totalStockKrw / totalKrw * 100)}%)
- 은행/현금: ₩${totalBankKrw.toLocaleString("ko-KR")} (${Math.round(totalBankKrw / totalKrw * 100)}%)
- 총 수익률: ${totalGainLoss.toFixed(1)}%
- 환율: ₩${exchangeRate}/USD

### 계좌 목록
${accounts.map((a) => `- ${(a as { name: string; type: string; currency: string }).name} (${(a as { name: string; type: string; currency: string }).type}, ${(a as { name: string; type: string; currency: string }).currency})`).join("\n")}

### 보유 종목 (비중순)
${holdingsSummary
  .sort((a, b) => b.pct - a.pct)
  .map((h) => `- ${h.ticker} (${h.name}): ${h.pct}%, ₩${h.valueKrw.toLocaleString()}, 수익률 ${h.gainLossPct > 0 ? "+" : ""}${h.gainLossPct}%, 계좌: ${h.account}`)
  .join("\n")}

### 현금/예금
${bankBalances.map((b) => `- ${b.name}: ${b.currency === "USD" ? "$" : "₩"}${b.balance.toLocaleString()}`).join("\n")}
`;

    const systemPrompt = `당신은 개인 투자 포트폴리오 분석 전문가입니다.
주어진 포트폴리오 데이터를 기반으로 명확하고 실용적인 인사이트를 제공합니다.
분석 시 다음을 고려하세요:
- 분산투자 현황과 집중 리스크
- 수익/손실 종목 패턴
- 자산 배분 적절성 (주식 vs 현금)
- 구체적이고 실행 가능한 제안
- 리스크 관리 관점

마크다운 형식으로 구조화된 답변을 제공하세요. 답변은 한국어로 작성하세요.`;

    const userMessage = question
      ? `${portfolioContext}\n\n---\n\n질문: ${question}`
      : `${portfolioContext}\n\n---\n\n위 포트폴리오를 종합적으로 분석해주세요. 다음을 포함해주세요:
1. 포트폴리오 전체 평가 (강점/약점)
2. 집중 리스크 또는 분산 상태
3. 수익률 관점에서의 주목할 종목
4. 개선 제안 3가지 (구체적, 실행 가능)
5. 전반적인 리스크 수준 평가`;

    const message = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const text = message.choices[0]?.message?.content ?? "";

    return NextResponse.json({
      analysis: text,
      portfolioSummary: {
        totalKrw,
        totalStockKrw,
        totalBankKrw,
        totalGainLoss: Math.round(totalGainLoss * 10) / 10,
        holdingsCount: holdings.length,
        exchangeRate,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
