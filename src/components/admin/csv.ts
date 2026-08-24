'use client';

/**
 * CSV export.
 *
 * The event's paper trail leaves the platform through here — the official
 * results and the points ledger — so the numbers can be checked against the
 * referee's sheet the morning after without anyone reading JSON.
 */

export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Quote a cell for RFC 4180.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote character as well:
 * spreadsheet software treats those as the start of a formula, and a player
 * name is not a formula.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => cell(column.label)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => cell(column.value(row))).join(','),
  );
  // CRLF: Excel on Windows still wants it, and everything else tolerates it.
  return [header, ...body].join('\r\n');
}

/** Hand a generated CSV to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel read the file as UTF-8 rather than as Latin-1.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in Safari; a tick is enough.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `swanlake-results-2026-08-27.csv` */
export function stampedFilename(base: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `${base}-${stamp}.csv`;
}
