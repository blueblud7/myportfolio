import { TimePeriod } from '../types';
import { subDays, subWeeks, subMonths, subYears, isAfter, parseISO } from 'date-fns';

export const getStartDate = (period: TimePeriod): Date => {
  const now = new Date();
  switch (period) {
    case '1D':
      return subDays(now, 1);
    case '1W':
      return subWeeks(now, 1);
    case '1M':
      return subMonths(now, 1);
    case '3M':
      return subMonths(now, 3);
    case '6M':
      return subMonths(now, 6);
    case '1Y':
      return subYears(now, 1);
    case 'ALL':
      return new Date(0); // 모든 데이터
    default:
      return subMonths(now, 1);
  }
};

export const filterSnapshotsByPeriod = (
  snapshots: { date: string }[],
  period: TimePeriod
): { date: string }[] => {
  if (period === 'ALL') {
    return snapshots;
  }
  const startDate = getStartDate(period);
  return snapshots.filter((snapshot) => {
    const snapshotDate = parseISO(snapshot.date);
    return isAfter(snapshotDate, startDate) || snapshotDate.getTime() === startDate.getTime();
  });
};
