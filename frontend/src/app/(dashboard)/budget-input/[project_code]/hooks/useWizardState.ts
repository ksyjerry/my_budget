"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MONTHS as DEFAULT_MONTHS,
  MONTH_LABELS as DEFAULT_MONTH_LABELS,
  generateMonths,
  generateMonthLabels,
} from "@/lib/budget-constants";
import type {
  ProjectInfo,
  ClientInfo,
  Member,
  BudgetUnit,
  TemplateRow,
} from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface UseWizardStateOptions {
  projectCode: string;
  step: number;
}

export function useWizardState({ projectCode, step }: UseWizardStateOptions) {
  const isNew = projectCode === "new";

  // ── Step 1 state ────────────────────────────────────
  const [project, setProject] = useState<ProjectInfo>({
    project_code: isNew ? "" : projectCode,
    project_name: "",
    department: "",
    el_empno: "",
    el_name: "",
    pm_empno: "",
    pm_name: "",
    qrp_empno: "",
    qrp_name: "",
    contract_hours: 0,
    axdx_hours: 0,
    qrp_hours: 0,
    rm_hours: 0,
    el_hours: 0,
    pm_hours: 0,
    ra_elpm_hours: 0,
    et_controllable_budget: 0,
    fulcrum_hours: 0,
    ra_staff_hours: 0,
    specialist_hours: 0,
    travel_hours: 0,
    total_budget_hours: 0,
    template_status: "작성중",
    service_type: "AUDIT",
  });
  const [client, setClient] = useState<ClientInfo>({
    client_code: "",
    client_name: "",
    industry: "",
    asset_size: "",
    listing_status: "",
    business_report: "",
    gaap: "",
    consolidated: "",
    subsidiary_count: "",
    internal_control: "",
    initial_audit: "",
  });

  // ── Step 2 state ────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([]);
  const [activityOptions, setActivityOptions] = useState<string[]>([
    "재무제표기말감사",
    "분반기검토",
    "내부통제감사",
    "IT감사",
  ]);

  // ── Step 3 state ────────────────────────────────────
  const [budgetUnits, setBudgetUnits] = useState<BudgetUnit[]>([]);
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]);

  // ── Load existing project ────────────────────────────
  useEffect(() => {
    if (isNew) return;

    fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}/info`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.project) setProject(data.project);
        if (data?.client) setClient(data.client);
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}/members`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMembers(data);
      })
      .catch(() => {});
  }, [projectCode, isNew]);

  // ── Load budget units master (service_type dependent) ──
  useEffect(() => {
    if (project.service_type === "AUDIT") {
      fetch(`${API_BASE}/api/v1/budget/master/units`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.units) setBudgetUnits(data.units);
        })
        .catch(() => {});
    } else {
      fetch(
        `${API_BASE}/api/v1/budget/master/tasks?service_type=${project.service_type}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setBudgetUnits(
              data.map(
                (t: {
                  task_category: string;
                  task_name: string;
                  sort_order: number;
                }) => ({
                  category: t.task_category || project.service_type,
                  unit_name: t.task_name,
                  sort_order: t.sort_order,
                })
              )
            );
          }
        })
        .catch(() => {});
    }
  }, [project.service_type]);

  // ── Load activity options (service_type dependent) ──
  useEffect(() => {
    if (project.service_type === "AUDIT") {
      setActivityOptions([
        "재무제표기말감사",
        "분반기검토",
        "내부통제감사",
        "IT감사",
      ]);
      return;
    }
    fetch(
      `${API_BASE}/api/v1/budget/master/activity-mapping?service_type=${project.service_type}`,
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ category: string }>) => {
        const unique = Array.from(
          new Set(rows.map((x) => x.category).filter(Boolean))
        );
        setActivityOptions(unique);
      })
      .catch(() => setActivityOptions([]));
  }, [project.service_type]);

  // ── Initialize template rows from budgetUnits ──────
  const initializeTemplateRows = useCallback(() => {
    if (!budgetUnits.length) return;
    const defaultAssignee =
      members.find((m) => m.role === "FLDT 구성원") || members[0];
    setTemplateRows(
      budgetUnits.map((u) => ({
        budget_category: u.category,
        budget_unit: u.unit_name,
        empno: defaultAssignee?.empno || "",
        emp_name: defaultAssignee?.name || "",
        grade: "",
        months: {},
        enabled: false,
      }))
    );
  }, [budgetUnits, members]);

  // ── Load template rows when entering Step 3 ─────────
  useEffect(() => {
    if (step !== 3) return;
    // clone으로 이미 데이터가 세팅된 경우 스킵
    if (templateRows.length > 0 && templateRows.some((r) => r.enabled)) return;
    if (isNew) {
      initializeTemplateRows();
      return;
    }
    fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}/template`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.rows?.length) {
          setTemplateRows(
            data.rows.map((r: TemplateRow) => ({ ...r, enabled: true }))
          );
        } else {
          initializeTemplateRows();
        }
      })
      .catch(() => {
        initializeTemplateRows();
      });
  }, [step, projectCode, isNew, budgetUnits.length]);

  // ── ET controllable budget (derived) ─────────────────
  const etControllable = useMemo(() => {
    return (
      project.contract_hours -
      project.axdx_hours -
      project.qrp_hours -
      project.rm_hours -
      project.el_hours -
      project.pm_hours -
      project.ra_elpm_hours -
      project.fulcrum_hours -
      project.ra_staff_hours -
      project.specialist_hours -
      project.travel_hours
    );
  }, [
    project.contract_hours,
    project.axdx_hours,
    project.qrp_hours,
    project.rm_hours,
    project.el_hours,
    project.pm_hours,
    project.ra_elpm_hours,
    project.fulcrum_hours,
    project.ra_staff_hours,
    project.specialist_hours,
    project.travel_hours,
  ]);

  // ── Dynamic MONTHS based on fiscal_start ─────────────
  const MONTHS = useMemo(
    () =>
      project.fiscal_start
        ? generateMonths(project.fiscal_start)
        : DEFAULT_MONTHS,
    [project.fiscal_start]
  );
  const MONTH_LABELS = useMemo(() => generateMonthLabels(MONTHS), [MONTHS]);

  // ── Template totals (derived) ─────────────────────────
  const templateTotal = useMemo(() => {
    let total = 0;
    const monthTotals: Record<string, number> = {};
    MONTHS.forEach((m) => (monthTotals[m] = 0));

    templateRows.forEach((row) => {
      if (!row.enabled) return;
      MONTHS.forEach((m) => {
        const v = row.months[m] || 0;
        total += v;
        monthTotals[m] += v;
      });
    });
    return { total, monthTotals };
  }, [templateRows, MONTHS]);

  return {
    isNew,
    // Step 1
    project,
    setProject,
    client,
    setClient,
    // Step 2
    members,
    setMembers,
    activityOptions,
    setActivityOptions,
    // Step 3
    budgetUnits,
    setBudgetUnits,
    templateRows,
    setTemplateRows,
    initializeTemplateRows,
    // Derived
    etControllable,
    MONTHS,
    MONTH_LABELS,
    templateTotal,
  };
}

// Re-export defaults for backward compat (page.tsx imports DEFAULT_MONTH_LABELS)
export { DEFAULT_MONTH_LABELS };
