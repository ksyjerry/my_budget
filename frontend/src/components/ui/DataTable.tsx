"use client";

import { useState } from "react";

interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  maxHeight?: string;
  onRowClick?: (row: T, index: number) => void;
  isRowHighlighted?: (row: T) => boolean;
  isRowDimmed?: (row: T) => boolean;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  maxHeight = "400px",
  onRowClick,
  isRowHighlighted,
  isRowDimmed,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDir === "asc" ? aVal - bVal : bVal - aVal;
        }
        return sortDir === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      })
    : data;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div
      className="overflow-auto border border-pwc-gray-100 rounded-lg"
      style={{ maxHeight }}
    >
      <table className="w-full text-sm">
        <thead className="bg-pwc-gray-50 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-xs font-semibold text-pwc-gray-600 cursor-pointer hover:text-pwc-black whitespace-nowrap ${
                  col.align === "right" ? "text-right" : "text-left"
                }`}
                style={{ width: col.width }}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const highlighted = isRowHighlighted?.(row) ?? false;
            const dimmed = isRowDimmed?.(row) ?? false;

            return (
              <tr
                key={i}
                className={`border-t border-pwc-gray-100 transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                } ${
                  highlighted
                    ? "bg-orange-50 border-l-2 border-l-[#D04A02]"
                    : "hover:bg-pwc-gray-50"
                }`}
                style={{ opacity: dimmed ? 0.3 : 1 }}
                onClick={() => onRowClick?.(row, i)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
