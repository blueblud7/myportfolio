import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { AnalysisData } from '../utils/portfolioAnalysis';
import { getChartColor } from '../utils/portfolioAnalysis';

interface AnalysisPieChartProps {
  title: string;
  data: AnalysisData[];
  maxItems?: number;
}

const RADIAN = Math.PI / 180;

const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export const AnalysisPieChart = ({ title, data, maxItems = 10 }: AnalysisPieChartProps) => {
  if (data.length === 0) {
    return (
      <div className="analysis-chart">
        <h3>{title}</h3>
        <p className="no-data">분석할 데이터가 없습니다.</p>
      </div>
    );
  }

  // 상위 N개만 표시하고 나머지는 "기타"로 묶기
  const displayData = data.slice(0, maxItems);
  const othersValue = data.slice(maxItems).reduce((sum, item) => sum + item.value, 0);
  const othersPercentage = data.slice(maxItems).reduce((sum, item) => sum + item.percentage, 0);

  const chartData = [
    ...displayData.map((item, index) => ({
      name: item.name.length > 15 ? `${item.name.substring(0, 15)}...` : item.name,
      value: item.value,
      percentage: item.percentage,
      color: getChartColor(index),
    })),
    ...(othersValue > 0
      ? [
          {
            name: '기타',
            value: othersValue,
            percentage: othersPercentage,
            color: '#cccccc',
          },
        ]
      : []),
  ];

  return (
    <div className="analysis-chart">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string, props: any) => [
              `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${props.payload.percentage.toFixed(2)}%)`,
              props.payload.name,
            ]}
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value, entry: any) => `${value} (${entry.payload.percentage.toFixed(1)}%)`}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-details">
        {displayData.map((item, index) => (
          <div key={item.name} className="detail-item">
            <div
              className="color-indicator"
              style={{ backgroundColor: getChartColor(index) }}
            />
            <span className="detail-name">{item.name}</span>
            <span className="detail-value">
              ${item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="detail-percentage">{item.percentage.toFixed(2)}%</span>
          </div>
        ))}
        {othersValue > 0 && (
          <div className="detail-item">
            <div className="color-indicator" style={{ backgroundColor: '#cccccc' }} />
            <span className="detail-name">기타</span>
            <span className="detail-value">
              ${othersValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="detail-percentage">{othersPercentage.toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
