export function downloadCsv(filename: string, rows: object[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv =
    headers.join(",") +
    "\n" +
    rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function holdingsToCsv(holdings: object[]) {
  return holdings;
}

export function transactionsToCsv(transactions: object[]) {
  return transactions;
}
