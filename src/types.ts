export type AssetType = 'us_stock' | 'kr_stock' | 'crypto';

export interface PortfolioEntry {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string; // ISO date string
}

export interface PortfolioSnapshot {
  date: string; // ISO date string
  totalValue: number;
  entries: {
    id: string;
    currentPrice: number;
    value: number;
  }[];
}

export interface PortfolioData {
  entries: PortfolioEntry[];
  snapshots: PortfolioSnapshot[];
}

export type TimePeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
