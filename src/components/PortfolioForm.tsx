import { useState, useEffect, useRef } from 'react';
import { PortfolioEntry, AssetType } from '../types';
import { getNameBySymbol, getSymbolByName, searchStocks } from '../utils/stockDatabase';

interface PortfolioFormProps {
  onAdd: (entry: PortfolioEntry) => void;
}

export const PortfolioForm = ({ onAdd }: PortfolioFormProps) => {
  const [type, setType] = useState<AssetType>('us_stock');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  
  // 자동완성 관련
  const [symbolSuggestions, setSymbolSuggestions] = useState<Array<{ symbol: string; name: string }>>([]);
  const [nameSuggestions, setNameSuggestions] = useState<Array<{ symbol: string; name: string }>>([]);
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  
  // 자동 채우기를 위한 ref (무한 루프 방지)
  const isAutoFilling = useRef(false);
  const lastSymbolRef = useRef('');
  const lastNameRef = useRef('');

  // 심볼 입력 시 자동완성 및 이름 자동 채우기
  const handleSymbolChange = (value: string) => {
    setSymbol(value);
    setShowSymbolSuggestions(value.length > 0);
    
    if (value.length > 0) {
      const suggestions = searchStocks(value, type);
      setSymbolSuggestions(
        suggestions.map((s) => ({ symbol: s.symbol, name: s.name }))
      );
    } else {
      setSymbolSuggestions([]);
    }

    // 심볼로 이름 자동 채우기
    if (!isAutoFilling.current && value && value !== lastSymbolRef.current) {
      lastSymbolRef.current = value;
      const foundName = getNameBySymbol(value, type);
      if (foundName && foundName !== name) {
        isAutoFilling.current = true;
        setName(foundName);
        setShowSymbolSuggestions(false);
        // 다음 렌더링 사이클에서 플래그 리셋
        setTimeout(() => {
          isAutoFilling.current = false;
        }, 0);
      }
    } else if (!value) {
      // 심볼이 비어있으면 플래그 리셋
      isAutoFilling.current = false;
    }
  };

  // 이름 입력 시 자동완성 및 심볼 자동 채우기
  const handleNameChange = (value: string) => {
    setName(value);
    setShowNameSuggestions(value.length > 0);
    
    if (value.length > 0) {
      const suggestions = searchStocks(value, type);
      setNameSuggestions(
        suggestions.map((s) => ({ symbol: s.symbol, name: s.name }))
      );
    } else {
      setNameSuggestions([]);
    }

    // 이름으로 심볼 자동 채우기
    if (!isAutoFilling.current && value && value !== lastNameRef.current) {
      lastNameRef.current = value;
      const foundSymbol = getSymbolByName(value, type);
      if (foundSymbol && foundSymbol !== symbol) {
        isAutoFilling.current = true;
        setSymbol(foundSymbol);
        setShowNameSuggestions(false);
        // 다음 렌더링 사이클에서 플래그 리셋
        setTimeout(() => {
          isAutoFilling.current = false;
        }, 0);
      }
    } else if (!value) {
      // 이름이 비어있으면 플래그 리셋
      isAutoFilling.current = false;
    }
  };

  // 자동완성 항목 선택
  const selectSymbolSuggestion = (suggestion: { symbol: string; name: string }) => {
    isAutoFilling.current = true;
    setSymbol(suggestion.symbol);
    setName(suggestion.name);
    setShowSymbolSuggestions(false);
    lastSymbolRef.current = suggestion.symbol;
    lastNameRef.current = suggestion.name;
  };

  const selectNameSuggestion = (suggestion: { symbol: string; name: string }) => {
    isAutoFilling.current = true;
    setSymbol(suggestion.symbol);
    setName(suggestion.name);
    setShowNameSuggestions(false);
    lastSymbolRef.current = suggestion.symbol;
    lastNameRef.current = suggestion.name;
  };

  // 타입 변경 시 필드 초기화
  useEffect(() => {
    setSymbol('');
    setName('');
    lastSymbolRef.current = '';
    lastNameRef.current = '';
  }, [type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !name || !quantity || !purchasePrice) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    const entry: PortfolioEntry = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      symbol: symbol.toUpperCase(),
      name,
      quantity: parseFloat(quantity),
      purchasePrice: parseFloat(purchasePrice),
      purchaseDate,
    };

    onAdd(entry);
    setSymbol('');
    setName('');
    setQuantity('');
    setPurchasePrice('');
    lastSymbolRef.current = '';
    lastNameRef.current = '';
  };

  return (
    <form onSubmit={handleSubmit} className="portfolio-form">
      <h2>포트폴리오 추가</h2>
      <div className="form-group">
        <label>
          자산 유형:
          <select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
            <option value="us_stock">미국 주식</option>
            <option value="kr_stock">한국 주식</option>
            <option value="crypto">코인</option>
          </select>
        </label>
      </div>
      <div className="form-group">
        <label>
          심볼:
          <div className="autocomplete-wrapper">
            <input
              type="text"
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSymbolSuggestions(false), 200)}
              onFocus={() => symbol.length > 0 && setShowSymbolSuggestions(true)}
              placeholder={
                type === 'kr_stock' 
                  ? '예: 005930 (삼성전자), 000660 (SK하이닉스)' 
                  : type === 'us_stock'
                  ? '예: AAPL (애플), TSLA (테슬라)'
                  : '예: BTC (비트코인), ETH (이더리움)'
              }
            />
            {showSymbolSuggestions && symbolSuggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {symbolSuggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="suggestion-item"
                    onClick={() => selectSymbolSuggestion(suggestion)}
                  >
                    <span className="suggestion-symbol">{suggestion.symbol}</span>
                    <span className="suggestion-name">{suggestion.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="input-hint">
            {type === 'kr_stock' && '한국 주식은 6자리 종목코드를 입력하세요 (또는 이름 입력 시 자동 채워짐)'}
            {type === 'us_stock' && '미국 주식은 티커 심볼을 입력하세요 (또는 이름 입력 시 자동 채워짐)'}
            {type === 'crypto' && '암호화폐는 심볼을 입력하세요 (또는 이름 입력 시 자동 채워짐)'}
          </span>
        </label>
      </div>
      <div className="form-group">
        <label>
          이름:
          <div className="autocomplete-wrapper">
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
              onFocus={() => name.length > 0 && setShowNameSuggestions(true)}
              placeholder={
                type === 'kr_stock' 
                  ? '예: 삼성전자, SK하이닉스' 
                  : type === 'us_stock'
                  ? '예: Apple Inc., Tesla Inc.'
                  : '예: Bitcoin, Ethereum'
              }
            />
            {showNameSuggestions && nameSuggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {nameSuggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="suggestion-item"
                    onClick={() => selectNameSuggestion(suggestion)}
                  >
                    <span className="suggestion-symbol">{suggestion.symbol}</span>
                    <span className="suggestion-name">{suggestion.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="input-hint">
            심볼 또는 이름 중 하나만 입력해도 자동으로 채워집니다
          </span>
        </label>
      </div>
      <div className="form-group">
        <label>
          수량:
          <input
            type="number"
            step="0.0001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="보유 수량"
          />
          <span className="input-hint">
            {type === 'crypto' && '코인은 소수점 단위로 입력 가능합니다 (예: 0.5)'}
          </span>
        </label>
      </div>
      <div className="form-group">
        <label>
          매수 가격:
          <input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder={
              type === 'kr_stock' 
                ? '예: 70000 (원화)' 
                : '예: 150.50 (달러)'
            }
          />
          <span className="input-hint">
            {type === 'kr_stock' ? '원화로 입력하세요 (예: 70000)' : '달러로 입력하세요 (예: 150.50)'}
          </span>
        </label>
      </div>
      <div className="form-group">
        <label>
          매수 일자:
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </label>
      </div>
      <button type="submit">추가</button>
    </form>
  );
};
