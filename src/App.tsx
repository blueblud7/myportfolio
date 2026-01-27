import { useState, useEffect, useCallback } from 'react';
import { PortfolioEntry, PortfolioSnapshot, TimePeriod } from './types';
import { savePortfolioData, loadPortfolioData } from './utils/storage';
import { getCurrentPrices } from './utils/priceService';
import { getExchangeRate, usdToKrw } from './utils/exchangeRate';
import { PortfolioForm } from './components/PortfolioForm';
import { PortfolioList } from './components/PortfolioList';
import { PortfolioChart } from './components/PortfolioChart';
import { PeriodSelector } from './components/PeriodSelector';
import { UsageGuide } from './components/UsageGuide';
import { PortfolioAnalysisDashboard } from './components/PortfolioAnalysis';
import { AutoSnapshotSettings } from './components/AutoSnapshotSettings';
import { AppSettings, loadSettings, saveSettings } from './utils/settings';
import { getPreviousClosePrices } from './utils/priceService';
import './App.css';

function App() {
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [period, setPeriod] = useState<TimePeriod>('1M');
  const [isLoading, setIsLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(1300); // 기본 환율
  const [settings, setSettings] = useState<AppSettings>(loadSettings());

  // 초기 데이터 로드 및 환율 조회
  useEffect(() => {
    const data = loadPortfolioData();
    setEntries(data.entries);
    setSnapshots(data.snapshots);
    
    // 환율 조회
    getExchangeRate().then(setExchangeRate);
    
    // 주기적으로 환율 업데이트 (1시간마다)
    const interval = setInterval(() => {
      getExchangeRate().then(setExchangeRate);
    }, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // 포트폴리오 변경 시 저장
  useEffect(() => {
    savePortfolioData({ entries, snapshots });
  }, [entries, snapshots]);

  // 스냅샷 생성 함수 (현재 가격 기준)
  const createSnapshot = useCallback(async (usePreviousClose = false) => {
    if (entries.length === 0) {
      if (!usePreviousClose) {
        alert('포트폴리오에 자산이 없습니다.');
      }
      return;
    }

    setIsLoading(true);
    try {
      // 가격 가져오기 (전일 종가 또는 현재 가격)
      const priceRequests = entries.map((entry) => ({
        symbol: entry.symbol,
        type: entry.type,
      }));
      
      const prices = usePreviousClose
        ? await getPreviousClosePrices(priceRequests)
        : await getCurrentPrices(priceRequests);

      // 각 항목의 현재 가치 계산 (원화는 달러로 변환)
      const entryValues = entries.map((entry) => {
        const currentPrice = prices.get(entry.symbol) || entry.purchasePrice;
        let value = entry.quantity * currentPrice;
        
        // 한국 주식은 원화를 달러로 변환
        if (entry.type === 'kr_stock') {
          value = value / exchangeRate;
        }
        
        return {
          id: entry.id,
          currentPrice,
          value, // USD 기준
        };
      });

      // 총 가치 계산 (USD 기준)
      const totalValue = entryValues.reduce((sum, item) => sum + item.value, 0);

      // 스냅샷 생성
      const snapshot: PortfolioSnapshot = {
        date: new Date().toISOString(),
        totalValue,
        entries: entryValues,
      };

      setSnapshots((prev) => [...prev, snapshot]);
      
      // 자동 스냅샷인 경우 마지막 생성 날짜 업데이트
      if (usePreviousClose) {
        const newSettings: AppSettings = {
          ...settings,
          lastAutoSnapshotDate: new Date().toISOString(),
        };
        setSettings(newSettings);
        saveSettings(newSettings);
      }
    } catch (error) {
      console.error('스냅샷 생성 실패:', error);
      if (!usePreviousClose) {
        alert('스냅샷 생성에 실패했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [entries, exchangeRate, settings]);

  // 자동 스냅샷 체크 및 실행
  useEffect(() => {
    if (!settings.autoSnapshot || entries.length === 0) {
      return;
    }

    const checkAndCreateSnapshot = () => {
      const now = new Date();
      const [hours, minutes] = settings.autoSnapshotTime.split(':').map(Number);
      
      // 오늘 날짜 확인
      const today = now.toISOString().split('T')[0];
      const lastSnapshotDate = settings.lastAutoSnapshotDate
        ? new Date(settings.lastAutoSnapshotDate).toISOString().split('T')[0]
        : null;

      // 오늘 이미 생성했으면 스킵
      if (lastSnapshotDate === today) {
        return;
      }

      // 지정한 시간인지 확인 (1분 오차 허용)
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const targetMinutes = hours * 60 + minutes;
      const diff = Math.abs(currentMinutes - targetMinutes);

      if (diff <= 1) {
        console.log('자동 스냅샷 생성 (전일 종가 기준)');
        createSnapshot(true);
      }
    };

    // 초기 체크
    checkAndCreateSnapshot();

    // 1분마다 체크
    const interval = setInterval(checkAndCreateSnapshot, 60 * 1000);

    return () => clearInterval(interval);
  }, [settings.autoSnapshot, settings.autoSnapshotTime, settings.lastAutoSnapshotDate, entries.length, createSnapshot]);

  // 설정 변경 핸들러
  const handleSettingsChange = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  // 자동 스냅샷 생성은 사용자가 수동으로 생성하도록 변경
  // 필요시 자동 생성 기능을 추가할 수 있습니다

  const handleAddEntry = (entry: PortfolioEntry) => {
    setEntries((prev) => [...prev, entry]);
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm('이 항목을 삭제하시겠습니까?')) {
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      // 관련 스냅샷도 업데이트 (선택사항)
    }
  };

  // 총 가치 계산 (USD 기준)
  const currentTotalValueUSD = snapshots.length > 0 
    ? snapshots[snapshots.length - 1].totalValue 
    : 0;
  
  // 총 매수 가치 계산 (USD 기준으로 변환)
  const totalPurchaseValueUSD = entries.reduce((sum, entry) => {
    let value = entry.quantity * entry.purchasePrice;
    // 한국 주식은 원화를 달러로 변환
    if (entry.type === 'kr_stock') {
      value = value / exchangeRate;
    }
    return sum + value;
  }, 0);
  
  const profitUSD = currentTotalValueUSD - totalPurchaseValueUSD;
  const profitPercent = totalPurchaseValueUSD > 0 
    ? ((profitUSD / totalPurchaseValueUSD) * 100).toFixed(2) 
    : '0.00';
  
  // 원화로 변환
  const currentTotalValueKRW = currentTotalValueUSD * exchangeRate;
  const totalPurchaseValueKRW = totalPurchaseValueUSD * exchangeRate;
  const profitKRW = profitUSD * exchangeRate;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>📈 내 포트폴리오 추적</h1>
          <div className="exchange-rate">
            <span className="rate-label">환율:</span>
            <span className="rate-value">₩{exchangeRate.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / $1</span>
          </div>
        </div>
        
        <div className="summary">
          <div className="summary-card">
            <div className="summary-item">
              <span className="label">총 가치 (USD)</span>
              <span className="value usd">${currentTotalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="summary-item">
              <span className="label">총 가치 (KRW)</span>
              <span className="value krw">₩{currentTotalValueKRW.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          
          <div className="summary-card">
            <div className="summary-item">
              <span className="label">손익 (USD)</span>
              <span className={`value usd ${profitUSD >= 0 ? 'positive' : 'negative'}`}>
                ${profitUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({profitPercent}%)
              </span>
            </div>
            <div className="summary-item">
              <span className="label">손익 (KRW)</span>
              <span className={`value krw ${profitKRW >= 0 ? 'positive' : 'negative'}`}>
                ₩{profitKRW.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="left-panel">
          <UsageGuide />
          <PortfolioForm onAdd={handleAddEntry} />
          <PortfolioList entries={entries} onDelete={handleDeleteEntry} />
        </div>

        <div className="right-panel">
          <AutoSnapshotSettings onSettingsChange={handleSettingsChange} />
          
          <div className="chart-section">
            <div className="chart-controls">
              <PeriodSelector period={period} onPeriodChange={setPeriod} />
              <button 
                onClick={() => createSnapshot(false)} 
                disabled={isLoading || entries.length === 0}
                className="snapshot-btn"
              >
                {isLoading ? '생성 중...' : '📸 스냅샷 생성'}
              </button>
            </div>
            <PortfolioChart snapshots={snapshots} period={period} />
          </div>
          
          <PortfolioAnalysisDashboard
            entries={entries}
            snapshots={snapshots}
            exchangeRate={exchangeRate}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
