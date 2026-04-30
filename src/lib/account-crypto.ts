import { tryDecrypt } from "./crypto";

/**
 * accounts 행 또는 JOIN된 결과에서 account 이름을 안전하게 가져옴.
 * name_enc(암호문) 우선, 실패하거나 없으면 name(평문) fallback.
 */
export function decryptAccountName(row: {
  name?: string | null;
  name_enc?: string | null;
} | undefined | null): string {
  if (!row) return "";
  if (row.name_enc) {
    const dec = tryDecrypt(row.name_enc);
    if (dec !== null) return dec;
  }
  return row.name ?? "";
}

/**
 * JOIN된 결과 (a.name as account_name, a.name_enc as account_name_enc)에서 추출.
 */
export function decryptJoinedAccountName(row: {
  account_name?: string | null;
  account_name_enc?: string | null;
} | undefined | null): string {
  if (!row) return "";
  if (row.account_name_enc) {
    const dec = tryDecrypt(row.account_name_enc);
    if (dec !== null) return dec;
  }
  return row.account_name ?? "";
}
