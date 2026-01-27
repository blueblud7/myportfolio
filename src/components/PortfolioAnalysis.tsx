import { PortfolioEntry, PortfolioSnapshot } from '../types';
import { analyzePortfolio } from '../utils/portfolioAnalysis';
import { AnalysisPieChart } from './AnalysisPieChart';

interface PortfolioAnalysisProps {
  entries: PortfolioEntry[];
  snapshots: PortfolioSnapshot[];
  exchangeRate: number;
}

export const PortfolioAnalysisDashboard = ({
  entries,
  snapshots,
  exchangeRate,
}: PortfolioAnalysisProps) => {
  if (entries.length === 0 || snapshots.length === 0) {
    return (
      <div className="analysis-dashboard">
        <h2>포트폴리오 분석</h2>
        <p className="no-data-message">
          포트폴리오를 추가하고 스냅샷을 생성하면 분석 데이터를 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  const analysis = analyzePortfolio(entries, snapshots, exchangeRate);

  return (
    <div className="analysis-dashboard">
      <h2>📊 포트폴리오 분석</h2>
      <div className="analysis-grid">
        <AnalysisPieChart
          title="종목별 비율"
          data={analysis.byStock}
          maxItems={8}
        />
        <AnalysisPieChart
          title="산업별 분포"
          data={analysis.byIndustry}
          maxItems={8}
        />
        <AnalysisPieChart
          title="섹터별 분포"
          data={analysis.bySector}
          maxItems={8}
        />
        <AnalysisPieChart
          title="자산 유형별 분포"
          data={analysis.byAssetType}
          maxItems={5}
        />
      </div>
    </div>
  );
};
