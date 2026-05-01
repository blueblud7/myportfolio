import { decryptNum, tryDecrypt } from "./crypto";

export interface HoldingEncFields {
  quantity?: number | null;
  quantity_enc?: string | null;
  avg_cost?: number | null;
  avg_cost_enc?: string | null;
  manual_price?: number | null;
  manual_price_enc?: string | null;
  note?: string | null;
  note_enc?: string | null;
}

/**
 * holdings 행에서 암호화된 숫자/텍스트 필드를 복호화한 새 객체 반환.
 * _enc 컬럼이 있으면 그쪽 우선, 없으면 평문 fallback.
 */
export function decryptHoldingFields<T extends HoldingEncFields>(row: T): T {
  return {
    ...row,
    quantity: row.quantity_enc ? (decryptNum(row.quantity_enc) ?? 0) : (row.quantity ?? 0),
    avg_cost: row.avg_cost_enc ? (decryptNum(row.avg_cost_enc) ?? 0) : (row.avg_cost ?? 0),
    manual_price: row.manual_price_enc ? decryptNum(row.manual_price_enc) : (row.manual_price ?? null),
    note: row.note_enc ? tryDecrypt(row.note_enc) : (row.note ?? null),
  };
}
