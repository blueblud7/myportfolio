export interface SentimentData {
  KR: number;
  US: number;
  Crypto: number;
  Overall: number;
  labels: { KR: string; US: string; Crypto: string; Overall: string };
  raw: {
    vix: number;
    vixChange: number;
    cryptoFG: number;
    cryptoLabel: string;
    kospiChangePct: number;
    kosdaqChangePct: number;
    sp500ChangePct: number;
    foreignNetBuy: number;
  };
  timestamp: string;
}

export interface AgentAnalysis {
  id: string;
  name: string;
  style: string;
  weight: number;
  action: "Buy" | "Hold" | "Sell";
  fomoScore: number;
  interpretation: string;
  actionReason: string;
  warning: string;
  innerMonologue: string;
  biasesDetected: string[];
}

export interface AgentsResult {
  agents: AgentAnalysis[];
  consensus: {
    buyPct: number;
    holdPct: number;
    sellPct: number;
    avgFomoScore: number;
    weightedAction: "Buy" | "Hold" | "Sell";
  };
  timestamp: string;
}
