// 주요 종목의 심볼-이름 매핑 데이터베이스

interface StockInfo {
  symbol: string;
  name: string;
  type: 'us_stock' | 'kr_stock' | 'crypto';
}

// 미국 주식 데이터베이스
const usStocks: StockInfo[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'us_stock' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'us_stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'us_stock' },
  { symbol: 'GOOG', name: 'Alphabet Inc.', type: 'us_stock' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'us_stock' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'us_stock' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'us_stock' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'us_stock' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', type: 'us_stock' },
  { symbol: 'INTC', name: 'Intel Corporation', type: 'us_stock' },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'us_stock' },
  { symbol: 'DIS', name: 'The Walt Disney Company', type: 'us_stock' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'us_stock' },
  { symbol: 'BAC', name: 'Bank of America Corp.', type: 'us_stock' },
  { symbol: 'GS', name: 'Goldman Sachs Group Inc.', type: 'us_stock' },
  { symbol: 'MS', name: 'Morgan Stanley', type: 'us_stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'us_stock' },
  { symbol: 'PFE', name: 'Pfizer Inc.', type: 'us_stock' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', type: 'us_stock' },
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'us_stock' },
  { symbol: 'KO', name: 'The Coca-Cola Company', type: 'us_stock' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'us_stock' },
  { symbol: 'NKE', name: 'Nike Inc.', type: 'us_stock' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', type: 'us_stock' },
  { symbol: 'CVX', name: 'Chevron Corporation', type: 'us_stock' },
  { symbol: 'BA', name: 'The Boeing Company', type: 'us_stock' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', type: 'us_stock' },
];

// 한국 주식 데이터베이스
const krStocks: StockInfo[] = [
  { symbol: '005930', name: '삼성전자', type: 'kr_stock' },
  { symbol: '000660', name: 'SK하이닉스', type: 'kr_stock' },
  { symbol: '035420', name: 'NAVER', type: 'kr_stock' },
  { symbol: '035720', name: '카카오', type: 'kr_stock' },
  { symbol: '005380', name: '현대차', type: 'kr_stock' },
  { symbol: '000270', name: '기아', type: 'kr_stock' },
  { symbol: '051910', name: 'LG화학', type: 'kr_stock' },
  { symbol: '006400', name: '삼성SDI', type: 'kr_stock' },
  { symbol: '028260', name: '삼성물산', type: 'kr_stock' },
  { symbol: '068270', name: '셀트리온', type: 'kr_stock' },
  { symbol: '105560', name: 'KB금융', type: 'kr_stock' },
  { symbol: '055550', name: '신한지주', type: 'kr_stock' },
  { symbol: '032830', name: '삼성물산', type: 'kr_stock' },
  { symbol: '017670', name: 'SK텔레콤', type: 'kr_stock' },
  { symbol: '030200', name: 'KT', type: 'kr_stock' },
  { symbol: '005490', name: 'POSCO홀딩스', type: 'kr_stock' },
  { symbol: '006360', name: 'GS건설', type: 'kr_stock' },
  { symbol: '028300', name: 'HLB', type: 'kr_stock' },
  { symbol: '003670', name: '포스코케미칼', type: 'kr_stock' },
  { symbol: '096770', name: 'SK이노베이션', type: 'kr_stock' },
];

// 코인 데이터베이스
const cryptos: StockInfo[] = [
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'BNB', name: 'Binance Coin', type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto' },
  { symbol: 'ADA', name: 'Cardano', type: 'crypto' },
  { symbol: 'XRP', name: 'Ripple', type: 'crypto' },
  { symbol: 'DOT', name: 'Polkadot', type: 'crypto' },
  { symbol: 'DOGE', name: 'Dogecoin', type: 'crypto' },
  { symbol: 'MATIC', name: 'Polygon', type: 'crypto' },
  { symbol: 'AVAX', name: 'Avalanche', type: 'crypto' },
  { symbol: 'LINK', name: 'Chainlink', type: 'crypto' },
  { symbol: 'UNI', name: 'Uniswap', type: 'crypto' },
  { symbol: 'ATOM', name: 'Cosmos', type: 'crypto' },
  { symbol: 'ALGO', name: 'Algorand', type: 'crypto' },
];

// 전체 데이터베이스
const allStocks: StockInfo[] = [...usStocks, ...krStocks, ...cryptos];

// 심볼로 이름 찾기
export const getNameBySymbol = (symbol: string, type: 'us_stock' | 'kr_stock' | 'crypto'): string | null => {
  const normalizedSymbol = symbol.toUpperCase().trim();
  const stock = allStocks.find(
    (s) => s.symbol === normalizedSymbol && s.type === type
  );
  return stock ? stock.name : null;
};

// 이름으로 심볼 찾기 (부분 일치 지원)
export const getSymbolByName = (name: string, type: 'us_stock' | 'kr_stock' | 'crypto'): string | null => {
  const normalizedName = name.trim();
  
  // 정확한 일치 먼저 확인
  let stock = allStocks.find(
    (s) => s.name.toLowerCase() === normalizedName.toLowerCase() && s.type === type
  );
  
  // 정확한 일치가 없으면 부분 일치 확인
  if (!stock) {
    stock = allStocks.find(
      (s) => 
        s.name.toLowerCase().includes(normalizedName.toLowerCase()) ||
        normalizedName.toLowerCase().includes(s.name.toLowerCase())
    );
    
    // 타입이 일치하는지 확인
    if (stock && stock.type !== type) {
      return null;
    }
  }
  
  return stock ? stock.symbol : null;
};

// 자동완성용 검색
export const searchStocks = (
  query: string,
  type: 'us_stock' | 'kr_stock' | 'crypto'
): StockInfo[] => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const filtered = allStocks.filter(
    (stock) =>
      stock.type === type &&
      (stock.symbol.toLowerCase().includes(normalizedQuery) ||
        stock.name.toLowerCase().includes(normalizedQuery))
  );

  return filtered.slice(0, 10); // 최대 10개만 반환
};
