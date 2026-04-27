"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function ProjectSearchModal({
  onSelect,
  onClose,
  clientCode,
}: {
  onSelect: (p: Record<string, unknown>) => void;
  onClose: () => void;
  clientCode?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResults = async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientCode) params.set("client_code", clientCode);
      if (q) params.set("q", q);
      const res = await fetch(
        `${API_BASE}/api/v1/budget/projects/search?${params.toString()}`
      );
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCode]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    fetchResults(val);
  };

  const infoText = clientCode
    ? "선택한 클라이언트에 속한 프로젝트 목록입니다. 클릭하여 선택하세요."
    : "프로젝트 코드 또는 이름으로 검색하세요. 클라이언트 미선택 시 등록된 프로젝트가 표시됩니다.";

  return (
    <div role="dialog" aria-modal="true" data-modal="project-search" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[750px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-pwc-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-pwc-black">프로젝트 선택</h3>
          <button onClick={onClose} className="text-pwc-gray-600 hover:text-pwc-black text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 shrink-0">
          {infoText}
        </div>
        <div className="px-5 py-2 border-b border-pwc-gray-100 shrink-0">
          <input
            type="search"
            placeholder="프로젝트 코드 또는 이름 검색"
            value={query}
            onChange={handleSearch}
            className="w-full px-3 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
          />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-pwc-gray-600">불러오는 중...</div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-pwc-gray-600">
              {clientCode ? "해당 클라이언트의 프로젝트가 없습니다." : "검색 결과가 없습니다."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-pwc-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">코드</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">프로젝트명</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">EL</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">PM</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-pwc-gray-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr
                    key={p.project_code as string}
                    data-row="project"
                    className="border-t border-pwc-gray-100 cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => { onSelect(p); onClose(); }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{p.project_code as string}</td>
                    <td className="px-4 py-2.5">{p.project_name as string}</td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{p.el_name as string}</td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{p.pm_name as string}</td>
                    <td className="px-4 py-2.5 text-center">
                      {p.is_registered ? (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-700">등록됨</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500">미등록</span>
                      )}
                    </td>
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
