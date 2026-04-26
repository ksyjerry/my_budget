"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface BudgetProject {
  project_code: string;
  project_name: string;
  el_name: string;
  pm_name: string;
  template_status: string;
  contract_hours: number;
}

export default function BudgetInputPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [allProjects, setAllProjects] = useState<BudgetProject[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/budget/projects/list`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAllProjects(
          data.map((p: Record<string, unknown>) => ({
            project_code: p.project_code,
            project_name: p.project_name || "",
            el_name: p.el_name || "",
            pm_name: p.pm_name || "",
            template_status: (p.template_status as string) || "작성중",
            contract_hours: (p.contract_hours as number) || 0,
          }))
        );
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleDelete = async (projectCode: string, projectName: string) => {
    if (!confirm(`"${projectName}" 프로젝트를 삭제하시겠습니까?\n구성원 및 Budget 데이터도 모두 삭제됩니다.`)) return;
    setDeleting(projectCode);
    try {
      const res = await fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        alert(`삭제 실패: ${d.detail || "오류"}`);
        return;
      }
      setAllProjects((prev) => prev.filter((p) => p.project_code !== projectCode));
    } catch {
      alert("삭제 중 오류 발생");
    } finally {
      setDeleting(null);
    }
  };

  const lc = search.toLowerCase();
  const filtered = allProjects.filter((p) => {
    if (statusFilter && p.template_status !== statusFilter) return false;
    if (!lc) return true;
    return (
      p.project_name.toLowerCase().includes(lc) ||
      p.project_code.toLowerCase().includes(lc) ||
      p.el_name.toLowerCase().includes(lc) ||
      p.pm_name.toLowerCase().includes(lc)
    );
  });


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-pwc-black">Budget 입력</h2>
        <Link
          href="/budget-input/new"
          className="px-4 py-2 text-sm font-medium bg-pwc-orange text-white rounded hover:bg-pwc-orange-light transition-colors"
        >
          + 신규 프로젝트
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="프로젝트명, 코드, EL/PM명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
        >
          <option value="">전체 상태</option>
          <option value="작성중">작성중</option>
          <option value="작성완료">작성완료</option>
          <option value="승인완료">승인완료</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-pwc-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pwc-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600">Project Code</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600">프로젝트명</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600">EL</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600">PM</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-pwc-gray-600">계약시간</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-pwc-gray-600">작성상태</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-pwc-gray-600">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.project_code} className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs">{p.project_code}</td>
                <td className="px-4 py-2.5">{p.project_name}</td>
                <td className="px-4 py-2.5">{p.el_name}</td>
                <td className="px-4 py-2.5">{p.pm_name}</td>
                <td className="px-4 py-2.5 text-right">{p.contract_hours.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    p.template_status === "승인완료"
                      ? "bg-blue-50 text-blue-700"
                      : p.template_status === "작성완료"
                      ? "bg-green-50 text-pwc-green"
                      : "bg-yellow-50 text-pwc-orange"
                  }`}>
                    {p.template_status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link
                      href={`/budget-input/${p.project_code}`}
                      className="px-3 py-1 text-xs font-medium border border-pwc-black text-pwc-black rounded hover:bg-pwc-black hover:text-white transition-colors"
                    >
                      편집
                    </Link>
                    <button
                      onClick={() => handleDelete(p.project_code, p.project_name)}
                      disabled={deleting === p.project_code}
                      className="px-3 py-1 text-xs font-medium border border-pwc-red text-pwc-red rounded hover:bg-pwc-red hover:text-white transition-colors disabled:opacity-50"
                    >
                      {deleting === p.project_code ? "..." : "삭제"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
