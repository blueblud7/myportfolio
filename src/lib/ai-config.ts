/**
 * AI 모델 기본 설정 — 모든 OpenAI 호출이 여기를 통과
 *
 * gpt-5-nano는 reasoning model이라 그냥 쓰면 reasoning 토큰이 max_completion_tokens를
 * 다 먹어서 출력이 빈 문자열로 나오는 케이스가 잦음.
 * reasoning_effort: "minimal"로 reasoning을 최소화해서 안정적으로 출력 확보.
 */
export const DEFAULT_MODEL = "gpt-5-nano";

/**
 * 기본 chat.completions.create 설정.
 * 호출처에서 messages, response_format 등 추가하면 됨.
 */
export const DEFAULT_AI_PARAMS = {
  model: DEFAULT_MODEL,
  reasoning_effort: "minimal" as const,
  // gpt-5는 max_completion_tokens (max_tokens는 deprecated)
  max_completion_tokens: 4000,
};

/**
 * JSON 출력용 (response_format 추가 + 토큰 약간 늘림)
 */
export const DEFAULT_AI_PARAMS_JSON = {
  ...DEFAULT_AI_PARAMS,
  response_format: { type: "json_object" as const },
  max_completion_tokens: 4000,
};
