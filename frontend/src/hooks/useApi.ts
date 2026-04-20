"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Generic fetch hook
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Build query string from filter params
export function buildQuery(params: Record<string, string>): string {
  const filtered = Object.entries(params).filter(([, v]) => v !== "");
  if (filtered.length === 0) return "";
  return "?" + new URLSearchParams(filtered).toString();
}

// Filter options hook
export function useFilterOptions() {
  return useApi<{
    projects: { value: string; label: string }[];
    els: { value: string; label: string }[];
    pms: { value: string; label: string }[];
    departments: { value: string; label: string }[];
  }>("/api/v1/filter-options");
}

// Overview data types
export interface OverviewData {
  kpi: {
    contract_hours: number;
    axdx_hours: number;
    axdx_ratio: number;
    staff_budget: number;
    actual_hours: number;
    progress: number;
    template_status: string;
  };
  projects: {
    project_code: string;
    project_name: string;
    el_name: string;
    pm_name: string;
    budget: number;
    actual: number;
    progress: number;
    template_status: string;
  }[];
  budget_by_category: { category: string; hours: number }[];
  actual_by_category: { category: string; hours: number }[];
  budget_by_unit: { unit: string; category?: string; budget: number; actual: number; progress: number }[];
  elpm_qrp_time: {
    project_code: string;
    project_name: string;
    role: string;
    budget: number;
    actual: number;
    progress: number;
  }[];
  staff_time: {
    empno: string;
    emp_name: string;
    department: string;
    grade: string;
    budget: number;
    actual: number;
    progress: number;
  }[];
}

// Summary data types
export interface SummaryData {
  groups: {
    group: string;
    contract_hours: number;
    total_budget: number;
    total_actual: number;
    yra: number;
    axdx: number;
    axdx_ratio: number;
  }[];
  projects: {
    project_code: string;
    project_name: string;
    group_code?: string;
    contract_hours: number;
    total_budget: number;
    total_actual: number;
    yra: number;
    axdx: number;
    axdx_ratio: number;
  }[];
}

// Assignment list item
export interface AssignmentItem {
  empno: string;
  emp_name: string;
  department: string;
  grade: string;
  total_budget: number;
}

// Assignment detail
export interface AssignmentDetail {
  empno: string;
  emp_name: string;
  department: string;
  grade: string;
  projects: {
    project_code: string;
    project_name: string;
    el_name: string;
    pm_name: string;
    budget: number;
    actual: number;
    remaining: number;
    progress: number;
  }[];
  details: {
    project_code: string;
    project_name: string;
    budget_unit: string;
    budget_category: string;
    budget: number;
    actual: number;
    remaining: number;
    progress: number;
  }[];
}

// Project list item
export interface ProjectListItem {
  project_code: string;
  project_name: string;
  el_name: string;
  pm_name: string;
  department: string;
  contract_hours: number;
  total_budget_hours: number;
  template_status: string;
}

// Project detail
export interface ProjectDetail {
  project: {
    project_code: string;
    project_name: string;
    contract_hours: number;
    axdx_hours: number;
    el_hours: number;
    pm_hours: number;
    fulcrum_hours: number;
    ra_staff_hours: number;
    specialist_hours: number;
    et_controllable_budget: number;
    total_budget_hours: number;
    rm_hours?: number;
    ra_elpm_hours?: number;
    travel_hours?: number;
  };
  details: {
    category: string;
    unit: string;
    emp_name: string;
    empno: string;
    grade: string;
    department: string;
    budget: number;
    actual: number;
    remaining: number;
    progress: number;
  }[];
}
