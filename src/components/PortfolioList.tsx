import { PortfolioEntry } from '../types';
import { formatCurrency } from '../utils/currency';

interface PortfolioListProps {
  entries: PortfolioEntry[];
  onDelete: (id: string) => void;
}

export const PortfolioList = ({ entries, onDelete }: PortfolioListProps) => {
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'us_stock':
        return '미국 주식';
      case 'kr_stock':
        return '한국 주식';
      case 'crypto':
        return '코인';
      default:
        return type;
    }
  };

  if (entries.length === 0) {
    return (
      <div className="portfolio-list">
        <h2>포트폴리오 목록</h2>
        <p className="empty-message">추가된 자산이 없습니다. 위의 폼을 사용하여 포트폴리오를 추가해주세요.</p>
      </div>
    );
  }

  return (
    <div className="portfolio-list">
      <h2>포트폴리오 목록</h2>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>유형</th>
              <th>심볼</th>
              <th>이름</th>
              <th>수량</th>
              <th>매수 가격</th>
              <th>매수 일자</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <span className={`type-badge type-${entry.type}`}>
                    {getTypeLabel(entry.type)}
                  </span>
                </td>
                <td className="symbol-cell">{entry.symbol}</td>
                <td className="name-cell">{entry.name}</td>
                <td>{entry.quantity.toLocaleString('ko-KR')}</td>
                <td className="price-cell">{formatCurrency(entry.purchasePrice, entry.type)}</td>
                <td>{entry.purchaseDate}</td>
                <td>
                  <button onClick={() => onDelete(entry.id)} className="delete-btn">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
