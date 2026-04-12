"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getStoredToken } from "@/lib/auth";
import FilterBar from "@/components/filters/FilterBar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface FilterOption {
  value: string;
  label: string;
}
interface FilterOptions {
  projects: FilterOption[];
  els: FilterOption[];
  pms: FilterOption[];
  departments: FilterOption[];
}

interface TrackingProject {
  project_code: string;
  project_name: string;
  el_name: string;
  pm_name: string;
  year_month: string;
  revenue: number;
  budget_hours: number;
  actual_hours: number;
  std_cost: number;
  em: number;
  progress_hours: number;
  progress_cost: number;
}

interface MonthlyRow {
  year_month: string;
  revenue: number;
  budget_hours: number;
  actual_hours: number;
  std_cost: number;
  em: number;
}

interface KPI {
  total_revenue: number;
  total_budget_hours: number;
  total_actual_hours: number;
  total_std_cost: number;
  total_em: number;
  em_margin: number;
  project_count: number;
  year_month?: string;
}

function fmtSync(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function fmtKRW(v: number): string {
  if (v === 0) return "-";
  const abs = Math.abs(v);
  if (abs >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return v.toLocaleString();
}

function fmtHours(v: number): string {
  if (v === 0) return "-";
  return Math.round(v).toLocaleString();
}

function ProgressBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-pwc-gray-600">-</span>;
  let color = "text-pwc-green";
  if (value > 110) color = "text-pwc-red";
  else if (value > 90) color = "text-pwc-orange";
  return <span className={`font-semibold ${color}`}>{value.toFixed(0)}%</span>;
}

function EmCell({ value }: { value: number }) {
  if (value === 0) return <span className="text-pwc-gray-600">-</span>;
  const color = value < 0 ? "text-pwc-red" : "text-pwc-green";
  return <span className={`font-semibold ${color}`}>{fmtKRW(value)}</span>;
}

export default function BudgetTrackingPage() {
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [projects, setProjects] = useState<TrackingProject[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);

  // Filters
  const [availableYms, setAvailableYms] = useState<string[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterYm, setFilterYm] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterEl, setFilterEl] = useState("");
  const [filterPm, setFilterPm] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterOpts, setFilterOpts] = useState<FilterOptions>({
    projects: [],
    els: [],
    pms: [],
    departments: [],
  });

  // Load filter options + admin check on mount
  useEffect(() => {
    const load = async () => {
      try {
        const token = getStoredToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const [optsRes, accessRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/tracking/filter-options`, { headers }),
          fetch(`${API_BASE}/api/v1/tracking/access`, { headers }),
        ]);
        if (optsRes.ok) {
          setFilterOpts(await optsRes.json());
        }
        if (accessRes.ok) {
          const accessData = await accessRes.json();
          setIsAdmin(accessData.scope === "all");
        }
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const handleSync = async () => {
    if (!confirm("Azure TBA 데이터를 새로 동기화합니다. 약 20~30초 소요됩니다.")) return;
    setSyncing(true);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/v1/tracking/sync`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`동기화 실패: ${err.detail || "오류"}`);
        return;
      }
      const data = await res.json();
      alert(`동기화 완료: ${data.synced.toLocaleString()}건 (${data.elapsed_sec}초)`);
      await loadTracking();
    } finally {
      setSyncing(false);
    }
  };

  const loadTracking = useCallback(async () => {
    setLoading(true);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const params = new URLSearchParams();
      if (filterYm) params.set("year_month", filterYm);
      if (filterProject) params.set("project_code", filterProject);
      if (filterEl) params.set("el_empno", filterEl);
      if (filterPm) params.set("pm_empno", filterPm);
      if (filterDept) params.set("department", filterDept);

      const url = `${API_BASE}/api/v1/tracking/projects${params.toString() ? "?" + params : ""}`;
      const res = await fetch(url, { headers });
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setKpi(data.kpi);
      setProjects(data.projects || []);
      if (Array.isArray(data.year_months)) setAvailableYms(data.year_months);
      if (data.last_sync !== undefined) setLastSync(data.last_sync);
    } finally {
      setLoading(false);
    }
  }, [filterYm, filterProject, filterEl, filterPm, filterDept]);

  useEffect(() => {
    loadTracking();
  }, [loadTracking]);

  useEffect(() => {
    if (!selectedCode) {
      setMonthly([]);
      return;
    }
    const load = async () => {
      try {
        const token = getStoredToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/v1/tracking/projects/${selectedCode}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        setMonthly(data.monthly || []);
      } catch {
        /* ignore */
      }
    };
    load();
  }, [selectedCode]);

  if (accessDenied) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-pwc-red">
          이 페이지는 Partner 권한이 있는 사용자만 접근할 수 있습니다.
        </div>
      </div>
    );
  }

  // Year-month options for FilterBar
  const ymOptions = useMemo(() => {
    return availableYms.map((ym) => ({
      value: ym,
      label: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
    }));
  }, [availableYms]);

  return (
    <div className="p-6 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-pwc-black">Budget Tracking</h2>
          <p className="text-xs text-pwc-gray-600 mt-0.5">
            담당 프로젝트의 Revenue vs Cost vs Engagement Margin 추적
            {kpi?.year_month && (
              <span className="ml-2 text-pwc-orange font-semibold">
                기준: {kpi.year_month.slice(0, 4)}-{kpi.year_month.slice(4, 6)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-pwc-gray-600">
          <span>Last sync: {fmtSync(lastSync)}</span>
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1 text-[11px] font-medium border border-pwc-orange text-pwc-orange rounded hover:bg-pwc-orange hover:text-white transition-colors disabled:opacity-50"
            >
              {syncing ? "동기화 중..." : "↻ 새로고침"}
            </button>
          )}
          <span>Source: BI_PARTNERREPORT_TBA_V</span>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={[
          {
            name: "year_month",
            label: "연월",
            options: ymOptions,
            value: filterYm,
            onChange: setFilterYm,
          },
          {
            name: "project",
            label: "Project",
            options: filterOpts.projects,
            value: filterProject,
            onChange: setFilterProject,
          },
          {
            name: "el",
            label: "EL",
            options: filterOpts.els,
            value: filterEl,
            onChange: setFilterEl,
          },
          {
            name: "pm",
            label: "PM",
            options: filterOpts.pms,
            value: filterPm,
            onChange: setFilterPm,
          },
          {
            name: "dept",
            label: "EL소속본부",
            options: filterOpts.departments,
            value: filterDept,
            onChange: setFilterDept,
          },
        ]}
      />

      {/* KPI Cards */}
      {kpi && (
        <div className="grid grid-cols-6 gap-3">
          <KpiCard label="프로젝트" value={kpi.project_count.toString()} />
          <KpiCard label="Total Revenue" value={fmtKRW(kpi.total_revenue)} highlight />
          <KpiCard label="Std Cost" value={fmtKRW(kpi.total_std_cost)} />
          <KpiCard
            label="EM"
            value={fmtKRW(kpi.total_em)}
            highlight
            color={kpi.total_em < 0 ? "text-pwc-red" : "text-pwc-green"}
          />
          <KpiCard label="Budget Hourours" value={fmtHours(kpi.total_budget_hours)} />
          <KpiCard label="Actual Hourours" value={fmtHours(kpi.total_actual_hours)} />
        </div>
      )}

      {/* Projects Table */}
      <div className="bg-white rounded-lg border border-pwc-gray-100 overflow-hidden">
        <div className="px-4 py-2 bg-pwc-gray-50 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">프로젝트별 현황</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-pwc-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">프로젝트</th>
                <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600 w-20">EL</th>
                <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600 w-24">Revenue</th>
                <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600 w-24">Std Cost</th>
                <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600 w-24">EM</th>
                <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600 w-20">Budget Hour</th>
                <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600 w-20">Actual Hour</th>
                <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600 w-16">진행률</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-pwc-gray-600">
                    로딩 중...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-pwc-gray-600">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                projects.map((p) => {
                  const selected = selectedCode === p.project_code;
                  return (
                    <tr
                      key={p.project_code}
                      onClick={() => setSelectedCode(selected ? null : p.project_code)}
                      className={`border-t border-pwc-gray-100 cursor-pointer transition-colors ${
                        selected
                          ? "bg-orange-50 border-l-2 border-l-pwc-orange"
                          : "hover:bg-pwc-gray-50"
                      }`}
                    >
                      <td className="px-3 py-2 max-w-[260px] truncate" title={p.project_name}>
                        {p.project_name}
                      </td>
                      <td className="px-3 py-2">{p.el_name}</td>
                      <td className="px-3 py-2 text-right">{fmtKRW(p.revenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtKRW(p.std_cost)}</td>
                      <td className="px-3 py-2 text-right">
                        <EmCell value={p.em} />
                      </td>
                      <td className="px-3 py-2 text-right">{fmtHours(p.budget_hours)}</td>
                      <td className="px-3 py-2 text-right">{fmtHours(p.actual_hours)}</td>
                      <td className="px-3 py-2 text-right">
                        <ProgressBadge value={p.progress_hours} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Detail */}
      {selectedCode && monthly.length > 0 && (
        <div className="bg-white rounded-lg border border-pwc-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-pwc-gray-50 border-b border-pwc-gray-100">
            <h3 className="text-sm font-bold text-pwc-black">
              월별 추이 — {projects.find((p) => p.project_code === selectedCode)?.project_name}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-pwc-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">YYMM</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Revenue</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Std Cost</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">EM</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Budget Hour</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Actual Hour</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.year_month} className="border-t border-pwc-gray-100">
                    <td className="px-3 py-2 font-mono">{m.year_month}</td>
                    <td className="px-3 py-2 text-right">{fmtKRW(m.revenue)}</td>
                    <td className="px-3 py-2 text-right">{fmtKRW(m.std_cost)}</td>
                    <td className="px-3 py-2 text-right">
                      <EmCell value={m.em} />
                    </td>
                    <td className="px-3 py-2 text-right">{fmtHours(m.budget_hours)}</td>
                    <td className="px-3 py-2 text-right">{fmtHours(m.actual_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  highlight,
  color,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm px-4 py-3">
      <p className="text-[11px] text-pwc-gray-600 font-medium uppercase mb-1">{label}</p>
      <p
        className={`text-xl font-bold ${color || (highlight ? "text-pwc-orange" : "text-pwc-black")}`}
      >
        {value}
      </p>
    </div>
  );
}
