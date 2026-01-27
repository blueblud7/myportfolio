import { AssetType } from '../types';

// 통화 포맷팅
export const formatCurrency = (amount: number, type: AssetType): string => {
  if (type === 'kr_stock') {
    return `₩${amount.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  // us_stock, crypto는 달러
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// 통화 심볼만 반환
export const getCurrencySymbol = (type: AssetType): string => {
  return type === 'kr_stock' ? '₩' : '$';
};

// 통화 이름 반환
export const getCurrencyName = (type: AssetType): string => {
  return type === 'kr_stock' ? '원' : '달러';
};
