export interface Account {
  id: number;
  name: string;
  type: "stock" | "bank";
  currency: "KRW" | "USD";
  broker: string;
  target_pct: number;
  owner?: string | null;
  created_at: string;
}

export type RebalancingAction = "buy" | "sell" | "hold";

export interface RebalancingAccount {
  id: number;
  name: string;
  type: string;
  currency: string;
  target_pct: number;
  current_krw: number;
  current_pct: number;
  diff_pct: number;
  diff_krw: number;
  action: RebalancingAction;
  action_krw: number;
}

export interface RebalancingSummary {
  total_krw: number;
  exchange_rate: number;
  total_target_pct: number;
  accounts: RebalancingAccount[];
  needs_rebalancing: boolean;
  tolerance: number;
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

export interface PerformerRow {
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  currency: string;
  account_name: string;
}

export interface BenchmarkPoint {
  date: string;
  close: number;
}

export interface DividendScheduleItem {
  ticker: string;
  name: string;
  frequency: string;
  per_share_amount: number;
  quantity: number;
  annual_income_krw: number;
  ex_dividend_date: string | null;
  payment_months: number[];
}

export interface DividendScheduleResponse {
  monthly: { month: number; amount_krw: number }[];
  total_annual_krw: number;
  items: DividendScheduleItem[];
}

export type PerformancePeriod = "1M" | "3M" | "6M" | "1Y";
export type PerformanceSubjectType = "portfolio" | "account" | "stock";

export interface PerformancePoint { date: string; return_pct: number; }

export interface PerformanceCompareResponse {
  subject: { name: string; points: PerformancePoint[] };
  benchmarks: Record<string, PerformancePoint[]>;
}

export interface SectorEtfResponse {
  [ticker: string]: { date: string; return_pct: number }[];
}

export interface ReturnsCalendarRow {
  year: number;
  months: (number | null)[];
  annual: number | null;
}

export interface ReturnsCalendarResponse {
  rows: ReturnsCalendarRow[];
  average: (number | null)[];
  median: (number | null)[];
  avg_annual: number | null;
  median_annual: number | null;
}

export interface CapitalGainsTx {
  ticker: string;
  name: string;
  date: string;
  quantity: number;
  sell_price: number;
  avg_cost: number;
  realized_gain_usd: number;
  realized_gain_krw: number;
}

export interface CapitalGainsHolding {
  id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  unrealized_gain_usd: number;
}

export interface CapitalGainsSummary {
  year: number;
  exchange_rate: number;
  realized_gain_usd: number;
  realized_gain_krw: number;
  deduction_krw: number;
  taxable_krw: number;
  tax_krw: number;
  transactions: CapitalGainsTx[];
  usd_holdings: CapitalGainsHolding[];
}

export type RiskPeriod = "1M" | "3M" | "6M" | "1Y" | "ALL";

export interface RiskMetrics {
  period_return: number;
  volatility: number;
  mdd: number;
  sharpe: number;
  best_day: number;
  worst_day: number;
  positive_days_pct: number;
  data_points: number;
  daily_returns: { date: string; return_pct: number }[];
  drawdown_series: { date: string; drawdown_pct: number }[];
}

export type TransactionType = "buy" | "sell" | "dividend" | "deposit" | "withdrawal";

export interface Transaction {
  id: number;
  account_id: number;
  type: TransactionType;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  fees: number;
  total_amount: number;
  currency: "KRW" | "USD";
  date: string;
  note: string;
  created_at: string;
}

export interface DiaryMoodPattern {
  mood: string;
  diary_count: number;
  buy_count: number;
  sell_count: number;
  avg_buy_amount: number;
  avg_sell_amount: number;
  total_tx_count: number;
}

export interface FxAnalysisItem {
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  purchase_fx: number;
  current_fx: number;
  stock_return_usd: number;
  fx_return: number;
  total_return_krw: number;
  market_value_usd: number;
  market_value_krw: number;
  purchase_date: string;
}

export interface FxAnalysisResponse {
  items: FxAnalysisItem[];
  current_fx: number;
}

export interface PriceAlert {
  id: number;
  ticker: string;
  name: string;
  target_price: number;
  alert_type: "above" | "below";
  currency: "KRW" | "USD";
  is_active: boolean;
  is_triggered: boolean;
  current_price: number | null;
  note: string;
  created_at: string;
}

export interface AccountSnapshot {
  account_id: number;
  value_krw: number;
  date: string;
  name: string;
  type: "stock" | "bank";
  currency: "KRW" | "USD";
}

export interface ReportData {
  by_currency: { currency: string; value_krw: number; pct: number }[];
  by_account: { name: string; value_krw: number; pct: number }[];
  by_sector: { sector: string; value_krw: number; pct: number }[];
  top_performers: PerformerRow[];
  worst_performers: PerformerRow[];
  all_performers: PerformerRow[];
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
