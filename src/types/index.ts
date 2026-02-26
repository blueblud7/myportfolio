export interface Account {
  id: number;
  name: string;
  type: "stock" | "bank";
  currency: "KRW" | "USD";
  broker: string;
  created_at: string;
}

export interface Holding {
  id: number;
  account_id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  currency: "KRW" | "USD";
  note: string;
  date: string;
}

export interface HoldingWithPrice extends Holding {
  current_price: number;
  market_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  change_pct: number;
}

export interface PriceHistory {
  ticker: string;
  price: number;
  date: string;
}

export interface BankBalance {
  id: number;
  account_id: number;
  balance: number;
  date: string;
  note: string;
}

export interface Snapshot {
  id: number;
  total_krw: number;
  total_usd: number;
  stock_krw: number;
  bank_krw: number;
  exchange_rate: number;
  date: string;
}

export interface ExchangeRate {
  rate: number;
  date: string;
}

export interface BrokerCredential {
  id: number;
  account_id: number;
  broker: string;
  app_key: string;
  secret_key: string;
  account_number: string;
  last_synced_at: string | null;
}

export interface DiaryEntry {
  id: number;
  title: string;
  content: string;
  date: string;
  mood: "great" | "good" | "neutral" | "bad" | "terrible";
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface KiwoomHolding {
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
}

export interface AccountSummary extends Account {
  total_value: number;
  total_value_krw: number;
  gain_loss: number;
  gain_loss_pct: number;
  holdings_count: number;
}

export interface DashboardSummary {
  total_krw: number;
  total_usd: number;
  total_gain_loss_krw: number;
  total_gain_loss_pct: number;
  exchange_rate: number;
  stock_value_krw: number;
  bank_value_krw: number;
}

export interface ReportData {
  by_currency: { currency: string; value_krw: number; pct: number }[];
  by_account: { name: string; value_krw: number; pct: number }[];
  by_sector: { sector: string; value_krw: number; pct: number }[];
  top_performers: { ticker: string; name: string; gain_loss_pct: number }[];
  worst_performers: { ticker: string; name: string; gain_loss_pct: number }[];
  all_performers: { ticker: string; name: string; gain_loss_pct: number }[];
  dividend_income: {
    total_krw: number;
    items: {
      ticker: string;
      name: string;
      quantity: number;
      annual_dividend: number;
      annual_income_krw: number;
      dividend_yield: number;
    }[];
  };
}
