// 환율 API 서비스
// 무료 API: exchangerate-api.com 또는 fixer.io 사용 가능

const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD';

interface ExchangeRateResponse {
  rates: {
    KRW: number;
    [key: string]: number;
  };
}

let cachedRate: number | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1시간

export const getExchangeRate = async (): Promise<number> => {
  const now = Date.now();
  
  // 캐시된 환율이 있고 1시간 이내면 캐시 사용
  if (cachedRate && (now - cacheTime) < CACHE_DURATION) {
    return cachedRate;
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API);
    const data: ExchangeRateResponse = await response.json();
    const krwRate = data.rates.KRW;
    
    cachedRate = krwRate;
    cacheTime = now;
    
    return krwRate;
  } catch (error) {
    console.error('환율 조회 실패:', error);
    // 실패 시 기본값 반환 (약 1300원)
    return cachedRate || 1300;
  }
};

// USD를 KRW로 변환
export const usdToKrw = async (usd: number): Promise<number> => {
  const rate = await getExchangeRate();
  return usd * rate;
};

// KRW를 USD로 변환
export const krwToUsd = async (krw: number): Promise<number> => {
  const rate = await getExchangeRate();
  return krw / rate;
};
