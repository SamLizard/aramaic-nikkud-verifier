// ─── General helpers ─────────────────────────────────────────────────────────

export const rowsToCSV = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) return "";
  const allKeys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const text = String(v ?? "");
    return text.includes(",") || text.includes("\n")
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  return [
    allKeys.join(","),
    ...rows.map((row) => allKeys.map((key) => escape(row[key])).join(",")),
  ].join("\n");
};

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
