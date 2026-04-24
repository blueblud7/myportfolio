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

// CNN Fear & Greed Index (주식시장 기준)
async function fetchCnnFearGreed(): Promise<{ score: number | null; label: string | null }> {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.cnn.com/" }, cache: "no-store" }
    );
    if (!res.ok) return { score: null, label: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const fg = json?.fear_and_greed;
    if (!fg) return { score: null, label: null };
    const score = Math.round(Number(fg.score));
    const ratingMap: Record<string, string> = {
      "Extreme Fear": "극단적 공포",
      "Fear": "공포",
      "Neutral": "중립",
      "Greed": "탐욕",
      "Extreme Greed": "극단적 탐욕",
    };
    const label = ratingMap[fg.rating as string] ?? fg.rating ?? null;
    return { score, label };
  } catch {
    return { score: null, label: null };
  }
}

async function fetchYahoo(symbol: string): Promise<{ price: number; prevClose: number; price5dAgo: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta ?? {};
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const valid = closes.filter((c): c is number => typeof c === "number" && isFinite(c));
  const price = meta.regularMarketPrice ?? valid[valid.length - 1] ?? 0;
  const prevClose = meta.chartPreviousClose ?? valid[valid.length - 2] ?? price;
  // 5 거래일 전 close (없으면 가장 오래된 값)
  const price5dAgo = valid.length >= 6 ? valid[valid.length - 6] : (valid[0] ?? price);
  return { price, prevClose, price5dAgo };
}

function buildTrendSummary(
  kospi: { price: number; price5dAgo: number; changePct: number },
  sp500: { price: number; price5dAgo: number; changePct: number },
  vix: { price: number; price5dAgo: number }
): string {
  const k5 = kospi.price5dAgo ? ((kospi.price - kospi.price5dAgo) / kospi.price5dAgo) * 100 : 0;
  const s5 = sp500.price5dAgo ? ((sp500.price - sp500.price5dAgo) / sp500.price5dAgo) * 100 : 0;
  const v5 = vix.price5dAgo ? ((vix.price - vix.price5dAgo) / vix.price5dAgo) * 100 : 0;

  const bits: string[] = [];
  // SP500 해석
  if (s5 >= 3 && sp500.changePct >= 0) bits.push("S&P500 5일 랠리 지속");
  else if (s5 >= 3 && sp500.changePct < 0) bits.push("S&P500 랠리 후 첫 조정");
  else if (s5 <= -3 && sp500.changePct >= 0) bits.push("S&P500 5일 하락 후 반등 시도");
  else if (s5 <= -3) bits.push("S&P500 5일 연속 약세");
  // KOSPI 해석
  if (k5 >= 3 && kospi.changePct >= 0) bits.push("KOSPI 랠리 진행");
  else if (k5 <= -3) bits.push("KOSPI 5일 조정");
  // VIX 해석
  if (v5 >= 15) bits.push("VIX 급등 (위험 회피 심화)");
  else if (v5 <= -15) bits.push("VIX 하락 (공포 완화)");

  return bits.length ? bits.join(" · ") : "횡보 구간";
}

export async function fetchSentimentData(): Promise<SentimentData> {
  const [vixData, kospiData, kosdaqData, sp500Data, fngRes, foreignNetBuyData, cnnFGData] = await Promise.allSettled([
    fetchYahoo("^VIX"),
    fetchYahoo("^KS11"),
    fetchYahoo("^KQ11"),
    fetchYahoo("^GSPC"),
    fetch("https://api.alternative.me/fng/", { cache: "no-store" }).then((r) => r.json()),
    fetchForeignNetBuy(),
    fetchCnnFearGreed(),
  ]);

  const vix = vixData.status === "fulfilled" ? vixData.value : { price: 18.5, prevClose: 17.2, price5dAgo: 17.0 };
  const kospi = kospiData.status === "fulfilled" ? kospiData.value : { price: 2650, prevClose: 2662, price5dAgo: 2680 };
  const kosdaq = kosdaqData.status === "fulfilled" ? kosdaqData.value : { price: 850, prevClose: 855, price5dAgo: 860 };
  const sp500 = sp500Data.status === "fulfilled" ? sp500Data.value : { price: 5100, prevClose: 5125, price5dAgo: 5080 };
  const fng = fngRes.status === "fulfilled" ? fngRes.value : null;
  const foreignNetBuy = foreignNetBuyData.status === "fulfilled" ? foreignNetBuyData.value : 0;
  const cnnFG = cnnFGData.status === "fulfilled" ? cnnFGData.value : { score: null, label: null };

  const cryptoFG = Number(fng?.data?.[0]?.value ?? 45);
  const cryptoLabel = fng?.data?.[0]?.value_classification ?? "Fear";

  const kospiChangePct = kospi.prevClose ? ((kospi.price - kospi.prevClose) / kospi.prevClose) * 100 : 0;
  const sp500ChangePct = sp500.prevClose ? ((sp500.price - sp500.prevClose) / sp500.prevClose) * 100 : 0;

  const raw: SentimentData["raw"] = {
    vix: vix.price,
    vixChange: vix.price - vix.prevClose,
    cryptoFG,
    cryptoLabel,
    kospiChangePct,
    kosdaqChangePct: kosdaq.prevClose ? ((kosdaq.price - kosdaq.prevClose) / kosdaq.prevClose) * 100 : 0,
    sp500ChangePct,
    foreignNetBuy,
    cnnFG: cnnFG.score,
    cnnFGLabel: cnnFG.label,
    vix5dChangePct: vix.price5dAgo ? ((vix.price - vix.price5dAgo) / vix.price5dAgo) * 100 : 0,
    kospi5dChangePct: kospi.price5dAgo ? ((kospi.price - kospi.price5dAgo) / kospi.price5dAgo) * 100 : 0,
    sp5005dChangePct: sp500.price5dAgo ? ((sp500.price - sp500.price5dAgo) / sp500.price5dAgo) * 100 : 0,
  };

  const trendSummary = buildTrendSummary(
    { price: kospi.price, price5dAgo: kospi.price5dAgo, changePct: kospiChangePct },
    { price: sp500.price, price5dAgo: sp500.price5dAgo, changePct: sp500ChangePct },
    { price: vix.price, price5dAgo: vix.price5dAgo }
  );

  const scores = calcComposite(raw);
  const labels = {
    KR: scoreToLabel(scores.KR),
    US: scoreToLabel(scores.US),
    Crypto: scoreToLabel(scores.Crypto),
    Overall: scoreToLabel(scores.Overall),
  };

  return { ...scores, labels, raw, trendSummary, timestamp: new Date().toISOString() };
}
