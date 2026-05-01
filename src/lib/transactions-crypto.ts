import { decryptNum, tryDecrypt } from "./crypto";

export interface TransactionEncFields {
  quantity?: number | null;
  quantity_enc?: string | null;
  price?: number | null;
  price_enc?: string | null;
  fees?: number | null;
  fees_enc?: string | null;
  total_amount?: number | null;
  total_amount_enc?: string | null;
  note?: string | null;
  note_enc?: string | null;
}

export function decryptTransactionFields<T extends TransactionEncFields>(row: T): T {
  return {
    ...row,
    quantity:     row.quantity_enc     ? (decryptNum(row.quantity_enc)     ?? 0) : (row.quantity     ?? 0),
    price:        row.price_enc        ? (decryptNum(row.price_enc)        ?? 0) : (row.price        ?? 0),
    fees:         row.fees_enc         ? (decryptNum(row.fees_enc)         ?? 0) : (row.fees         ?? 0),
    total_amount: row.total_amount_enc ? (decryptNum(row.total_amount_enc) ?? 0) : (row.total_amount ?? 0),
    note:         row.note_enc         ? tryDecrypt(row.note_enc)               : (row.note         ?? null),
  };
}
