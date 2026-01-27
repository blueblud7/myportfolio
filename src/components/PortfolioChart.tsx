import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PortfolioSnapshot, TimePeriod } from '../types';
import { filterSnapshotsByPeriod } from '../utils/dateUtils';
import { format } from 'date-fns';

interface PortfolioChartProps {
  snapshots: PortfolioSnapshot[];
  period: TimePeriod;
}

export const PortfolioChart = ({ snapshots, period }: PortfolioChartProps) => {
  const filteredSnapshots = useMemo(() => {
    const filtered = filterSnapshotsByPeriod(snapshots, period);
    return filtered.map((snapshot) => ({
      date: format(new Date(snapshot.date), period === '1D' ? 'HH:mm' : 'MM/dd'),
      value: snapshot.totalValue,
      formattedValue: `$${snapshot.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    }));
  }, [snapshots, period]);

  if (filteredSnapshots.length === 0) {
    return (
      <div className="chart-container">
        <p>표시할 데이터가 없습니다. 포트폴리오를 추가하고 스냅샷을 생성해주세요.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h2>포트폴리오 가치 변화</h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={filteredSnapshots}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis
            tickFormatter={(value) => {
              if (value >= 1000000) {
                return `$${(value / 1000000).toFixed(1)}M`;
              }
              return `$${(value / 1000).toFixed(0)}K`;
            }}
            style={{ fontSize: '0.875rem', fill: '#4b5563' }}
          />
          <Tooltip
            formatter={(value: number) => [
              `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              '총 가치 (USD)',
            ]}
            labelFormatter={(label) => `날짜: ${label}`}
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.875rem',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#8884d8"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name="포트폴리오 가치"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
