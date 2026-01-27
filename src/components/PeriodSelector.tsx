import { TimePeriod } from '../types';

interface PeriodSelectorProps {
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

export const PeriodSelector = ({ period, onPeriodChange }: PeriodSelectorProps) => {
  const periods: { value: TimePeriod; label: string }[] = [
    { value: '1D', label: '1일' },
    { value: '1W', label: '1주' },
    { value: '1M', label: '1개월' },
    { value: '3M', label: '3개월' },
    { value: '6M', label: '6개월' },
    { value: '1Y', label: '1년' },
    { value: 'ALL', label: '전체' },
  ];

  return (
    <div className="period-selector">
      {periods.map((p) => (
        <button
          key={p.value}
          onClick={() => onPeriodChange(p.value)}
          className={period === p.value ? 'active' : ''}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};
