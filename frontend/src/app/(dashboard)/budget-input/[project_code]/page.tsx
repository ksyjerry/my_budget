"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { gradeRank } from "@/lib/grade";
import {
  INDUSTRY_OPTIONS,
  ASSET_SIZE_OPTIONS,
  LISTING_OPTIONS,
  GAAP_OPTIONS,
  CONSOLIDATED_OPTIONS,
  BUSINESS_REPORT_OPTIONS,
  SUBSIDIARY_OPTIONS,
  INTERNAL_CONTROL_OPTIONS,
  AUDIT_TYPE_OPTIONS,
  MONTHS as DEFAULT_MONTHS,
  MONTH_LABELS as DEFAULT_MONTH_LABELS,
  generateMonths,
  generateMonthLabels,
} from "@/lib/budget-constants";
import { NumberField } from "@/components/ui/NumberField";

// ── Types ──────────────────────────────────────────
interface ProjectInfo {
  project_code: string;
  project_name: string;
  department: string;
  el_empno: string;
  el_name: string;
  pm_empno: string;
  pm_name: string;
  qrp_empno: string;
  qrp_name: string;
  contract_hours: number;
  axdx_hours: number;
  qrp_hours: number;
  rm_hours: number;
  el_hours: number;
  pm_hours: number;
  ra_elpm_hours: number;
  et_controllable_budget: number;
  fulcrum_hours: number;
  ra_staff_hours: number;
  specialist_hours: number;
  travel_hours: number;
  total_budget_hours: number;
  template_status: string;
  service_type: string;
  fiscal_start?: string | null;
}

interface ClientInfo {
  client_code: string;
  client_name: string;
  industry: string;
  asset_size: string;
  listing_status: string;
  business_report: string;
  gaap: string;
  consolidated: string;
  subsidiary_count: string;
  internal_control: string;
  initial_audit: string;
  needs_detail?: boolean;
}

interface Member {
  id?: number;
  role: string;
  name: string;
  empno: string;
  grade: string;
  activity_mapping: string;
  sort_order: number;
}

interface BudgetUnit {
  category: string;
  unit_name: string;
  sort_order: number;
}

interface TemplateRow {
  budget_category: string;
  budget_unit: string;
  empno: string;
  emp_name: string;
  grade: string;
  months: Record<string, number>;
  enabled: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── Main Component ─────────────────────────────────
export default function BudgetWizardPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectCode = params.project_code as string;
  const isNew = projectCode === "new";

  const [step, setStep] = useState(() => {
    const s = parseInt(searchParams.get("step") ?? "1", 10);
    return s >= 1 && s <= 3 ? s : 1;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Step 1 state
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

  // Step 2 state
  const [members, setMembers] = useState<Member[]>([]);
  const [activityOptions, setActivityOptions] = useState<string[]>([
    "재무제표기말감사",
    "분반기검토",
    "내부통제감사",
    "IT감사",
  ]);

  // Step 3 state
  const [budgetUnits, setBudgetUnits] = useState<BudgetUnit[]>([]);
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]);

  // ── Load existing project ────────────────────────
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

  // Load budget units master — 서비스 분류에 따라 다른 소스 사용
  useEffect(() => {
    if (project.service_type === "AUDIT") {
      // 감사: 기존 budget_unit_master 사용
      fetch(`${API_BASE}/api/v1/budget/master/units`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.units) setBudgetUnits(data.units);
        })
        .catch(() => {});
    } else {
      // 비감사: service_task_master에서 Task 목록 로드
      fetch(`${API_BASE}/api/v1/budget/master/tasks?service_type=${project.service_type}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setBudgetUnits(
              data.map((t: { task_category: string; task_name: string; sort_order: number }) => ({
                category: t.task_category || project.service_type,
                unit_name: t.task_name,
                sort_order: t.sort_order,
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [project.service_type]);

  // Load activity options for Step 2 dropdown — dynamic per service_type
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

  // Load template rows when entering Step 3
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

  // ── ET controllable budget 자동 계산 ─────────────
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

  // ── Dynamic MONTHS based on fiscal_start ─────────
  const MONTHS = useMemo(
    () => (project.fiscal_start ? generateMonths(project.fiscal_start) : DEFAULT_MONTHS),
    [project.fiscal_start]
  );
  const MONTH_LABELS = useMemo(() => generateMonthLabels(MONTHS), [MONTHS]);

  // ── Template totals ──────────────────────────────
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

  // ── Save handlers ────────────────────────────────
  const saveStep1 = async () => {
    setSaving(true);
    setMessage("");
    try {
      const code = isNew ? project.project_code : projectCode;
      const body = {
        ...project,
        ...client,
        project_code: code,
        et_controllable_budget: etControllable,
      };
      const method = isNew ? "POST" : "PUT";
      const url = isNew
        ? `${API_BASE}/api/v1/budget/projects`
        : `${API_BASE}/api/v1/budget/projects/${code}`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(`오류: ${data.detail || "저장 실패"}`);
        return;
      }
      setMessage("Step 1 저장 완료");

      if (isNew && data.project_code) {
        router.replace(`/budget-input/${data.project_code}?step=${step}`);
      }
    } catch {
      setMessage("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/budget/projects/${projectCode}/members`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(members),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setMessage(`오류: ${data.detail || "저장 실패"}`);
        return;
      }
      setMessage("Step 2 저장 완료");
    } catch {
      setMessage("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  };

  const saveStep3 = async (status: string) => {
    const rows = templateRows
      .filter((r) => {
        if (r.enabled) return true;
        return Object.values(r.months ?? {}).some((h) => h && h > 0);
      })
      .map((r) => ({
        budget_category: r.budget_category,
        budget_unit: r.budget_unit,
        empno: r.empno,
        emp_name: r.emp_name,
        grade: r.grade,
        months: r.months,
      }));
    const res = await fetch(
      `${API_BASE}/api/v1/budget/projects/${projectCode}/template`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, template_status: status }),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Template 저장 실패");
    }
  };

  const saveAll = async (status: string) => {
    if (status === "작성완료") {
      const enabledRows = templateRows.filter((r) => r.enabled);
      const errors: string[] = [];

      const noEmpno = enabledRows.filter((r) => !r.empno);
      if (noEmpno.length > 0) {
        errors.push(
          `담당자 미지정 ${noEmpno.length}건:\n` +
            noEmpno
              .slice(0, 5)
              .map((r) => `  - ${r.budget_unit ?? ""}`)
              .join("\n") +
            (noEmpno.length > 5 ? `\n  ...외 ${noEmpno.length - 5}건` : "")
        );
      }

      const noHours = enabledRows.filter((r) =>
        Object.values(r.months ?? {}).every((h) => !h || h === 0)
      );
      if (noHours.length > 0) {
        errors.push(`시간 미입력 ${noHours.length}건`);
      }

      const totalSum = enabledRows.reduce(
        (s, r) => s + Object.values(r.months ?? {}).reduce((a, b) => a + (b || 0), 0),
        0
      );
      if (Math.abs(totalSum - etControllable) > 0.01) {
        errors.push(
          `시간 합계 ${totalSum.toLocaleString()} ≠ ET Controllable ${etControllable.toLocaleString()} (차이: ${(totalSum - etControllable).toFixed(1)}h)`
        );
      }

      if (errors.length > 0) {
        alert("등록완료 전 확인이 필요합니다:\n\n" + errors.join("\n\n"));
        return;
      }
    }

    setSaving(true);
    setMessage("");
    try {
      // 1) Step 1: 프로젝트 기본정보
      const code = isNew ? project.project_code : projectCode;
      const body = {
        ...project,
        ...client,
        project_code: code,
        et_controllable_budget: etControllable,
      };
      const method = isNew ? "POST" : "PUT";
      const url = isNew
        ? `${API_BASE}/api/v1/budget/projects`
        : `${API_BASE}/api/v1/budget/projects/${code}`;
      const res1 = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res1.ok) {
        const d = await res1.json();
        setMessage(`오류: ${d.detail || "기본정보 저장 실패"}`);
        return;
      }
      const data1 = await res1.json();
      const savedCode = data1.project_code || code;

      // 2) Step 2: 구성원
      if (members.length > 0) {
        const res2 = await fetch(
          `${API_BASE}/api/v1/budget/projects/${savedCode}/members`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(members),
          }
        );
        if (!res2.ok) {
          const d = await res2.json();
          setMessage(`오류: ${d.detail || "구성원 저장 실패"}`);
          return;
        }
      }

      // 3) Step 3: Time Budget
      const rowsToSave = templateRows.filter((r) => {
        if (r.enabled) return true;
        return Object.values(r.months ?? {}).some((h) => h && h > 0);
      });
      if (rowsToSave.length > 0) {
        const tplRows = rowsToSave.map((r) => ({
          budget_category: r.budget_category,
          budget_unit: r.budget_unit,
          empno: r.empno,
          emp_name: r.emp_name,
          grade: r.grade,
          months: r.months,
        }));
        const res3 = await fetch(
          `${API_BASE}/api/v1/budget/projects/${savedCode}/template`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: tplRows, template_status: status }),
          }
        );
        if (!res3.ok) {
          const d = await res3.json();
          setMessage(`오류: ${d.detail || "Time Budget 저장 실패"}`);
          return;
        }
      }

      setMessage(status === "작성완료" ? "등록 완료!" : "임시 저장 완료");
      if (isNew && savedCode) {
        router.replace(`/budget-input/${savedCode}?step=${step}`);
      }
    } catch {
      setMessage("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  };

  // ── Member helpers ───────────────────────────────
  const addMember = (role: string) => {
    setMembers((prev) => [
      ...prev,
      {
        role,
        name: "",
        empno: "",
        grade: "",
        activity_mapping: "재무제표기말감사",
        sort_order: prev.length,
      },
    ]);
  };

  const removeMember = (idx: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMember = (idx: number, field: keyof Member, value: string | number) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  };

  // ── Template row helpers ─────────────────────────
  const toggleRow = (idx: number) => {
    setTemplateRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, enabled: !r.enabled } : r
      )
    );
  };

  const updateRowMonth = (idx: number, month: string, value: number) => {
    setTemplateRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, months: { ...r.months, [month]: value } }
          : r
      )
    );
  };

  const updateRowAssignee = (idx: number, empno: string, name: string, grade: string) => {
    setTemplateRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, empno, emp_name: name, grade } : r
      )
    );
  };

  const duplicateRow = (idx: number) => {
    setTemplateRows((prev) => {
      const row = prev[idx];
      const newRow: TemplateRow = {
        ...row,
        empno: "",
        emp_name: "",
        months: {},
        enabled: true,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  };

  const rowTotal = (row: TemplateRow) =>
    MONTHS.reduce((sum, m) => sum + (row.months[m] || 0), 0);

  // ── Render ───────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/budget-input"
            className="text-sm text-pwc-gray-600 hover:text-pwc-black"
          >
            ← 목록으로
          </Link>
          <h2 className="text-lg font-bold text-pwc-black">
            {isNew ? "신규 프로젝트" : `${project.project_name || projectCode}`}
          </h2>
          {message && (
            <span
              className={`text-xs px-3 py-1 rounded ${
                message.includes("오류")
                  ? "bg-red-50 text-pwc-red"
                  : "bg-green-50 text-pwc-green"
              }`}
            >
              {message}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => saveAll("작성중")}
            disabled={saving}
            className="px-4 py-1.5 text-sm border border-pwc-gray-600 text-pwc-gray-600 rounded hover:bg-pwc-black hover:text-white hover:border-pwc-black transition-colors disabled:opacity-50"
          >
            {saving ? "저장중..." : "임시저장"}
          </button>
          <button
            onClick={() => saveAll("작성완료")}
            disabled={saving}
            className="px-5 py-1.5 text-sm font-medium bg-pwc-orange text-white rounded hover:bg-[#B83D02] transition-colors disabled:opacity-50"
          >
            {saving ? "저장중..." : "등록완료"}
          </button>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex gap-1">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 py-2.5 text-sm font-medium rounded-t transition-colors ${
              step === s
                ? "bg-pwc-orange text-white"
                : "bg-pwc-gray-100 text-pwc-gray-600 hover:bg-pwc-gray-200 cursor-pointer"
            }`}
          >
            Step {s}:{" "}
            {s === 1 ? "기본정보" : s === 2 ? "구성원" : "Time Budget"}
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg border border-pwc-gray-100 p-6">
        {step === 1 && (
          <Step1Form
            project={project}
            setProject={setProject}
            client={client}
            setClient={setClient}
            etControllable={etControllable}
            isNew={isNew}
            onCloneFromProject={async (sourceCode: string) => {
              try {
                const res = await fetch(
                  `${API_BASE}/api/v1/budget/projects/${sourceCode}/clone-data`
                );
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();

                // 시간 정보 반영 (spread로 직접 병합)
                if (data.hours) {
                  setProject({ ...project, ...data.hours });
                }

                // 구성원 반영
                if (data.members?.length) {
                  const newMembers = data.members.map((m: Record<string, unknown>) => ({
                    role: (m.role as string) || "",
                    name: (m.name as string) || "",
                    empno: (m.empno as string) || "",
                    grade: (m.grade as string) || "",
                    activity_mapping: (m.activity_mapping as string) || "",
                    sort_order: (m.sort_order as number) || 0,
                  }));
                  setMembers(newMembers);
                }

                // Budget template 반영
                if (data.template?.rows?.length) {
                  const newRows = data.template.rows.map((r: Record<string, unknown>) => ({
                    budget_category: r.budget_category || "",
                    budget_unit: r.budget_unit || "",
                    empno: r.empno || "",
                    emp_name: r.emp_name || "",
                    grade: r.grade || "",
                    department: r.department || "",
                    months: r.months || {},
                    total: r.total || 0,
                    enabled: true,
                  }));
                  setTemplateRows(newRows);
                }

                alert(`${data.project_name}의 정보를 가져왔습니다.\n구성원 ${data.members?.length || 0}명, Time Budget ${data.template?.rows?.length || 0}개 항목`);
              } catch (e) {
                console.error("Clone failed:", e);
                alert("이전 프로젝트 정보를 가져오는데 실패했습니다.");
              }
            }}
          />
        )}
        {step === 2 && (
          <Step2Members
            members={members}
            addMember={addMember}
            removeMember={removeMember}
            updateMember={updateMember}
            activityOptions={activityOptions}
            projectCode={project.project_code}
            onMembersImported={async () => {
              const code = project.project_code || projectCode;
              if (!code || code === "new") return;
              const r = await fetch(`${API_BASE}/api/v1/budget/projects/${code}/members`);
              if (r.ok) {
                const data = await r.json();
                if (Array.isArray(data)) setMembers(data);
              }
            }}
          />
        )}
        {step === 3 && (
          <Step3Template
            rows={templateRows}
            setRows={setTemplateRows}
            toggleRow={toggleRow}
            updateRowMonth={updateRowMonth}
            updateRowAssignee={updateRowAssignee}
            duplicateRow={duplicateRow}
            rowTotal={rowTotal}
            templateTotal={templateTotal}
            members={members}
            etControllable={etControllable}
            budgetUnits={budgetUnits}
            projectCode={project.project_code}
            clientInfo={client}
            months={MONTHS}
            monthLabels={MONTH_LABELS}
            onTemplateImported={async () => {
              const code = project.project_code || projectCode;
              if (!code || code === "new") return;
              const r = await fetch(`${API_BASE}/api/v1/budget/projects/${code}/template`);
              if (r.ok) {
                const data = await r.json();
                if (data?.rows?.length) {
                  setTemplateRows(
                    data.rows.map((row: TemplateRow) => ({ ...row, enabled: true }))
                  );
                }
              }
            }}
          />
        )}
      </div>

      {/* Bottom Step Navigation */}
      <div className="flex items-center justify-between z-10 relative">
        <div>
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm border border-pwc-gray-200 rounded hover:border-pwc-black transition-colors"
            >
              ← 이전
            </button>
          )}
        </div>
        <div>
          {step < 3 && (
            <button
              onClick={() => {
                if (step === 1 && !project.project_code && !project.project_name) {
                  alert("프로젝트 기본정보를 먼저 입력해주세요.");
                  return;
                }
                if (step === 2 && members.filter(m => m.empno || m.name).length === 0) {
                  alert("구성원을 1명 이상 등록해주세요.");
                  return;
                }
                setStep(step + 1);
              }}
              className="px-4 py-2 text-sm border border-pwc-black text-pwc-black rounded hover:bg-pwc-black hover:text-white transition-colors"
            >
              다음 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: 기본정보 Form ──────────────────────────
// ── Client Search Modal ───────────────────────────────
function ClientSearchModal({
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


// ── Project Search Modal ──────────────────────────────
function ProjectSearchModal({
  onSelect,
  onClose,
  clientCode,
}: {
  onSelect: (p: Record<string, unknown>) => void;
  onClose: () => void;
  clientCode?: string;
}) {
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (clientCode) params.set("client_code", clientCode);
        const res = await fetch(
          `${API_BASE}/api/v1/budget/projects/search?${params.toString()}`
        );
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[750px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-pwc-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-pwc-black">프로젝트 선택</h3>
          <button onClick={onClose} className="text-pwc-gray-600 hover:text-pwc-black text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 shrink-0">
          선택한 클라이언트에 속한 프로젝트 목록입니다. 클릭하여 선택하세요.
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-pwc-gray-600">불러오는 중...</div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-pwc-gray-600">해당 클라이언트의 프로젝트가 없습니다.</div>
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


// ── Clone Project Search Modal ─────────────────────────
function CloneProjectModal({
  onSelect,
  onClose,
}: {
  onSelect: (projectCode: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      // PostgreSQL에 등록된 프로젝트만 검색 (Budget이 있는 것)
      const res = await fetch(
        `${API_BASE}/api/v1/budget/projects/list?q=${encodeURIComponent(query.trim())}`
      );
      if (res.ok) setResults(await res.json());
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[800px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-pwc-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-pwc-black">이전 프로젝트 정보 가져오기</h3>
          <button onClick={onClose} className="text-pwc-gray-600 hover:text-pwc-black text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-3 border-b border-pwc-gray-100 shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); doSearch(); }} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="프로젝트명 또는 코드를 입력하세요"
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
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 shrink-0">
          Budget이 등록된 프로젝트만 표시됩니다. 선택하면 시간배분, 구성원, Budget Template 정보를 모두 가져옵니다.
        </div>
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
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">프로젝트명</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">EL</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-pwc-gray-600">PM</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget시간</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-pwc-gray-600">구성원수</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr
                    key={p.project_code as string}
                    className="border-t border-pwc-gray-100 cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => { onSelect(p.project_code as string); onClose(); }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{p.project_code as string}</td>
                    <td className="px-4 py-2.5">{p.project_name as string}</td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{p.el_name as string}</td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{p.pm_name as string}</td>
                    <td className="px-4 py-2.5 text-xs text-right">{((p.total_budget_hours as number) || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-right">{(p.member_count as number) || 0}</td>
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


function Step1Form({
  project,
  setProject,
  client,
  setClient,
  etControllable,
  isNew,
  onCloneFromProject,
}: {
  project: ProjectInfo;
  setProject: (p: ProjectInfo) => void;
  client: ClientInfo;
  setClient: (c: ClientInfo) => void;
  etControllable: number;
  isNew: boolean;
  onCloneFromProject: (projectCode: string) => void;
}) {
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [showCloneSearch, setShowCloneSearch] = useState(false);
  const pField = (field: keyof ProjectInfo, value: string | number) =>
    setProject({ ...project, [field]: value });
  const cField = (field: keyof ClientInfo, value: string) =>
    setClient({ ...client, [field]: value });

  const isAudit = project.service_type === "AUDIT";

  const SelectField = ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
  }) => (
    <div>
      <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
      >
        <option value="">선택</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );

  // NumberField는 컴포넌트 외부에 정의 (아래 NumberFieldComponent 사용)

  return (
    <div className="space-y-6">
      {/* Client Search Modal */}
      {showClientSearch && (
        <ClientSearchModal
          onSelect={async (c) => {
            const code = c.client_code;
            if (!code) {
              setClient({ ...client, ...c });
              return;
            }
            try {
              const r = await fetch(
                `${API_BASE}/api/v1/budget/clients/${code}/info`,
                { credentials: "include" }
              );
              if (r.ok) {
                const info = await r.json();
                const base = client;
                setClient({
                  ...base,
                  ...c,
                  industry: base.industry || info.industry || "",
                  asset_size: base.asset_size || info.asset_size || "",
                  listing_status:
                    base.listing_status || info.listing_status || "",
                  business_report:
                    base.business_report || info.business_report || "",
                  gaap: base.gaap || info.gaap || "",
                  consolidated: base.consolidated || info.consolidated || "",
                  subsidiary_count:
                    base.subsidiary_count || info.subsidiary_count || "",
                  internal_control:
                    base.internal_control || info.internal_control || "",
                  initial_audit: base.initial_audit || info.initial_audit || "",
                });
              } else {
                setClient({ ...client, ...c });
              }
            } catch {
              setClient({ ...client, ...c });
            }
          }}
          onClose={() => setShowClientSearch(false)}
        />
      )}

      {/* 클라이언트 기본정보 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">
            클라이언트 기본정보
          </h3>
          <button
            type="button"
            onClick={() => setShowClientSearch(true)}
            className="px-3 py-1.5 text-xs font-medium border border-pwc-orange text-pwc-orange rounded hover:bg-pwc-orange hover:text-white transition-colors"
          >
            클라이언트 검색
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {!isAudit && (
            <div className="col-span-full text-xs text-pwc-gray-600 bg-pwc-gray-50 rounded-md p-2 mb-3">
              비감사 서비스는 표준산업분류 · 자산규모 · 상장여부 3가지 정보만 입력합니다.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              Client Code
            </label>
            <input
              type="text"
              value={client.client_code}
              onChange={(e) => cField("client_code", e.target.value)}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              Client Name
            </label>
            <input
              type="text"
              value={client.client_name}
              onChange={(e) => cField("client_name", e.target.value)}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
          <SelectField
            label="표준산업분류"
            value={client.industry}
            options={INDUSTRY_OPTIONS}
            onChange={(v) => cField("industry", v)}
          />
          <SelectField
            label="자산규모"
            value={client.asset_size}
            options={ASSET_SIZE_OPTIONS}
            onChange={(v) => cField("asset_size", v)}
          />
          <SelectField
            label="상장여부"
            value={client.listing_status}
            options={LISTING_OPTIONS}
            onChange={(v) => cField("listing_status", v)}
          />
          {isAudit && (
            <SelectField
              label="사업보고서"
              value={client.business_report}
              options={BUSINESS_REPORT_OPTIONS}
              onChange={(v) => cField("business_report", v)}
            />
          )}
          {isAudit && (
            <SelectField
              label="GAAP"
              value={client.gaap}
              options={GAAP_OPTIONS}
              onChange={(v) => cField("gaap", v)}
            />
          )}
          {isAudit && (
            <SelectField
              label="연결재무제표"
              value={client.consolidated}
              options={CONSOLIDATED_OPTIONS}
              onChange={(v) => cField("consolidated", v)}
            />
          )}
          {isAudit && (
            <SelectField
              label="연결자회사수"
              value={client.subsidiary_count}
              options={SUBSIDIARY_OPTIONS}
              onChange={(v) => cField("subsidiary_count", v)}
            />
          )}
          {isAudit && (
            <SelectField
              label="내부회계관리제도"
              value={client.internal_control}
              options={INTERNAL_CONTROL_OPTIONS}
              onChange={(v) => cField("internal_control", v)}
            />
          )}
          {isAudit && (
            <SelectField
              label="초도/계속감사"
              value={client.initial_audit}
              options={AUDIT_TYPE_OPTIONS}
              onChange={(v) => cField("initial_audit", v)}
            />
          )}
        </div>
      </section>

      {/* Project Search Modal */}
      {showProjectSearch && (
        <ProjectSearchModal
          clientCode={client.client_code}
          onSelect={async (p) => {
            setProject({
              ...project,
              project_code: p.project_code as string,
              project_name: p.project_name as string,
              department: p.department as string,
              el_name: p.el_name as string,
              el_empno: p.el_empno as string,
              pm_name: p.pm_name as string,
              pm_empno: p.pm_empno as string,
              qrp_name: (p.qrp_name as string) || "",
              qrp_empno: (p.qrp_empno as string) || "",
              contract_hours: p.contract_hours as number,
              axdx_hours: p.axdx_hours as number,
              qrp_hours: p.qrp_hours as number,
              rm_hours: p.rm_hours as number,
              el_hours: p.el_hours as number,
              pm_hours: p.pm_hours as number,
              ra_elpm_hours: p.ra_elpm_hours as number,
              et_controllable_budget: p.et_controllable_budget as number,
              fulcrum_hours: p.fulcrum_hours as number,
              ra_staff_hours: p.ra_staff_hours as number,
              specialist_hours: p.specialist_hours as number,
              travel_hours: p.travel_hours as number,
              total_budget_hours: p.total_budget_hours as number,
              template_status: (p.template_status as string) || "작성중",
              service_type: (p.service_type as string) || project.service_type || "AUDIT",
            });
            // 클라이언트 코드도 연동
            if (p.client_code) {
              const code = p.client_code as string;
              cField("client_code", code);
              try {
                const r = await fetch(
                  `${API_BASE}/api/v1/budget/clients/${code}/info`,
                  { credentials: "include" }
                );
                if (r.ok) {
                  const info = await r.json();
                  const base = client; // snapshot before async — existing user input wins
                  setClient({
                    ...base,
                    industry: base.industry || info.industry || "",
                    asset_size: base.asset_size || info.asset_size || "",
                    listing_status: base.listing_status || info.listing_status || "",
                    business_report: base.business_report || info.business_report || "",
                    gaap: base.gaap || info.gaap || "",
                    consolidated: base.consolidated || info.consolidated || "",
                    subsidiary_count: base.subsidiary_count || info.subsidiary_count || "",
                    internal_control: base.internal_control || info.internal_control || "",
                    initial_audit: base.initial_audit || info.initial_audit || "",
                  });
                }
              } catch {
                /* silent fail — client info autofill is best-effort */
              }
            }
          }}
          onClose={() => setShowProjectSearch(false)}
        />
      )}

      {/* 프로젝트 정보 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">
            프로젝트 정보
          </h3>
          {isNew && (
            <button
              type="button"
              onClick={() => setShowProjectSearch(true)}
              className="px-3 py-1.5 text-xs font-medium border border-pwc-orange text-pwc-orange rounded hover:bg-pwc-orange hover:text-white transition-colors"
            >
              프로젝트 검색
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              서비스 분류 <span className="text-pwc-red">*</span>
            </label>
            <select
              value={project.service_type}
              onChange={(e) => pField("service_type", e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
            >
              <option value="AUDIT">감사</option>
              <option value="AC">회계자문</option>
              <option value="IC">내부통제 (C.SOX PA)</option>
              <option value="ESG">ESG</option>
              <option value="VAL">Valuation</option>
              <option value="TRADE">통상자문</option>
              <option value="ACT">보험계리</option>
              <option value="ETC">기타</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              Project Code
            </label>
            <input
              type="text"
              value={project.project_code}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600 font-mono"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              프로젝트명
            </label>
            <input
              type="text"
              value={project.project_name}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              본부명
            </label>
            <input
              type="text"
              value={project.department}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              EL
            </label>
            <input
              type="text"
              value={project.el_name ? `${project.el_name}(${project.el_empno})` : ""}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              PM
            </label>
            <input
              type="text"
              value={project.pm_name ? `${project.pm_name}(${project.pm_empno})` : ""}
              readOnly
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
              QRP
            </label>
            <input
              type="text"
              value={project.qrp_name ? `${project.qrp_name}(${project.qrp_empno})` : ""}
              readOnly
              placeholder="QRP 사번 입력 또는 검색"
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-100 rounded bg-pwc-gray-50 text-pwc-gray-600"
            />
          </div>
        </div>
      </section>

      {/* 시간 배분 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">시간 배분</h3>
          <button
            type="button"
            onClick={() => setShowCloneSearch(true)}
            className="px-3 py-1.5 text-xs font-medium border border-pwc-orange text-pwc-orange rounded-lg hover:bg-pwc-orange hover:text-white transition-colors"
          >
            이전 프로젝트 정보 가져오기
          </button>
        </div>
        {showCloneSearch && (
          <CloneProjectModal
            onSelect={(code) => onCloneFromProject(code)}
            onClose={() => setShowCloneSearch(false)}
          />
        )}
        {/* 총 계약시간 */}
        <div className="mb-4">
          <div className="grid grid-cols-4 gap-3">
            <NumberField
              label="총 계약시간"
              value={project.contract_hours}
              onChange={(v) => pField("contract_hours", v)}
              min={0}
            />
          </div>
        </div>

        {/* Group A: 팀 구성원별 시간 */}
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-pwc-gray-900 mb-2">팀 구성원별 시간</h4>
          <div className="grid grid-cols-4 gap-3">
            <NumberField
              label="AX/DX 시간"
              value={project.axdx_hours}
              onChange={(v) => pField("axdx_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="QRP 시간 (수기 입력 가능)"
              value={project.qrp_hours}
              onChange={(v) => pField("qrp_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="RM/CRS/M&T 시간"
              value={project.rm_hours}
              onChange={(v) => pField("rm_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="FLDT-EL 시간"
              value={project.el_hours}
              onChange={(v) => pField("el_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="FLDT-PM 시간"
              value={project.pm_hours}
              onChange={(v) => pField("pm_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="RA-EL/PM 시간"
              value={project.ra_elpm_hours}
              onChange={(v) => pField("ra_elpm_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="Fulcrum 시간"
              value={project.fulcrum_hours}
              onChange={(v) => pField("fulcrum_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="RA-Staff 시간"
              value={project.ra_staff_hours}
              onChange={(v) => pField("ra_staff_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
            <NumberField
              label="Specialist 시간"
              value={project.specialist_hours}
              onChange={(v) => pField("specialist_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
          </div>
        </div>

        {/* Group B: 기타 차감 항목 */}
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-pwc-gray-900 mb-2">기타 차감 항목</h4>
          <div className="grid grid-cols-4 gap-3">
            <NumberField
              label="출장 시간"
              value={project.travel_hours}
              onChange={(v) => pField("travel_hours", v)}
              contractHours={project.contract_hours}
              min={0}
            />
          </div>
          <p className="text-xs text-pwc-gray-600 mt-1">
            * 출장시간도 ET 잔여 시간에서 차감됩니다.
          </p>
        </div>

        {/* ET 잔여 시간 (Controllable Budget) */}
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-xs font-medium text-pwc-gray-600">
              ET 잔여 시간 (Controllable Budget)
              <span
                className="cursor-help text-pwc-gray-400 ml-0.5"
                title={
                  "총 계약시간 − (AX/DX + QRP + RM/CRS/M&T + FLDT-EL + FLDT-PM + " +
                  "RA-EL/PM + Fulcrum + RA-Staff + Specialist + 출장시간)\n\n" +
                  "= FLDT 구성원이 집행할 수 있는 실제 Budget 시간"
                }
              >
                ⓘ
              </span>
            </div>
            <input
              type="text"
              value={etControllable.toLocaleString("ko-KR")}
              readOnly
              className={
                "w-full px-2 py-1.5 text-sm border rounded text-right bg-pwc-gray-50 " +
                (etControllable < 0
                  ? "border-pwc-red text-pwc-red font-semibold"
                  : "border-pwc-gray-200 text-pwc-gray-900")
              }
            />
            {etControllable < 0 && (
              <p className="text-xs text-pwc-red mt-0.5">
                ⚠ 차감 항목 합계가 총 계약시간을 초과합니다. 시간 배분을 재검토하세요.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Step 2: 구성원 관리 ────────────────────────────
// ── Employee Search Autocomplete ─────────────────────
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
  const [results, setResults] = useState<{ empno: string; name: string; grade: string; emp_status?: string }[]>([]);
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
      const res = await fetch(`${API_BASE}/api/v1/budget/employees/search?q=${encodeURIComponent(q)}`);
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
              <span className="text-xs text-pwc-gray-600">{r.grade}</span>
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


function Step2Members({
  members,
  addMember,
  removeMember,
  updateMember,
  activityOptions,
  projectCode,
  onMembersImported,
}: {
  members: Member[];
  addMember: (role: string) => void;
  removeMember: (idx: number) => void;
  updateMember: (idx: number, field: keyof Member, value: string | number) => void;
  activityOptions: string[];
  projectCode: string;
  onMembersImported?: () => Promise<void>;
}) {
  async function handleExportMembers() {
    const res = await fetch(
      `${API_BASE}/api/v1/budget/projects/${projectCode}/members/export`,
      { credentials: "include" }
    );
    if (!res.ok) {
      alert("다운로드 실패");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members_${projectCode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportMembers(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(
        `${API_BASE}/api/v1/budget/projects/${projectCode}/members/upload`,
        { method: "POST", body: fd, credentials: "include" }
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({ detail: "업로드 실패" }));
        alert(d.detail || "업로드 실패");
        return;
      }
      const data = await r.json();
      let msg = `${data.imported_count} 명 업로드 완료.`;
      if (data.skipped?.length > 0) {
        msg += `\n제외 ${data.skipped.length} 명:\n` +
          data.skipped.map((s: { empno?: string; reason: string }) =>
            `  - ${s.empno ?? "(no empno)"}: ${s.reason}`
          ).join("\n");
      }
      alert(msg);
      if (onMembersImported) await onMembersImported();
    } catch (err) {
      alert(`업로드 오류: ${err instanceof Error ? err.message : "알 수 없음"}`);
    }
    e.target.value = "";
  }
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
      {/* Excel 다운로드/업로드 */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={handleExportMembers}
          className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-md hover:bg-pwc-gray-50 text-pwc-gray-900"
        >
          📥 Excel 다운로드
        </button>
        <label className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-md hover:bg-pwc-gray-50 text-pwc-gray-900 cursor-pointer">
          📤 Excel 업로드
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImportMembers}
          />
        </label>
      </div>

      {/* FLDT 구성원 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">FLDT 구성원</h3>
          <button
            onClick={() => addMember("FLDT 구성원")}
            className="px-3 py-1 text-xs font-medium border border-pwc-black rounded hover:bg-pwc-black hover:text-white transition-colors"
          >
            + 구성원 추가
          </button>
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
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) => {
                          updateMember(idx, "name", e.target.value);
                          updateMember(idx, "empno", e.target.value);
                        }}
                        placeholder="Fulcrum, RA, Specialist 등"
                        className="w-full px-2 py-1 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
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
    </div>
  );
}

// ── Step 3: Budget Template ────────────────────────
function Step3Template({
  rows,
  setRows,
  toggleRow,
  updateRowMonth,
  updateRowAssignee,
  duplicateRow,
  rowTotal,
  templateTotal,
  members,
  etControllable,
  budgetUnits,
  projectCode,
  clientInfo,
  months: MONTHS,
  monthLabels: MONTH_LABELS,
  onTemplateImported,
}: {
  rows: TemplateRow[];
  setRows: (rows: TemplateRow[]) => void;
  toggleRow: (idx: number) => void;
  updateRowMonth: (idx: number, month: string, value: number) => void;
  updateRowAssignee: (idx: number, empno: string, name: string, grade: string) => void;
  duplicateRow: (idx: number) => void;
  rowTotal: (row: TemplateRow) => number;
  templateTotal: { total: number; monthTotals: Record<string, number> };
  members: Member[];
  etControllable: number;
  budgetUnits: BudgetUnit[];
  projectCode: string;
  clientInfo: ClientInfo;
  months: string[];
  monthLabels: string[];
  onTemplateImported?: () => Promise<void>;
}) {
  const [viewMode, setViewMode] = useState<"month" | "quarter">("month");
  const QUARTERS = useMemo(() => {
    const out: { label: string; months: string[] }[] = [];
    for (let i = 0; i < MONTHS.length; i += 3) {
      const slice = MONTHS.slice(i, i + 3);
      if (slice.length === 0) break;
      const startMonth = parseInt(slice[0].slice(5), 10);
      const endMonth = parseInt(slice[slice.length - 1].slice(5), 10);
      const qIdx = i / 3 + 1;
      out.push({ label: `${qIdx}Q (${startMonth}-${endMonth}월)`, months: slice });
    }
    return out;
  }, []);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ type: "suggest" | "validate"; data: Record<string, unknown> } | null>(null);
  // Excel-like grid state
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  // Add row modal state
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowCategory, setNewRowCategory] = useState("");
  const [newRowUnit, setNewRowUnit] = useState("");

  // Column definitions for grid navigation
  // col 0=checkbox, 1=대분류(readonly), 2=관리단위(readonly), 3=담당자, 4=직급(readonly), 5=합계(readonly), 6~17=months, 18=actions
  const FIRST_EDITABLE_COL = 3;
  const MONTH_COL_START = 6;
  const MONTH_COL_END = 6 + MONTHS.length - 1;
  const TOTAL_COLS = MONTH_COL_END + 1;

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const enabledUnits = rows.filter((r) => r.enabled).map((r) => ({
        category: r.budget_category,
        unit_name: r.budget_unit,
      }));
      const uniqueUnits = enabledUnits.filter((u, i, arr) =>
        arr.findIndex((x) => x.category === u.category && x.unit_name === u.unit_name) === i
      );
      const res = await fetch(`${API_BASE}/api/v1/budget-assist/suggest`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_code: projectCode,
          et_controllable: etControllable,
          enabled_units: uniqueUnits,
          members: members.filter((m) => m.role === "FLDT").map((m) => ({ empno: m.empno, name: m.name, grade: m.grade })),
          client_info: clientInfo,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "AI 추천 실패" }));
        throw new Error(errData.detail || "AI 추천 실패");
      }
      const data = await res.json();
      setAiResult({ type: "suggest", data });
    } catch (e) {
      alert(e instanceof Error ? e.message : "AI 추천 오류");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiValidate = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/budget-assist/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_code: projectCode,
          et_controllable: etControllable,
          rows: rows.filter((r) => r.enabled).map((r) => ({
            budget_category: r.budget_category,
            budget_unit: r.budget_unit,
            months: r.months,
            enabled: r.enabled,
          })),
          client_info: clientInfo,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "AI 검증 실패" }));
        throw new Error(errData.detail || "AI 검증 실패");
      }
      const data = await res.json();
      setAiResult({ type: "validate", data });
    } catch (e) {
      alert(e instanceof Error ? e.message : "AI 검증 오류");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestions = () => {
    if (!aiResult || aiResult.type !== "suggest") return;
    const suggestions = (aiResult.data.suggestions || []) as { category: string; unit_name: string; hours: number }[];
    const newRows = [...rows];
    for (const s of suggestions) {
      const idx = newRows.findIndex(
        (r) => r.budget_category === s.category && r.budget_unit === s.unit_name && r.enabled
      );
      if (idx >= 0) {
        const months = { ...newRows[idx].months };
        const monthKeys = Object.keys(months).filter((k) => k.startsWith("20"));
        if (monthKeys.length > 0) {
          const perMonth = Math.floor(s.hours / monthKeys.length);
          const remainder = s.hours - perMonth * monthKeys.length;
          monthKeys.forEach((k, i) => {
            months[k] = perMonth + (i === 0 ? remainder : 0);
          });
        }
        newRows[idx] = { ...newRows[idx], months };
      }
    }
    setRows(newRows);
    setAiResult(null);
  };

  // 대분류/관리단위 sort_order 기반 정렬 인덱스 생성 (enabled rows only on top)
  const sortedIndices = useMemo(() => {
    const unitOrderMap = new Map<string, number>();
    budgetUnits.forEach((u) => {
      unitOrderMap.set(`${u.category}|${u.unit_name}`, u.sort_order);
    });
    const indices = rows.map((_, i) => i);
    indices.sort((a, b) => {
      const ra = rows[a], rb = rows[b];
      // Enabled rows first
      if (ra.enabled !== rb.enabled) return ra.enabled ? -1 : 1;
      const oa = unitOrderMap.get(`${ra.budget_category}|${ra.budget_unit}`) ?? 9999;
      const ob = unitOrderMap.get(`${rb.budget_category}|${rb.budget_unit}`) ?? 9999;
      if (oa !== ob) return oa - ob;
      return (ra.emp_name || "").localeCompare(rb.emp_name || "");
    });
    return indices;
  }, [rows, budgetUnits]);

  // 대분류 목록 (unique)
  const categories = useMemo(() => {
    const cats = [...new Set(budgetUnits.map((u) => u.category))];
    return cats;
  }, [budgetUnits]);

  // 선택된 대분류에 해당하는 관리단위
  const filteredUnits = useMemo(() => {
    if (!newRowCategory) return [];
    return budgetUnits.filter((u) => u.category === newRowCategory);
  }, [budgetUnits, newRowCategory]);

  // 새 행 추가
  const addNewRow = () => {
    if (!newRowCategory || !newRowUnit) return;
    const defaultAssignee = members.find((m) => m.role === "FLDT 구성원") || members[0];
    const newRow: TemplateRow = {
      budget_category: newRowCategory,
      budget_unit: newRowUnit,
      empno: defaultAssignee?.empno || "",
      emp_name: defaultAssignee?.name || "",
      grade: defaultAssignee?.grade || "",
      months: {},
      enabled: true,
    };
    setRows([...rows, newRow]);
    setShowAddRow(false);
    setNewRowCategory("");
    setNewRowUnit("");
  };

  // 행 삭제
  const deleteRow = (idx: number) => {
    const newRows = rows.filter((_, i) => i !== idx);
    setRows(newRows);
    setActiveCell(null);
    setEditingCell(null);
  };

  // 셀 클릭 → 활성화
  const handleCellClick = (rowVisualIdx: number, col: number) => {
    setActiveCell({ row: rowVisualIdx, col });
    // 월별 셀이면 바로 편집 모드
    if (col >= MONTH_COL_START && col <= MONTH_COL_END) {
      setEditingCell({ row: rowVisualIdx, col });
    } else if (col === FIRST_EDITABLE_COL) {
      setEditingCell({ row: rowVisualIdx, col });
    } else {
      setEditingCell(null);
    }
  };

  // 키보드 네비게이션 (방향키는 항상 셀 이동)
  const handleGridKeyDown = (e: React.KeyboardEvent, rowVisualIdx: number, col: number) => {
    const enabledRowCount = sortedIndices.filter((i) => rows[i].enabled).length;
    let nextRow = rowVisualIdx;
    let nextCol = col;

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        nextCol = col - 1;
        if (nextCol < MONTH_COL_START) {
          nextCol = MONTH_COL_END;
          nextRow = rowVisualIdx - 1;
        }
      } else {
        nextCol = col + 1;
        if (nextCol > MONTH_COL_END) {
          nextCol = MONTH_COL_START;
          nextRow = rowVisualIdx + 1;
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      nextRow = rowVisualIdx + 1;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = rowVisualIdx + 1;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = rowVisualIdx - 1;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextCol = Math.min(col + 1, MONTH_COL_END);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextCol = Math.max(col - 1, MONTH_COL_START);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setActiveCell(null);
      return;
    } else {
      return;
    }

    // Clamp
    nextRow = Math.max(0, Math.min(nextRow, enabledRowCount - 1));
    nextCol = Math.max(MONTH_COL_START, Math.min(nextCol, MONTH_COL_END));

    setActiveCell({ row: nextRow, col: nextCol });
    setEditingCell({ row: nextRow, col: nextCol });

    // Focus the target input
    requestAnimationFrame(() => {
      const input = gridRef.current?.querySelector(
        `[data-row="${nextRow}"][data-col="${nextCol}"] input`
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  };

  async function handleExportTemplate() {
    const res = await fetch(
      `${API_BASE}/api/v1/budget/projects/${projectCode}/template/export`,
      { credentials: "include" }
    );
    if (!res.ok) {
      alert("다운로드 실패");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${projectCode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("기존 Time Budget 데이터가 모두 교체됩니다. 계속하시겠습니까?")) {
      e.target.value = "";
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(
        `${API_BASE}/api/v1/budget/projects/${projectCode}/template/upload`,
        { method: "POST", body: fd, credentials: "include" }
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({ detail: "업로드 실패" }));
        alert(d.detail || "업로드 실패");
        return;
      }
      const data = await r.json();
      alert(`${data.imported_count}건 업로드 완료. Time Budget을 다시 로드합니다.`);
      if (typeof onTemplateImported === "function") {
        await onTemplateImported();
      } else {
        const u = new URL(window.location.href);
        window.location.href = u.toString();
      }
    } catch (err) {
      alert(`업로드 오류: ${err instanceof Error ? err.message : "알 수 없음"}`);
    }
    e.target.value = "";
  }

  const diff = templateTotal.total - etControllable;

  let lastCategory = "";
  let visualRowIdx = 0;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium">
          총 배분:{" "}
          <span className="font-bold text-pwc-black">
            {templateTotal.total.toLocaleString()}h
          </span>
        </span>
        <span className="text-pwc-gray-600">
          ET Controllable: {etControllable.toLocaleString()}h
        </span>
        <span
          className={`font-medium ${
            diff === 0
              ? "text-pwc-green"
              : diff > 0
              ? "text-pwc-red"
              : "text-pwc-yellow"
          }`}
        >
          {diff === 0
            ? "일치"
            : diff > 0
            ? `+${diff.toLocaleString()}h 초과`
            : `${diff.toLocaleString()}h 부족`}
        </span>
      </div>

      {/* AI Assist + Add Row Buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* 월/분기 view toggle */}
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`px-2 py-1 rounded ${
              viewMode === "month"
                ? "bg-pwc-orange text-white"
                : "border border-pwc-gray-200 text-pwc-gray-600"
            }`}
          >월</button>
          <button
            type="button"
            onClick={() => setViewMode("quarter")}
            className={`px-2 py-1 rounded ${
              viewMode === "quarter"
                ? "bg-pwc-orange text-white"
                : "border border-pwc-gray-200 text-pwc-gray-600"
            }`}
          >분기</button>
        </div>
        <button
          onClick={handleAiSuggest}
          disabled={aiLoading || etControllable <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-pwc-orange to-[#EB8C00] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          {aiLoading ? "분석 중..." : "AI 추천"}
        </button>
        <button
          onClick={handleAiValidate}
          disabled={aiLoading || templateTotal.total <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pwc-orange text-pwc-orange rounded-lg hover:bg-orange-50 disabled:opacity-40 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {aiLoading ? "검증 중..." : "AI 검증"}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (!confirm("Time Budget 의 모든 입력값을 초기화 합니다. 계속하시겠습니까?")) return;
            setRows(rows.map((r) => ({
              ...r,
              enabled: false,
              empno: "",
              emp_name: "",
              grade: "",
              months: Object.fromEntries(MONTHS.map((m) => [m, 0])) as Record<string, number>,
            })));
          }}
          className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-lg hover:bg-pwc-gray-50 text-pwc-gray-900"
        >
          🔄 초기화
        </button>
        <button
          type="button"
          onClick={handleExportTemplate}
          className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-md hover:bg-pwc-gray-50 text-pwc-gray-900"
        >
          📥 Excel 다운로드
        </button>
        <label className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-md hover:bg-pwc-gray-50 text-pwc-gray-900 cursor-pointer">
          📤 Excel 업로드
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImportTemplate}
          />
        </label>
        <button
          disabled={categories.length === 0}
          title={categories.length === 0 ? "해당 서비스의 관리단위가 아직 설정되지 않았습니다. 관리자에게 문의하세요." : undefined}
          onClick={() => setShowAddRow(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pwc-black text-pwc-black rounded-lg hover:bg-pwc-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          행 추가
        </button>
      </div>

      {/* Add Row Modal */}
      {showAddRow && (
        <div className="border border-pwc-gray-200 bg-white rounded-lg p-4 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-pwc-black">새 행 추가</h4>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-pwc-gray-600 mb-1">대분류</label>
              <select
                value={newRowCategory}
                onChange={(e) => { setNewRowCategory(e.target.value); setNewRowUnit(""); }}
                className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
              >
                <option value="">선택하세요</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-pwc-gray-600 mb-1">Budget 관리단위</label>
              <select
                value={newRowUnit}
                onChange={(e) => setNewRowUnit(e.target.value)}
                disabled={!newRowCategory}
                className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange disabled:bg-pwc-gray-50"
              >
                <option value="">선택하세요</option>
                {filteredUnits.map((u, ui) => (
                  <option key={`${ui}-${u.unit_name}`} value={u.unit_name}>{u.unit_name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={addNewRow}
              disabled={!newRowCategory || !newRowUnit}
              className="px-4 py-1.5 text-sm font-medium bg-pwc-black text-white rounded hover:bg-pwc-gray-900 disabled:opacity-40 transition-colors"
            >
              추가
            </button>
            <button
              onClick={() => { setShowAddRow(false); setNewRowCategory(""); setNewRowUnit(""); }}
              className="px-3 py-1.5 text-sm text-pwc-gray-600 hover:text-pwc-black"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* AI Result Panel */}
      {aiResult && (
        <div className="border border-pwc-orange/30 bg-orange-50/50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-pwc-orange flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {aiResult.type === "suggest" ? "AI 추천 결과" : "AI 검증 결과"}
            </h4>
            <button onClick={() => setAiResult(null)} className="text-pwc-gray-600 hover:text-pwc-black text-xs">
              닫기 ✕
            </button>
          </div>
          <p className="text-pwc-gray-900">{(aiResult.data.summary as string) || ""}</p>
          {aiResult.type === "suggest" && (
            <>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border border-pwc-gray-200 rounded">
                  <thead className="bg-pwc-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">대분류</th>
                      <th className="px-2 py-1 text-left">관리단위</th>
                      <th className="px-2 py-1 text-right">추천시간</th>
                      <th className="px-2 py-1 text-left">근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((aiResult.data.suggestions || []) as { category: string; unit_name: string; hours: number; reason: string }[]).map((s, i) => (
                      <tr key={i} className="border-t border-pwc-gray-100">
                        <td className="px-2 py-1">{s.category}</td>
                        <td className="px-2 py-1">{s.unit_name}</td>
                        <td className="px-2 py-1 text-right font-medium">{s.hours}</td>
                        <td className="px-2 py-1 text-pwc-gray-600">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={applyAiSuggestions}
                className="px-3 py-1.5 text-xs font-medium bg-pwc-orange text-white rounded hover:bg-[#B8400A] transition-colors"
              >
                추천값 적용하기
              </button>
            </>
          )}
          {aiResult.type === "validate" && (
            <div className="space-y-1">
              {((aiResult.data.feedback || []) as { type: string; message: string; unit?: string }[]).map((f, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-xs px-2 py-1 rounded ${
                    f.type === "warning" ? "bg-red-50 text-pwc-red" :
                    f.type === "ok" ? "bg-green-50 text-pwc-green" :
                    "bg-blue-50 text-blue-700"
                  }`}
                >
                  <span>{f.type === "warning" ? "⚠️" : f.type === "ok" ? "✅" : "ℹ️"}</span>
                  <span>{f.message}{f.unit ? ` (${f.unit})` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Excel-like Spreadsheet Grid */}
      <div className="overflow-x-auto border border-pwc-gray-200 rounded-lg shadow-sm pb-24">
        <table ref={gridRef} className="w-full text-xs whitespace-nowrap border-collapse select-none" style={{ tableLayout: "fixed" }}>
          <colgroup><col style={{ width: 32 }} /><col style={{ width: 100 }} /><col style={{ width: 180 }} /><col style={{ width: 140 }} /><col style={{ width: 68 }} /><col style={{ width: 56 }} />{viewMode === "month" ? MONTHS.map((m) => <col key={m} style={{ width: 52 }} />) : QUARTERS.map((q) => <col key={q.label} style={{ width: 72 }} />)}<col style={{ width: 56 }} /></colgroup>
          <thead className="bg-pwc-gray-50 sticky top-0 z-10">
            <tr className="border-b border-pwc-gray-200">
              <th className="px-1 py-2 text-center font-semibold text-pwc-gray-600">
                <span title="해당">V</span>
              </th>
              <th className="px-2 py-2 text-left font-semibold text-pwc-gray-600">대분류</th>
              <th className="px-2 py-2 text-left font-semibold text-pwc-gray-600">Budget 관리단위</th>
              <th className="px-2 py-2 text-left font-semibold text-pwc-gray-600">담당자</th>
              <th className="px-2 py-2 text-left font-semibold text-pwc-gray-600">직급</th>
              <th className="px-2 py-2 text-right font-semibold text-pwc-gray-600">합계</th>
              {viewMode === "month"
                ? MONTH_LABELS.map((label, i) => (
                    <th key={MONTHS[i]} className="px-1 py-2 text-right font-semibold text-pwc-gray-600">{label}</th>
                  ))
                : QUARTERS.map((q) => (
                    <th key={q.label} className="px-1 py-2 text-right font-semibold text-pwc-gray-600">{q.label}</th>
                  ))}
              <th className="px-1 py-2 text-center font-semibold text-pwc-gray-600">
                <span title="복제/삭제">...</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => { visualRowIdx = 0; lastCategory = ""; return null; })()}
            {sortedIndices.map((idx) => {
              const row = rows[idx];
              const showCategory = row.budget_category !== lastCategory;
              lastCategory = row.budget_category;
              const total = rowTotal(row);
              const currentVisualRow = visualRowIdx;
              visualRowIdx++;

              return (
                <tr
                  key={idx}
                  className={`border-b border-pwc-gray-100 hover:bg-blue-50/30 transition-colors ${
                    !row.enabled ? "opacity-30 bg-pwc-gray-50" : ""
                  } ${showCategory ? "border-t-2 border-t-pwc-gray-300" : ""}`}
                >
                  {/* Checkbox */}
                  <td className="px-1 py-0.5 text-center border-r border-pwc-gray-100">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={() => toggleRow(idx)}
                      className="accent-pwc-orange cursor-pointer"
                    />
                  </td>
                  {/* 대분류 */}
                  <td className="px-2 py-0.5 text-pwc-gray-500 border-r border-pwc-gray-100 truncate" title={row.budget_category}>
                    {showCategory ? row.budget_category : ""}
                  </td>
                  {/* 관리단위 */}
                  <td className="px-0.5 py-0.5 border-r border-pwc-gray-100">
                    <select
                      value={row.budget_unit}
                      onChange={(e) => {
                        const newUnit = e.target.value;
                        const duplicate = rows.some((r, i) =>
                          i !== idx && r.enabled && r.budget_category === row.budget_category &&
                          r.budget_unit === newUnit && r.empno === row.empno && row.empno !== ""
                        );
                        if (duplicate) {
                          alert("동일인이 동일한 대분류/관리단위에 이미 배정되어 있습니다.");
                          return;
                        }
                        const newRows = [...rows];
                        newRows[idx] = { ...newRows[idx], budget_unit: newUnit };
                        setRows(newRows);
                      }}
                      disabled={!row.enabled}
                      className="w-full px-1 py-1 text-xs font-medium bg-transparent border-0 focus:outline-none focus:ring-0 disabled:opacity-50 cursor-pointer truncate"
                    >
                      {budgetUnits
                        .filter((u) => u.category === row.budget_category)
                        .map((u, ui) => (
                          <option key={`${ui}-${u.unit_name}`} value={u.unit_name}>{u.unit_name}</option>
                        ))}
                    </select>
                  </td>
                  {/* 담당자 */}
                  <td
                    className={`px-0.5 py-0.5 border-r border-pwc-gray-100 ${
                      activeCell?.row === currentVisualRow && activeCell?.col === FIRST_EDITABLE_COL
                        ? "bg-blue-50 ring-2 ring-blue-400 ring-inset"
                        : ""
                    }`}
                    onClick={() => row.enabled && handleCellClick(currentVisualRow, FIRST_EDITABLE_COL)}
                  >
                    <select
                      value={row.empno}
                      onChange={(e) => {
                        const newEmpno = e.target.value;
                        const duplicate = rows.some((r, i) =>
                          i !== idx && r.enabled && r.budget_category === row.budget_category &&
                          r.budget_unit === row.budget_unit && r.empno === newEmpno && newEmpno !== ""
                        );
                        if (duplicate) {
                          alert("동일인이 동일한 대분류/관리단위에 이미 배정되어 있습니다.");
                          return;
                        }
                        const m = members.find((m) => m.empno === newEmpno);
                        updateRowAssignee(idx, newEmpno, m?.name || newEmpno, m?.grade || "");
                      }}
                      disabled={!row.enabled}
                      className="w-full px-1 py-1 text-xs bg-transparent border-0 focus:outline-none focus:ring-0 disabled:opacity-50 cursor-pointer"
                    >
                      <option value="">선택</option>
                      {[...members]
                        .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))
                        .map((m) => (
                          <option key={`${m.empno}-${m.name}`} value={m.empno}>
                            {m.name}{m.empno ? ` (${m.empno})` : ""}
                          </option>
                        ))}
                    </select>
                  </td>
                  {/* 직급 */}
                  <td className="px-2 py-0.5 text-pwc-gray-700 border-r border-pwc-gray-100 truncate" title={row.grade || (members.find((m) => m.empno === row.empno)?.grade ?? "")}>
                    {row.grade || members.find((m) => m.empno === row.empno)?.grade || ""}
                  </td>
                  {/* 합계 */}
                  <td className="px-2 py-0.5 text-right font-bold border-r border-pwc-gray-200 bg-pwc-gray-50/50">
                    {total > 0 ? total : ""}
                  </td>
                  {/* 월별 셀 */}
                  {viewMode === "month"
                    ? MONTHS.map((month, mi) => {
                        const colIdx = MONTH_COL_START + mi;
                        const isActive = activeCell?.row === currentVisualRow && activeCell?.col === colIdx;
                        const isEditing = editingCell?.row === currentVisualRow && editingCell?.col === colIdx;

                        return (
                          <td
                            key={month}
                            data-row={currentVisualRow}
                            data-col={colIdx}
                            className={`px-0 py-0 text-right border-r border-pwc-gray-100 cursor-cell ${
                              isActive
                                ? "bg-blue-50 ring-2 ring-blue-400 ring-inset"
                                : row.months[month]
                                ? ""
                                : ""
                            }`}
                            onClick={() => row.enabled && handleCellClick(currentVisualRow, colIdx)}
                          >
                            {isEditing && row.enabled ? (
                              <NumberField
                                autoFocus
                                value={row.months[month] || 0}
                                step={0.25}
                                min={0}
                                max={300}
                                onChange={(v) => updateRowMonth(idx, month, v)}
                                onKeyDown={(e) => handleGridKeyDown(e, currentVisualRow, colIdx)}
                                onBlur={() => { setEditingCell(null); }}
                                className="w-full h-full px-1 py-1 text-xs text-right bg-white border-0 outline-none"
                              />
                            ) : (
                              <div className="px-1 py-1 min-h-[24px] text-xs">
                                {row.months[month] || ""}
                              </div>
                            )}
                          </td>
                        );
                      })
                    : QUARTERS.map((q) => {
                        const sum = q.months.reduce((s, m) => s + (row.months?.[m] ?? 0), 0);
                        return (
                          <td key={q.label} className="text-right text-xs text-pwc-gray-700 px-2 border-r border-pwc-gray-100">
                            {sum > 0 ? sum.toLocaleString("ko-KR") : ""}
                          </td>
                        );
                      })}
                  {/* Actions */}
                  <td className="px-1 py-0.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => duplicateRow(idx)}
                        disabled={!row.enabled}
                        className="p-0.5 text-pwc-gray-400 hover:text-pwc-black disabled:opacity-20"
                        title="행 복제"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteRow(idx)}
                        className="p-0.5 text-pwc-gray-400 hover:text-pwc-red"
                        title="행 삭제"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="border-t-2 border-pwc-black bg-pwc-gray-100 font-bold">
              <td colSpan={4} className="px-2 py-2 text-right">
                합계
              </td>
              <td className="px-2 py-2 text-right">
                {templateTotal.total > 0 ? templateTotal.total.toLocaleString() : ""}
              </td>
              {viewMode === "month"
                ? MONTHS.map((month) => (
                    <td key={month} className="px-1 py-2 text-right">
                      {templateTotal.monthTotals[month] > 0
                        ? templateTotal.monthTotals[month]
                        : ""}
                    </td>
                  ))
                : QUARTERS.map((q) => {
                    const total = q.months.reduce((s, m) => s + (templateTotal.monthTotals[m] ?? 0), 0);
                    return (
                      <td key={q.label} className="px-1 py-2 text-right">
                        {total > 0 ? total.toLocaleString("ko-KR") : ""}
                      </td>
                    );
                  })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
