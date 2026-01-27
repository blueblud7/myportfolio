import { PortfolioData } from '../types';

const STORAGE_KEY = 'portfolio_data';

export const savePortfolioData = (data: PortfolioData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('포트폴리오 데이터 저장 실패:', error);
  }
};

export const loadPortfolioData = (): PortfolioData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('포트폴리오 데이터 로드 실패:', error);
  }
  return { entries: [], snapshots: [] };
};
