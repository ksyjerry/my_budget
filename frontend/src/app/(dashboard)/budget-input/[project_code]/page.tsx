"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  Member,
  TemplateRow,
} from "./types";
import { computeStep3Errors } from "./lib/wizard-validators";
import { WorkflowButtons } from "./components/WorkflowButtons";
import { Step1Form } from "./components/Step1Form";
import { Step2Members } from "./components/Step2Members";
import { Step3Grid } from "./components/Step3Grid";
import { useWizardState } from "./hooks/useWizardState";

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

  const {
    project, setProject,
    client, setClient,
    members, setMembers,
    activityOptions,
    budgetUnits,
    templateRows, setTemplateRows,
    etControllable,
    MONTHS,
    MONTH_LABELS,
    templateTotal,
  } = useWizardState({ projectCode, step });

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
      const errors = computeStep3Errors(enabledRows, etControllable);
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
      <div className="flex flex-wrap items-center justify-between gap-y-2">
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
          {!isNew && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                project.template_status === "승인완료"
                  ? "bg-blue-50 text-blue-700"
                  : project.template_status === "작성완료"
                  ? "bg-green-50 text-pwc-green"
                  : "bg-yellow-50 text-pwc-orange"
              }`}
            >
              {project.template_status || "작성중"}
            </span>
          )}
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
        <div className="flex items-center gap-2">
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

          <WorkflowButtons
            projectCode={projectCode}
            project={project}
            setProject={setProject}
            isNew={isNew}
          />
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
                  `${API_BASE}/api/v1/budget/projects/${sourceCode}/clone-data`,
                  { credentials: "include" }
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
            setMembers={setMembers}
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
          <Step3Grid
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
            fiscalEnd={project.fiscal_end ?? null}
            onFiscalEndChange={(val) => setProject({ ...project, fiscal_end: val })}
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
