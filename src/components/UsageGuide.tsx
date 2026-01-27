import { useState } from 'react';

export const UsageGuide = () => {
  const [isOpen, setIsOpen] = useState(false);

  const examples = [
    {
      type: '미국 주식',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '10',
      price: '150.50',
      description: '애플 주식 10주를 주당 $150.50에 매수',
    },
    {
      type: '한국 주식',
      symbol: '005930',
      name: '삼성전자',
      quantity: '5',
      price: '70000',
      description: '삼성전자 주식 5주를 주당 70,000원에 매수 (총 350,000원)',
    },
    {
      type: '코인',
      symbol: 'BTC',
      name: 'Bitcoin',
      quantity: '0.5',
      price: '45000',
      description: '비트코인 0.5개를 코인당 $45,000에 매수',
    },
  ];

  return (
    <div className="usage-guide">
      <button 
        className="guide-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '❌ 가이드 닫기' : '📖 사용 가이드 보기'}
      </button>
      
      {isOpen && (
        <div className="guide-content">
          <h3>사용 방법</h3>
          
          <div className="guide-section">
            <h4>1️⃣ 포트폴리오 추가하기</h4>
            <p>왼쪽 패널의 "포트폴리오 추가" 폼을 사용하여 보유 자산을 입력하세요.</p>
            
            <div className="guide-subsection">
              <h5>📌 한국 주식 입력 방법:</h5>
              <ol className="step-list">
                <li><strong>자산 유형</strong>에서 "한국 주식" 선택</li>
                <li><strong>심볼</strong>에 6자리 종목코드 입력 (예: 005930, 000660)
                  <ul className="nested-list">
                    <li>종목코드는 네이버/다음 금융, 한국거래소(KRX)에서 확인 가능</li>
                    <li>주요 종목: 삼성전자(005930), SK하이닉스(000660), NAVER(035420), 카카오(035720)</li>
                  </ul>
                </li>
                <li><strong>이름</strong>에 회사명 입력 (예: 삼성전자, SK하이닉스)</li>
                <li><strong>수량</strong>에 보유 주식 수 입력 (예: 5, 10)</li>
                <li><strong>매수 가격</strong>에 주당 매수 가격을 <strong>원화</strong>로 입력 (예: 70000, 150000)</li>
                <li><strong>매수 일자</strong> 선택</li>
              </ol>
            </div>

            <div className="examples">
              <h5>예시:</h5>
              {examples.map((example, idx) => (
                <div key={idx} className="example-item">
                  <div className="example-header">
                    <span className="example-type">{example.type}</span>
                  </div>
                  <div className="example-details">
                    <div><strong>심볼:</strong> {example.symbol}</div>
                    <div><strong>이름:</strong> {example.name}</div>
                    <div><strong>수량:</strong> {example.quantity}</div>
                    <div><strong>매수 가격:</strong> {example.price} {example.type === '한국 주식' ? '원' : example.type === '미국 주식' ? '달러' : '달러'}</div>
                    <div className="example-desc">{example.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="guide-subsection">
              <h5>💡 한국 주식 종목코드 찾는 방법:</h5>
              <ul>
                <li><strong>네이버 금융:</strong> 검색창에 회사명 입력 → 종목코드 확인</li>
                <li><strong>다음 금융:</strong> 검색창에 회사명 입력 → 종목코드 확인</li>
                <li><strong>한국거래소(KRX):</strong> krx.co.kr → 상장법인목록에서 검색</li>
                <li>종목코드는 항상 6자리 숫자입니다 (예: 005930, 000660)</li>
              </ul>
            </div>
          </div>

          <div className="guide-section">
            <h4>2️⃣ 스냅샷 생성하기</h4>
            <p>
              포트폴리오를 추가한 후, "스냅샷 생성" 버튼을 클릭하여 현재 포트폴리오 가치를 기록합니다.
              이 데이터는 그래프에 표시되어 자산 증식 추세를 확인할 수 있습니다.
            </p>
            <p className="tip">💡 팁: 매일 정기적으로 스냅샷을 생성하면 더 정확한 추세를 파악할 수 있습니다.</p>
          </div>

          <div className="guide-section">
            <h4>3️⃣ 기간별 그래프 확인</h4>
            <p>
              차트 위의 기간 버튼(1일, 1주, 1개월 등)을 클릭하여 원하는 기간의 포트폴리오 가치 변화를 확인하세요.
            </p>
          </div>

          <div className="guide-section">
            <h4>4️⃣ 통화 표시</h4>
            <ul>
              <li><strong>한국 주식:</strong> 원화(₩)로 표시</li>
              <li><strong>미국 주식:</strong> 달러($)로 표시</li>
              <li><strong>코인:</strong> 달러($)로 표시</li>
              <li><strong>총합:</strong> 달러와 원화 모두 표시 (실시간 환율 적용)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
