"use client";

import { useState, useEffect, useCallback } from "react";
import { getStoredToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Partner {
  empno: string;
  name: string;
  departments: string[];
  scope: string;
  scope_departments: string;
}

export default function AdminPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingEmpno, setEditingEmpno] = useState<string | null>(null);
  const [editScope, setEditScope] = useState("self");
  const [editDepts, setEditDepts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const headers = useCallback((): Record<string, string> => {
    const token = getStoredToken();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pRes, dRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/admin/partners`, { headers: headers() }),
        fetch(`${API_BASE}/api/v1/admin/departments`, { headers: headers() }),
      ]);
      if (!pRes.ok) {
        const d = await pRes.json().catch(() => ({}));
        throw new Error(d.detail || "권한이 없습니다.");
      }
      setPartners(await pRes.json());
      if (dRes.ok) setAllDepts(await dRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (p: Partner) => {
    setEditingEmpno(p.empno);
    setEditScope(p.scope);
    setEditDepts(p.scope_departments ? p.scope_departments.split(",") : []);
  };

  const cancelEdit = () => {
    setEditingEmpno(null);
    setEditScope("self");
    setEditDepts([]);
  };

  const saveConfig = async () => {
    if (!editingEmpno) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/partners/${editingEmpno}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({
          scope: editScope,
          departments: editScope === "departments" ? editDepts.join(",") : "",
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setPartners((prev) =>
        prev.map((p) =>
          p.empno === editingEmpno
            ? { ...p, scope: editScope, scope_departments: editScope === "departments" ? editDepts.join(",") : "" }
            : p
        )
      );
      setEditingEmpno(null);
    } catch {
      alert("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  };

  const toggleDept = (dept: string) => {
    setEditDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const filtered = partners.filter(
    (p) => p.name.includes(search) || p.empno.includes(search)
  );

  const scopeLabel = (scope: string, depts: string) => {
    if (scope === "all") return "전체";
    if (scope === "departments") return `본부: ${depts || "-"}`;
    return "본인만";
  };

  if (loading) return <div className="p-6 text-sm text-pwc-gray-600">로딩 중...</div>;
  if (error) return (
    <div className="p-6">
      <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-pwc-red">{error}</div>
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <h2 className="text-lg font-bold text-pwc-black">파트너 접근 권한 관리</h2>
      <p className="text-xs text-pwc-gray-600">
        각 파트너가 로그인 시 조회할 수 있는 데이터 범위를 설정합니다.
      </p>

      <input
        type="text"
        placeholder="파트너 이름 또는 사번 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md px-3 py-2 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
      />

      <div className="bg-white rounded-lg border border-pwc-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pwc-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600 w-[80px]">사번</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600 w-[100px]">이름</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600">소속 본부</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600 w-[200px]">접근 범위</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-pwc-gray-600 w-[100px]">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const isEditing = editingEmpno === p.empno;
              return (
                <tr key={p.empno} className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs">{p.empno}</td>
                  <td className="px-4 py-2.5 text-xs font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{p.departments.join(", ")}</td>
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <div className="space-y-2">
                        <select
                          value={editScope}
                          onChange={(e) => setEditScope(e.target.value)}
                          className="w-full text-xs border border-pwc-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-pwc-orange"
                        >
                          <option value="self">본인만</option>
                          <option value="departments">특정 본부</option>
                          <option value="all">전체</option>
                        </select>
                        {editScope === "departments" && (
                          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-2 bg-pwc-gray-50 rounded border border-pwc-gray-100">
                            {allDepts.map((dept) => (
                              <button
                                key={dept}
                                onClick={() => toggleDept(dept)}
                                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                                  editDepts.includes(dept)
                                    ? "bg-pwc-orange text-white border-pwc-orange"
                                    : "bg-white text-pwc-gray-600 border-pwc-gray-200 hover:border-pwc-orange"
                                }`}
                              >
                                {dept}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        p.scope === "all" ? "bg-blue-50 text-blue-700" :
                        p.scope === "departments" ? "bg-orange-50 text-pwc-orange" :
                        "bg-pwc-gray-50 text-pwc-gray-600"
                      }`}>
                        {scopeLabel(p.scope, p.scope_departments)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={saveConfig}
                          disabled={saving}
                          className="px-2.5 py-1 text-[11px] font-medium bg-pwc-orange text-white rounded hover:bg-pwc-orange-light transition-colors disabled:opacity-50"
                        >
                          {saving ? "..." : "저장"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2.5 py-1 text-[11px] font-medium border border-pwc-gray-200 text-pwc-gray-600 rounded hover:bg-pwc-gray-50 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(p)}
                        className="px-3 py-1 text-[11px] font-medium border border-pwc-black text-pwc-black rounded hover:bg-pwc-black hover:text-white transition-colors"
                      >
                        설정
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
