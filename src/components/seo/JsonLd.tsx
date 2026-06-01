// 구조화 데이터(JSON-LD) 렌더러 — 서버 컴포넌트
// data 하나 또는 배열을 받아 각각 <script type="application/ld+json">로 출력
type JsonLdData = Record<string, unknown>;

export default function JsonLd({
  data,
}: {
  readonly data: JsonLdData | readonly JsonLdData[];
}) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
