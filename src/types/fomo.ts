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
    cnnFG: number | null;
    cnnFGLabel: string | null;
    // 5-day trends
    vix5dChangePct: number;
    kospi5dChangePct: number;
    sp5005dChangePct: number;
  };
  trendSummary: string;
  timestamp: string;
}

export type TargetSector =
  | "Tech" | "Defense" | "Bonds" | "Cash" | "Crypto"
  | "KR-Large" | "KR-Small" | "Gold" | "Energy" | "Other";

export type TimeHorizon = "1w" | "1m" | "3m" | "1y";

export interface AgentAnalysis {
  id: string;
  name: string;
  style: string;
  weight: number;
  action: "Buy" | "Hold" | "Sell";
  targetSector: TargetSector;
  confidence: number;      // 1-5
  timeHorizon: TimeHorizon;
  fomoScore: number;       // 0-10
  interpretation: string;
  actionReason: string;
  warning: string;
  innerMonologue: string;
  biasesDetected: string[];
}

export interface ContrarianSignal {
  active: boolean;
  reason: string;
}

export interface AgentsResult {
  agents: AgentAnalysis[];
  consensus: {
    buyPct: number;
    holdPct: number;
    sellPct: number;
    avgFomoScore: number;
    weightedAction: "Buy" | "Hold" | "Sell";
    avgConfidence: number;
    topSectors: { sector: TargetSector; count: number }[];
  };
  contrarian: ContrarianSignal;
  timestamp: string;
}
