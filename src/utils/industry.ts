// 주요 종목의 산업 분류 데이터
export interface IndustryData {
  symbol: string;
  industry: string;
  sector: string;
}

// 미국 주식 산업 분류
const usStockIndustries: Record<string, { industry: string; sector: string }> = {
  // 기술
  'AAPL': { industry: '컴퓨터 및 전자제품', sector: '기술' },
  'MSFT': { industry: '소프트웨어', sector: '기술' },
  'GOOGL': { industry: '인터넷 서비스', sector: '기술' },
  'GOOG': { industry: '인터넷 서비스', sector: '기술' },
  'AMZN': { industry: '전자상거래', sector: '소비재' },
  'META': { industry: '소셜 미디어', sector: '기술' },
  'TSLA': { industry: '자동차', sector: '소비재' },
  'NVDA': { industry: '반도체', sector: '기술' },
  'AMD': { industry: '반도체', sector: '기술' },
  'INTC': { industry: '반도체', sector: '기술' },
  'NFLX': { industry: '엔터테인먼트', sector: '소비재' },
  'DIS': { industry: '엔터테인먼트', sector: '소비재' },
  
  // 금융
  'JPM': { industry: '은행', sector: '금융' },
  'BAC': { industry: '은행', sector: '금융' },
  'GS': { industry: '투자은행', sector: '금융' },
  'MS': { industry: '투자은행', sector: '금융' },
  
  // 헬스케어
  'JNJ': { industry: '제약', sector: '헬스케어' },
  'PFE': { industry: '제약', sector: '헬스케어' },
  'UNH': { industry: '건강보험', sector: '헬스케어' },
  
  // 소비재
  'WMT': { industry: '유통', sector: '소비재' },
  'KO': { industry: '음료', sector: '소비재' },
  'PEP': { industry: '음료', sector: '소비재' },
  'NKE': { industry: '의류', sector: '소비재' },
  
  // 에너지
  'XOM': { industry: '석유', sector: '에너지' },
  'CVX': { industry: '석유', sector: '에너지' },
  
  // 산업
  'BA': { industry: '항공우주', sector: '산업' },
  'CAT': { industry: '건설장비', sector: '산업' },
};

// 한국 주식 산업 분류
const krStockIndustries: Record<string, { industry: string; sector: string }> = {
  '005930': { industry: '반도체', sector: '기술' }, // 삼성전자
  '000660': { industry: '반도체', sector: '기술' }, // SK하이닉스
  '035420': { industry: '인터넷 서비스', sector: '기술' }, // NAVER
  '035720': { industry: '인터넷 서비스', sector: '기술' }, // 카카오
  '005380': { industry: '자동차', sector: '소비재' }, // 현대차
  '000270': { industry: '자동차', sector: '소비재' }, // 기아
  '051910': { industry: '화학', sector: '소재' }, // LG화학
  '006400': { industry: '화학', sector: '소재' }, // 삼성SDI
  '028260': { industry: '제약', sector: '헬스케어' }, // 삼성물산
  '068270': { industry: '제약', sector: '헬스케어' }, // 셀트리온
  '105560': { industry: '은행', sector: '금융' }, // KB금융
  '055550': { industry: '은행', sector: '금융' }, // 신한지주
  '032830': { industry: '유통', sector: '소비재' }, // 삼성물산
  '017670': { industry: '통신', sector: '통신' }, // SK텔레콤
  '030200': { industry: '통신', sector: '통신' }, // KT
};

// 코인 분류
const cryptoCategories: Record<string, { industry: string; sector: string }> = {
  'BTC': { industry: '저장 가치', sector: '암호화폐' },
  'ETH': { industry: '스마트 컨트랙트', sector: '암호화폐' },
  'BNB': { industry: '거래소 토큰', sector: '암호화폐' },
  'SOL': { industry: '스마트 컨트랙트', sector: '암호화폐' },
  'ADA': { industry: '스마트 컨트랙트', sector: '암호화폐' },
  'XRP': { industry: '결제', sector: '암호화폐' },
  'DOT': { industry: '인터체인', sector: '암호화폐' },
  'DOGE': { industry: '밈 코인', sector: '암호화폐' },
  'MATIC': { industry: '스케일링', sector: '암호화폐' },
  'AVAX': { industry: '스마트 컨트랙트', sector: '암호화폐' },
};

export const getIndustryInfo = (
  symbol: string,
  type: 'us_stock' | 'kr_stock' | 'crypto'
): { industry: string; sector: string } => {
  if (type === 'us_stock') {
    return usStockIndustries[symbol] || { industry: '기타', sector: '기타' };
  } else if (type === 'kr_stock') {
    return krStockIndustries[symbol] || { industry: '기타', sector: '기타' };
  } else {
    return cryptoCategories[symbol] || { industry: '기타', sector: '암호화폐' };
  }
};
