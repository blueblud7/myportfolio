import { PortfolioEntry } from '../types';
import { getIndustryInfo } from './industry';

export interface AnalysisData {
  name: string;
  value: number;
  percentage: number;
}

export interface PortfolioAnalysis {
  byStock: AnalysisData[];
  byIndustry: AnalysisData[];
  bySector: AnalysisData[];
  byAssetType: AnalysisData[];
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#8884d8',
  '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#0088fe',
];

export const analyzePortfolio = (
  entries: PortfolioEntry[],
  snapshots: { entries: { id: string; value: number }[] }[],
  exchangeRate: number
): PortfolioAnalysis => {
  if (entries.length === 0 || snapshots.length === 0) {
    return {
      byStock: [],
      byIndustry: [],
      bySector: [],
      byAssetType: [],
    };
  }

  // 최신 스냅샷 사용
  const latestSnapshot = snapshots[snapshots.length - 1];
  const snapshotMap = new Map(
    latestSnapshot.entries.map((e) => [e.id, e.value])
  );

  // 총 가치 계산
  const totalValue = latestSnapshot.entries.reduce((sum, e) => sum + e.value, 0);

  // 종목별 분석
  const stockMap = new Map<string, number>();
  entries.forEach((entry) => {
    const value = snapshotMap.get(entry.id) || 0;
    stockMap.set(entry.symbol, (stockMap.get(entry.symbol) || 0) + value);
  });

  const byStock: AnalysisData[] = Array.from(stockMap.entries())
    .map(([symbol, value]) => {
      const entry = entries.find((e) => e.symbol === symbol);
      return {
        name: entry?.name || symbol,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  // 산업별 분석
  const industryMap = new Map<string, number>();
  entries.forEach((entry) => {
    const value = snapshotMap.get(entry.id) || 0;
    const { industry } = getIndustryInfo(entry.symbol, entry.type);
    industryMap.set(industry, (industryMap.get(industry) || 0) + value);
  });

  const byIndustry: AnalysisData[] = Array.from(industryMap.entries())
    .map(([industry, value]) => ({
      name: industry,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // 섹터별 분석
  const sectorMap = new Map<string, number>();
  entries.forEach((entry) => {
    const value = snapshotMap.get(entry.id) || 0;
    const { sector } = getIndustryInfo(entry.symbol, entry.type);
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + value);
  });

  const bySector: AnalysisData[] = Array.from(sectorMap.entries())
    .map(([sector, value]) => ({
      name: sector,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // 자산 유형별 분석
  const assetTypeMap = new Map<string, number>();
  entries.forEach((entry) => {
    const value = snapshotMap.get(entry.id) || 0;
    const typeLabel = 
      entry.type === 'us_stock' ? '미국 주식' :
      entry.type === 'kr_stock' ? '한국 주식' :
      '코인';
    assetTypeMap.set(typeLabel, (assetTypeMap.get(typeLabel) || 0) + value);
  });

  const byAssetType: AnalysisData[] = Array.from(assetTypeMap.entries())
    .map(([type, value]) => ({
      name: type,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    byStock,
    byIndustry,
    bySector,
    byAssetType,
  };
};

export const getChartColor = (index: number): string => {
  return COLORS[index % COLORS.length];
};
