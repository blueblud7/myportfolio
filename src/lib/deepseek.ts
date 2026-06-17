import OpenAI from "openai";

/**
 * DeepSeek는 OpenAI 호환 API → 동일 SDK에 baseURL만 교체해 재사용.
 * 에이전트 모드(멀티스텝 도구 호출) 전용 상위 모델.
 * 모델 ID는 환경변수로 교체 가능(선택 모델이 function calling 미지원이면 tool-capable 모델로 변경).
 */
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

export function isDeepSeekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

let _client: OpenAI | null = null;
export function getDeepSeek(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return _client;
}
