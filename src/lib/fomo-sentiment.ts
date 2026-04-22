import type { SentimentData } from "@/types/fomo";

function scoreToLabel(score: number): string {
  if (score <= 20) return "극단적 공포";
  if (score <= 40) return "공포";
  if (score <= 60) return "중립";
  if (score <= 80) return "탐욕";
  return "극단적 탐욕";
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function vixToScore(vix: number): number {
  if (vix < 12) return 95;
  if (vix < 15) return 80;
  if (vix < 18) return 65;
  if (vix < 20) return 55;
  if (vix < 25) return 40;
  if (vix < 30) return 25;
  if (vix < 35) return 15;
  return 5;
}

function calcComposite(raw: SentimentData["raw"]): Pick<SentimentData, "KR" | "US" | "Crypto" | "Overall"> {
  const { vix, vixChange, cryptoFG, kospiChangePct, kosdaqChangePct, sp500ChangePct, foreignNetBuy } = raw;
  const cryptoScore = cryptoFG;
  const vixScore = vixToScore(vix);
  const spMomentum = 50 + clamp(sp500ChangePct * 10, -30, 30);
  const cryptoMacro = cryptoFG * 0.6 + 20;
  const pcProxy = vixChange > 1 ? 20 : vixChange > 0 ? 35 : vixChange === 0 ? 50 : vixChange > -1 ? 65 : 80;
  const US = Math.round(clamp(vixScore * 0.4 + spMomentum * 0.3 + cryptoMacro * 0.2 + pcProxy * 0.1, 0, 100));
  const kospiScore = 50 + clamp(kospiChangePct * 10, -30, 30);
  const kosdaqScore = 50 + clamp(kosdaqChangePct * 10, -20, 20);
  const foreignScore =
    foreignNetBuy > 2000 ? 85 : foreignNetBuy > 500 ? 70 : foreignNetBuy >= 0 ? 55 :
    foreignNetBuy >= -500 ? 45 : foreignNetBuy >= -2000 ? 30 : 15;
  const vixDampened = vixScore * 0.5 + 25;
  const KR = Math.round(clamp(kospiScore * 0.4 + kosdaqScore * 0.2 + foreignScore * 0.3 + vixDampened * 0.1, 0, 100));
  const Crypto = cryptoScore;
  const Overall = Math.round(clamp(KR * 0.35 + US * 0.4 + Crypto * 0.25, 0, 100));
  return { KR, US, Crypto, Overall };
}

// 외국인 KOSPI 순매수 (억원) — KRX 공공 API, 실패 시 0 (중립)
async function fetchForeignNetBuy(): Promise<number> {
  try {
    const today = new Date();
    // 주말이면 가장 최근 금요일로 조정
    const day = today.getDay();
    if (day === 0) today.setDate(today.getDate() - 2);
    else if (day === 6) today.setDate(today.getDate() - 1);
    const trdDd = today.toISOString().split("T")[0].replace(/-/g, "");

    const res = await fetch("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://data.krx.co.kr/",
      },
      body: new URLSearchParams({
        bld: "dbms/MDC/STAT/standard/MDCSTAT02501",
        locale: "ko_KR",
        idxIndMidclssCd: "01",
        trdDd,
      }).toString(),
      cache: "no-store",
    });

    if (!res.ok) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = json?.OutBlock_1 ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foreign = rows.find((r: any) => r.INVST_TP_NM?.includes("외국인"));
    if (!foreign) return 0;
    // NETBUY_TRDVAL: 백만원 단위 → 억원으로 변환
    const raw = String(foreign.NETBUY_TRDVAL ?? "0").replace(/,/g, "");
    return Math.round(Number(raw) / 100);
  } catch {
    return 0;
  }
}

async function fetchYahoo(symbol: string): Promise<{ price: number; prevClose: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta ?? {};
  return { price: meta.regularMarketPrice ?? 0, prevClose: meta.chartPreviousClose ?? meta.regularMarketPrice ?? 1 };
}

export async function fetchSentimentData(): Promise<SentimentData> {
  const [vixData, kospiData, kosdaqData, sp500Data, fngRes, foreignNetBuyData] = await Promise.allSettled([
    fetchYahoo("^VIX"),
    fetchYahoo("^KS11"),
    fetchYahoo("^KQ11"),
    fetchYahoo("^GSPC"),
    fetch("https://api.alternative.me/fng/", { cache: "no-store" }).then((r) => r.json()),
    fetchForeignNetBuy(),
  ]);

  const vix = vixData.status === "fulfilled" ? vixData.value : { price: 18.5, prevClose: 17.2 };
  const kospi = kospiData.status === "fulfilled" ? kospiData.value : { price: 2650, prevClose: 2662 };
  const kosdaq = kosdaqData.status === "fulfilled" ? kosdaqData.value : { price: 850, prevClose: 855 };
  const sp500 = sp500Data.status === "fulfilled" ? sp500Data.value : { price: 5100, prevClose: 5125 };
  const fng = fngRes.status === "fulfilled" ? fngRes.value : null;
  const foreignNetBuy = foreignNetBuyData.status === "fulfilled" ? foreignNetBuyData.value : 0;

  const cryptoFG = Number(fng?.data?.[0]?.value ?? 45);
  const cryptoLabel = fng?.data?.[0]?.value_classification ?? "Fear";

  const raw: SentimentData["raw"] = {
    vix: vix.price,
    vixChange: vix.price - vix.prevClose,
    cryptoFG,
    cryptoLabel,
    kospiChangePct: kospi.prevClose ? ((kospi.price - kospi.prevClose) / kospi.prevClose) * 100 : 0,
    kosdaqChangePct: kosdaq.prevClose ? ((kosdaq.price - kosdaq.prevClose) / kosdaq.prevClose) * 100 : 0,
    sp500ChangePct: sp500.prevClose ? ((sp500.price - sp500.prevClose) / sp500.prevClose) * 100 : 0,
    foreignNetBuy,
  };

  const scores = calcComposite(raw);
  const labels = {
    KR: scoreToLabel(scores.KR),
    US: scoreToLabel(scores.US),
    Crypto: scoreToLabel(scores.Crypto),
    Overall: scoreToLabel(scores.Overall),
  };

  return { ...scores, labels, raw, timestamp: new Date().toISOString() };
}
