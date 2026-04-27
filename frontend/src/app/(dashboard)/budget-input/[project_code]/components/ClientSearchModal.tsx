"use client";

import { useState } from "react";
import type { ClientInfo } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function ClientSearchModal({
  onSelect,
  onClose,
}: {
  onSelect: (c: ClientInfo) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientInfo[]>([]);
  const [searching, setSearching] = useState(false);

  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/budget/clients/search?q=${encodeURIComponent(query.trim())}`
      );
      if (res.ok) setResults(await res.json());
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-pwc-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-pwc-black">클라이언트 검색</h3>
          <button onClick={onClose} className="text-pwc-gray-600 hover:text-pwc-black text-lg leading-none">&times;</button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-pwc-gray-100 shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); doSearch(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="클라이언트명을 입력하세요"
              className="flex-1 px-3 py-2 text-sm border border-pwc-gray-200 rounded-lg focus:outline-none focus:border-pwc-orange"
              autoFocus
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="px-4 py-2 text-sm font-medium bg-pwc-orange text-white rounded-lg hover:bg-[#B83D02] transition-colors disabled:opacity-50"
            >
              {searching ? "검색중..." : "검색"}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!searched ? (
            <div className="px-5 py-8 text-center text-sm text-pwc-gray-600">
              검색어를 입력하고 검색 버튼을 클릭하세요.
            </div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-pwc-gray-600">
              {searching ? "검색 중..." : "검색 결과가 없습니다."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-pwc-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">코드</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">클라이언트명</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">산업</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">상장</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => (
                  <tr
                    key={c.client_code}
                    className="border-t border-pwc-gray-100 cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => { onSelect(c); onClose(); }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{c.client_code}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span>{c.client_name}</span>
                        {c.needs_detail && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pwc-gray-100 text-pwc-gray-600">
                            정보 미입력
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{c.industry}</td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{c.listing_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
