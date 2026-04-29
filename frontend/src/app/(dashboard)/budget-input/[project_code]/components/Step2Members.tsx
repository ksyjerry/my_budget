"use client";

import { useState, useEffect, useRef } from "react";
import { gradeRank } from "@/lib/grade";
import type { Member } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── Employee Search Autocomplete ─────────────────────────
function EmployeeSearch({
  value,
  empno,
  onSelect,
}: {
  value: string;
  empno: string;
  onSelect: (name: string, empno: string, grade?: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<{ empno: string; name: string; grade: string; team_name?: string; department?: string; emp_status?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/budget/employees/search?q=${encodeURIComponent(q)}&include_inactive=true`);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (v: string) => {
    setQuery(v);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 250);
  };

  const display = empno && value ? `${value}(${empno})` : value;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : display}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { setQuery(value); setOpen(true); if (value) doSearch(value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results.length > 0) {
            e.preventDefault();
            const r = results[0];
            if (r.emp_status && r.emp_status !== "재직") {
              alert(`사번 ${r.empno} 은(는) 현재 재직 중인 직원이 아닙니다. 퇴사/휴직 상태입니다.`);
              setQuery("");
              setResults([]);
              setOpen(false);
              return;
            }
            onSelect(r.name, r.empno, r.grade);
            setQuery(r.name);
            setOpen(false);
          }
        }}
        placeholder="이름 검색"
        className="w-full px-2 py-1 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-pwc-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.empno}
              className="px-3 py-2 text-sm hover:bg-orange-50 cursor-pointer flex justify-between"
              onClick={() => {
                if (r.emp_status && r.emp_status !== "재직") {
                  alert(`사번 ${r.empno} 은(는) 현재 재직 중인 직원이 아닙니다. 퇴사/휴직 상태입니다.`);
                  return;
                }
                onSelect(r.name, r.empno, r.grade);
                setQuery(r.name);
                setOpen(false);
              }}
            >
              <span>{r.name}<span className="text-pwc-gray-600 ml-1">({r.empno})</span></span>
              <span className="text-xs text-pwc-gray-600 flex gap-2">
                <span>{r.grade}</span>
                {(r.team_name || r.department) && (
                  <span className="text-pwc-gray-600">{r.team_name || r.department}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && loading && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-pwc-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-pwc-gray-600">
          검색 중...
        </div>
      )}
    </div>
  );
}

// ── Step2Members ─────────────────────────────────────────

interface Step2MembersProps {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  addMember: (role: string) => void;
  removeMember: (idx: number) => void;
  updateMember: (idx: number, field: keyof Member, value: string | number) => void;
  activityOptions: string[];
}

export function Step2Members({
  members,
  setMembers,
  addMember,
  removeMember,
  updateMember,
  activityOptions,
}: Step2MembersProps) {
  // 원본 index 를 보존한 채 grade 순으로 정렬 (state 업데이트는 originalIdx 사용)
  const sortedFldt = members
    .map((m, originalIdx) => ({ m, originalIdx }))
    .filter(({ m }) => m.role === "FLDT 구성원")
    .sort((a, b) => gradeRank(a.m.grade) - gradeRank(b.m.grade));
  const sortedSupport = members
    .map((m, originalIdx) => ({ m, originalIdx }))
    .filter(({ m }) => m.role === "지원 ET 구성원")
    .sort((a, b) => gradeRank(a.m.grade) - gradeRank(b.m.grade));
  const fldtMembers = sortedFldt.map(({ m }) => m);
  const supportMembers = sortedSupport.map(({ m }) => m);

  return (
    <div className="space-y-6">
      {/* FLDT 구성원 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">FLDT 구성원</h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => addMember("FLDT 구성원")}
              className="px-3 py-1 text-xs font-medium border border-pwc-black rounded hover:bg-pwc-black hover:text-white transition-colors"
            >
              + 구성원 추가
            </button>
            <button
              onClick={() => {
                setMembers((prev) => [
                  ...prev,
                  { role: "FLDT 구성원", name: "TBD", empno: "", grade: "", activity_mapping: "재무제표기말감사", sort_order: prev.length },
                ]);
              }}
              className="px-2 py-1 text-xs font-medium border border-pwc-gray-200 rounded hover:bg-pwc-gray-50 text-pwc-gray-900 transition-colors"
              title="미정 구성원 (TBD) 추가"
            >
              + TBD
            </button>
            <button
              onClick={() => {
                setMembers((prev) => [
                  ...prev,
                  { role: "FLDT 구성원", name: "NS", empno: "", grade: "", activity_mapping: "재무제표기말감사", sort_order: prev.length },
                ]);
              }}
              className="px-2 py-1 text-xs font-medium border border-pwc-gray-200 rounded hover:bg-pwc-gray-50 text-pwc-gray-900 transition-colors"
              title="New Step 구성원 추가"
            >
              + NS
            </button>
            <button
              onClick={() => {
                setMembers((prev) => [
                  ...prev,
                  { role: "FLDT 구성원", name: "Associate", empno: "", grade: "", activity_mapping: "재무제표기말감사", sort_order: prev.length },
                ]);
              }}
              className="px-2 py-1 text-xs font-medium border border-pwc-gray-200 rounded hover:bg-pwc-gray-50 text-pwc-gray-900 transition-colors"
              title="Associate 구성원 추가"
            >
              + Associate
            </button>
          </div>
        </div>
        {fldtMembers.length === 0 ? (
          <p className="text-xs text-pwc-gray-600 py-4 text-center">
            FLDT 구성원을 추가해주세요.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-pwc-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600 w-8">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">
                  성명(사번)
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600 w-20">
                  직급
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">
                  Activity 매핑
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-pwc-gray-600 w-16">
                  삭제
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFldt.map(({ m, originalIdx: idx }, i) => {
                return (
                  <tr
                    key={idx}
                    className="border-t border-pwc-gray-100"
                  >
                    <td className="px-3 py-1.5 text-xs text-pwc-gray-600">
                      {i + 1}
                    </td>
                    <td className="px-3 py-1.5">
                      <EmployeeSearch
                        value={m.name}
                        empno={m.empno}
                        onSelect={(name, empno, grade) => {
                          updateMember(idx, "name", name);
                          updateMember(idx, "empno", empno);
                          if (grade) updateMember(idx, "grade", grade);
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-pwc-gray-600">
                      {m.grade || "-"}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={m.activity_mapping}
                        onChange={(e) =>
                          updateMember(idx, "activity_mapping", e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
                      >
                        <option value="">(선택)</option>
                        {activityOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => removeMember(idx)}
                        className="text-pwc-red hover:text-red-700 text-xs"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 지원 ET 구성원 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">
            지원 ET 구성원 (Fulcrum, RA, Specialist)
          </h3>
          <button
            onClick={() => addMember("지원 ET 구성원")}
            className="px-3 py-1 text-xs font-medium border border-pwc-black rounded hover:bg-pwc-black hover:text-white transition-colors"
          >
            + 지원 구성원 추가
          </button>
        </div>
        {supportMembers.length === 0 ? (
          <p className="text-xs text-pwc-gray-600 py-4 text-center">
            지원 구성원을 추가해주세요.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-pwc-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600 w-8">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">
                  성명(사번)
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600 w-20">
                  직급
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">
                  Activity 매핑
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-pwc-gray-600 w-16">
                  삭제
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSupport.map(({ m, originalIdx: idx }, i) => {
                return (
                  <tr
                    key={idx}
                    className="border-t border-pwc-gray-100"
                  >
                    <td className="px-3 py-1.5 text-xs text-pwc-gray-600">
                      {i + 1}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={m.name}
                        onChange={(e) => {
                          updateMember(idx, "name", e.target.value);
                          updateMember(idx, "empno", e.target.value);
                        }}
                        className="w-full px-2 py-1 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
                      >
                        <option value="">(선택)</option>
                        <option value="Fulcrum">Fulcrum</option>
                        <option value="RA-Staff">RA-Staff</option>
                        <option value="Specialist">Specialist</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-pwc-gray-600">
                      {m.grade || "-"}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={m.activity_mapping}
                        onChange={(e) =>
                          updateMember(idx, "activity_mapping", e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
                      >
                        <option value="">(선택)</option>
                        {activityOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => removeMember(idx)}
                        className="text-pwc-red hover:text-red-700 text-xs"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
