"use client";

import { useState, useEffect } from "react";

const quotes = [
  { text: "남들이 탐욕스러울 때 두려워하고, 남들이 두려워할 때 탐욕스러워라.", author: "워런 버핏" },
  { text: "주식시장은 인내심 없는 사람의 돈을 인내심 있는 사람에게 이전시키는 장치다.", author: "워런 버핏" },
  { text: "10년 보유할 생각이 없으면 10분도 보유하지 마라.", author: "워런 버핏" },
  { text: "시장이 폭락하는 날이 투자 기회가 온 날이다.", author: "피터 린치" },
  { text: "주식을 살 때는 그 회사를 통째로 사는 기분으로 분석하라.", author: "피터 린치" },
  { text: "내가 산 주식이 왜 오를지 30초 안에 설명 못 하면 사지 마라.", author: "피터 린치" },
  { text: "안전마진이 투자의 핵심이다. 싸게 사야 손실을 피할 수 있다.", author: "벤저민 그레이엄" },
  { text: "주식시장은 단기적으로는 투표기계, 장기적으로는 저울이다.", author: "벤저민 그레이엄" },
  { text: "투자는 철저한 분석을 통해 원금의 안전과 적절한 수익을 추구하는 것이다.", author: "벤저민 그레이엄" },
  { text: "좋은 사업을 적당한 가격에 사는 것이 적당한 사업을 좋은 가격에 사는 것보다 낫다.", author: "찰리 멍거" },
  { text: "복리는 세계 8대 불가사의다. 이해하는 자는 벌고, 그렇지 못한 자는 낸다.", author: "알버트 아인슈타인" },
  { text: "분산투자는 무지의 보호막이다. 자신이 무엇을 하는지 아는 사람에게는 별 의미가 없다.", author: "워런 버핏" },
  { text: "시장은 항상 틀릴 수 있다. 그 틀림이 곧 기회다.", author: "조지 소로스" },
  { text: "강세장은 비관론 속에서 태어나고, 회의론 속에서 자라며, 낙관론 속에서 성숙하고, 행복감 속에서 죽는다.", author: "존 템플턴" },
  { text: "최고의 투자는 자기 자신에 대한 투자다.", author: "워런 버핏" },
  { text: "남들이 모르는 것을 알아야 돈을 벌 수 있다.", author: "하워드 막스" },
  { text: "리스크는 자신이 무엇을 하는지 모를 때 온다.", author: "워런 버핏" },
  { text: "훌륭한 기업을 공정한 가격에 사는 것이 공정한 기업을 훌륭한 가격에 사는 것보다 훨씬 낫다.", author: "워런 버핏" },
];

export function InvestorQuote() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % quotes.length);
        setFade(true);
      }, 400);
    }, 12000);
    return () => clearInterval(id);
  }, []);

  const quote = quotes[index];

  return (
    <div
      className="px-4 py-4 border-t transition-opacity duration-400"
      style={{ opacity: fade ? 1 : 0 }}
    >
      <p className="text-[11px] text-muted-foreground leading-relaxed italic">
        &ldquo;{quote.text}&rdquo;
      </p>
      <p className="mt-1.5 text-[11px] font-medium text-muted-foreground/70 text-right">
        — {quote.author}
      </p>
    </div>
  );
}
