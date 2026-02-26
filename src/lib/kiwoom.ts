/**
 * 키움 REST API 클라이언트
 * https://openapi.kiwoom.com
 *
 * API 키 발급: openapi.kiwoom.com 에서 신청
 */

const KIWOOM_BASE_URL = "https://openapi.kiwoom.com";

export interface KiwoomToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface KiwoomHoldingRaw {
  ticker: string;       // 종목코드
  name: string;         // 종목명
  quantity: number;     // 보유수량
  avg_cost: number;     // 평균단가
  current_price: number;
  eval_amount: number;  // 평가금액
  profit_loss: number;  // 손익
}

/** 액세스 토큰 발급 */
export async function getKiwoomToken(
  appKey: string,
  secretKey: string
): Promise<KiwoomToken> {
  const res = await fetch(`${KIWOOM_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      secretkey: secretKey,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`키움 토큰 발급 실패: ${err}`);
  }

  return res.json();
}

/** 보유종목 조회 */
export async function getKiwoomHoldings(
  accessToken: string,
  accountNumber: string
): Promise<KiwoomHoldingRaw[]> {
  const res = await fetch(
    `${KIWOOM_BASE_URL}/v1/account/holdings?account_number=${accountNumber}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`보유종목 조회 실패: ${err}`);
  }

  const data = await res.json();
  // TODO: 실제 응답 구조에 맞게 파싱 조정 필요
  return data.holdings ?? data.output ?? [];
}

/** 계좌 잔고 조회 */
export async function getKiwoomBalance(
  accessToken: string,
  accountNumber: string
): Promise<number> {
  const res = await fetch(
    `${KIWOOM_BASE_URL}/v1/account/balance?account_number=${accountNumber}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`잔고 조회 실패: ${err}`);
  }

  const data = await res.json();
  // TODO: 실제 응답 구조에 맞게 파싱 조정 필요
  return data.balance ?? data.output?.balance ?? 0;
}
