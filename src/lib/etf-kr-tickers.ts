export interface EtfInfo {
  ticker: string;
  name: string;
  category: EtfCategory;
}

export type EtfCategory =
  | "지수"
  | "레버리지/인버스"
  | "반도체/IT"
  | "2차전지"
  | "바이오/헬스케어"
  | "금융/은행"
  | "에너지/화학"
  | "소비/유통"
  | "방산/항공"
  | "부동산/리츠"
  | "테마"
  | "해외"
  | "채권/배당";

export const ETF_CATEGORIES: EtfCategory[] = [
  "지수", "레버리지/인버스", "반도체/IT", "2차전지",
  "바이오/헬스케어", "금융/은행", "에너지/화학", "소비/유통",
  "방산/항공", "부동산/리츠", "테마", "해외", "채권/배당",
];

export const KR_ETF_LIST: EtfInfo[] = ([
  // ── 지수 ───────────────────────────────────────────────
  { ticker: "069500", name: "KODEX 200",                    category: "지수" },
  { ticker: "102110", name: "TIGER 200",                    category: "지수" },
  { ticker: "148020", name: "KINDEX 200",                   category: "지수" },
  { ticker: "152100", name: "ARIRANG 200",                  category: "지수" },
  { ticker: "278540", name: "KODEX MSCI Korea TR",          category: "지수" },
  { ticker: "233740", name: "KODEX 코스닥150",              category: "지수" },
  { ticker: "229200", name: "KODEX 코스닥150",              category: "지수" },
  { ticker: "261220", name: "KODEX 코스닥150인버스",        category: "지수" },
  { ticker: "396500", name: "KODEX MSCI 모멘텀액티브",      category: "지수" },
  { ticker: "396510", name: "KODEX MSCI 퀄리티액티브",      category: "지수" },
  { ticker: "396520", name: "KODEX MSCI 밸류액티브",        category: "지수" },
  { ticker: "458730", name: "KODEX 배당성장액티브",         category: "지수" },
  { ticker: "476040", name: "TIGER 코리아밸류업",           category: "지수" },
  { ticker: "478150", name: "TIGER 코리아밸류업액티브",     category: "지수" },

  // ── 레버리지/인버스 ────────────────────────────────────
  { ticker: "122630", name: "KODEX 레버리지",               category: "레버리지/인버스" },
  { ticker: "114800", name: "KODEX 인버스",                 category: "레버리지/인버스" },
  { ticker: "252670", name: "KODEX 200선물인버스2X",        category: "레버리지/인버스" },
  { ticker: "251340", name: "KODEX 코스닥150레버리지",      category: "레버리지/인버스" },
  { ticker: "245340", name: "KODEX 코스닥150선물인버스",    category: "레버리지/인버스" },
  { ticker: "243880", name: "KODEX Fn반도체레버리지",       category: "레버리지/인버스" },
  { ticker: "333940", name: "TIGER 200 선물레버리지",       category: "레버리지/인버스" },

  // ── 반도체/IT ──────────────────────────────────────────
  { ticker: "091160", name: "KODEX 반도체",                 category: "반도체/IT" },
  { ticker: "266360", name: "KODEX IT",                     category: "반도체/IT" },
  { ticker: "139220", name: "TIGER 200 IT",                 category: "반도체/IT" },
  { ticker: "157490", name: "TIGER 소프트웨어",             category: "반도체/IT" },
  { ticker: "364980", name: "TIGER 반도체",                 category: "반도체/IT" },
  { ticker: "315960", name: "KODEX 반도체TOP10",            category: "반도체/IT" },
  { ticker: "371466", name: "KINDEX 반도체TOP4",            category: "반도체/IT" },
  { ticker: "411060", name: "ACE 반도체",                   category: "반도체/IT" },
  { ticker: "394170", name: "ACE 글로벌반도체TOP4",         category: "반도체/IT" },
  { ticker: "453640", name: "KODEX AI반도체핵심장비",        category: "반도체/IT" },
  { ticker: "484570", name: "TIGER AI코리아그로스액티브",   category: "반도체/IT" },
  { ticker: "305540", name: "TIGER AI&로봇",                category: "반도체/IT" },
  { ticker: "261240", name: "KODEX K-게임",                 category: "반도체/IT" },
  { ticker: "266370", name: "KODEX 코스닥IT성장",           category: "반도체/IT" },
  { ticker: "396540", name: "KODEX AI테크",                 category: "반도체/IT" },
  { ticker: "476650", name: "TIGER AI반도체핵심공정",       category: "반도체/IT" },

  // ── 2차전지 ───────────────────────────────────────────
  { ticker: "305720", name: "KODEX 2차전지산업",            category: "2차전지" },
  { ticker: "418050", name: "TIGER 2차전지테마",            category: "2차전지" },
  { ticker: "381180", name: "KODEX 배터리산업",             category: "2차전지" },
  { ticker: "395490", name: "TIGER 2차전지&자동화",         category: "2차전지" },
  { ticker: "411900", name: "ACE 2차전지&전기차",           category: "2차전지" },
  { ticker: "438100", name: "HANARO 2차전지소재",           category: "2차전지" },
  { ticker: "448540", name: "SOL 2차전지소부장",            category: "2차전지" },

  // ── 바이오/헬스케어 ────────────────────────────────────
  { ticker: "244580", name: "KODEX 바이오",                 category: "바이오/헬스케어" },
  { ticker: "161510", name: "TIGER 헬스케어",               category: "바이오/헬스케어" },
  { ticker: "227550", name: "TIGER 의료기기",               category: "바이오/헬스케어" },
  { ticker: "365000", name: "TIGER 코스닥바이오",           category: "바이오/헬스케어" },
  { ticker: "385720", name: "KINDEX K-신약바이오",          category: "바이오/헬스케어" },
  { ticker: "394150", name: "ACE 헬스케어",                 category: "바이오/헬스케어" },
  { ticker: "448530", name: "SOL 바이오&헬스케어",          category: "바이오/헬스케어" },

  // ── 금융/은행 ─────────────────────────────────────────
  { ticker: "091170", name: "KODEX 은행",                   category: "금융/은행" },
  { ticker: "102970", name: "KODEX 증권",                   category: "금융/은행" },
  { ticker: "139260", name: "TIGER 200 금융",               category: "금융/은행" },
  { ticker: "211210", name: "KODEX 보험",                   category: "금융/은행" },
  { ticker: "243700", name: "TIGER 금융",                   category: "금융/은행" },

  // ── 에너지/화학 ───────────────────────────────────────
  { ticker: "139230", name: "TIGER 200 에너지화학",         category: "에너지/화학" },
  { ticker: "381170", name: "KODEX 원자력테마",             category: "에너지/화학" },
  { ticker: "409820", name: "KODEX K-신재생에너지",         category: "에너지/화학" },
  { ticker: "411540", name: "ACE 원자력",                   category: "에너지/화학" },
  { ticker: "459280", name: "TIGER 원자력테마",             category: "에너지/화학" },
  { ticker: "447770", name: "SOL 원자력",                   category: "에너지/화학" },
  { ticker: "102960", name: "KODEX 에너지화학",             category: "에너지/화학" },

  // ── 소비/유통 ─────────────────────────────────────────
  { ticker: "139270", name: "TIGER 200 생활소비재",         category: "소비/유통" },
  { ticker: "139280", name: "TIGER 200 경기소비재",         category: "소비/유통" },
  { ticker: "228790", name: "TIGER 화장품",                 category: "소비/유통" },
  { ticker: "192720", name: "KODEX 음식료",                 category: "소비/유통" },
  { ticker: "244620", name: "KODEX 미디어&엔터테인먼트",    category: "소비/유통" },
  { ticker: "169950", name: "TIGER 미디어콘텐츠",           category: "소비/유통" },
  { ticker: "371430", name: "HANARO K-POP&미디어",          category: "소비/유통" },

  // ── 방산/항공 ─────────────────────────────────────────
  { ticker: "140710", name: "KODEX 운송",                   category: "방산/항공" },
  { ticker: "139240", name: "TIGER 200 중공업",             category: "방산/항공" },
  { ticker: "139250", name: "TIGER 200 건설",               category: "방산/항공" },
  { ticker: "425040", name: "KODEX K-방산",                 category: "방산/항공" },
  { ticker: "443450", name: "TIGER K-방산&우주",            category: "방산/항공" },
  { ticker: "449450", name: "ACE 방산&우주",                category: "방산/항공" },
  { ticker: "476550", name: "HANARO K-방산",                category: "방산/항공" },

  // ── 부동산/리츠 ───────────────────────────────────────
  { ticker: "352560", name: "TIGER 부동산인프라고배당",     category: "부동산/리츠" },
  { ticker: "395160", name: "TIGER 미국리츠부동산",         category: "부동산/리츠" },
  { ticker: "432320", name: "KODEX 한국부동산리츠인프라",   category: "부동산/리츠" },

  // ── 테마 ──────────────────────────────────────────────
  { ticker: "292150", name: "TIGER 차이나전기차",           category: "테마" },
  { ticker: "287310", name: "KODEX 혁신기술테마액티브",     category: "테마" },
  { ticker: "381760", name: "TIGER 글로벌리튬&2차전지",     category: "테마" },
  { ticker: "396530", name: "KODEX 탄소효율그린뉴딜",       category: "테마" },
  { ticker: "441640", name: "TIGER 로봇&AI",               category: "테마" },
  { ticker: "456600", name: "KODEX 로봇",                   category: "테마" },
  { ticker: "472580", name: "TIGER 조선&해운",              category: "테마" },
  { ticker: "480480", name: "KODEX 조선해운",               category: "테마" },

  // ── 해외 ──────────────────────────────────────────────
  { ticker: "133690", name: "TIGER 미국S&P500",             category: "해외" },
  { ticker: "381180", name: "KODEX 미국S&P500TR",           category: "해외" },
  { ticker: "360750", name: "TIGER 미국나스닥100",          category: "해외" },
  { ticker: "379800", name: "KODEX 미국나스닥100TR",        category: "해외" },
  { ticker: "395160", name: "TIGER 미국필라델피아반도체나스닥", category: "해외" },
  { ticker: "192090", name: "TIGER 차이나CSI300",           category: "해외" },
  { ticker: "195930", name: "TIGER 유로스탁스50",           category: "해외" },
  { ticker: "251350", name: "KODEX 선진국MSCI World",       category: "해외" },
  { ticker: "241180", name: "TIGER 일본니케이225",          category: "해외" },
  { ticker: "459260", name: "TIGER 인도니프티50",           category: "해외" },
  { ticker: "441680", name: "ACE 미국빅테크TOP7 Plus",      category: "해외" },
  { ticker: "453810", name: "TIGER 미국AI빅테크10",         category: "해외" },

  // ── 채권/배당 ─────────────────────────────────────────
  { ticker: "114260", name: "KODEX 국고채3년",              category: "채권/배당" },
  { ticker: "148070", name: "KOSEF 국고채10년",             category: "채권/배당" },
  { ticker: "308180", name: "TIGER 미국채10년선물",         category: "채권/배당" },
  { ticker: "280930", name: "TIGER 미국채10년선물",         category: "채권/배당" },
  { ticker: "364990", name: "TIGER 단기통안채",             category: "채권/배당" },
  { ticker: "385560", name: "KODEX 고배당",                 category: "채권/배당" },
  { ticker: "211560", name: "TIGER 배당성장",               category: "채권/배당" },
  { ticker: "227830", name: "KODEX 배당가치",               category: "채권/배당" },
] as EtfInfo[]).filter((v, i, a) => a.findIndex(x => x.ticker === v.ticker) === i);
