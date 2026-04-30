"use client";

import { useState } from "react";
import { NumberField } from "@/components/ui/NumberField";
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
} from "@/lib/budget-constants";
import { ClientSearchModal } from "./ClientSearchModal";
import { ProjectSearchModal } from "./ProjectSearchModal";
import type { ProjectInfo, ClientInfo } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── CloneProjectModal ────────────────────────────────────
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

// ── Step1Form ────────────────────────────────────────────

interface Step1FormProps {
  project: ProjectInfo;
  setProject: (p: ProjectInfo) => void;
  client: ClientInfo;
  setClient: (c: ClientInfo | ((prev: ClientInfo) => ClientInfo)) => void;
  etControllable: number;
  isNew: boolean;
  onCloneFromProject: (projectCode: string) => void;
}

export function Step1Form({
  project,
  setProject,
  client,
  setClient,
  etControllable,
  isNew,
  onCloneFromProject,
}: Step1FormProps) {
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
                setClient({
                  ...c,
                  industry: info.industry || c.industry || "",
                  asset_size: info.asset_size || c.asset_size || "",
                  listing_status: info.listing_status || c.listing_status || "",
                  business_report:
                    info.business_report || c.business_report || "",
                  gaap: info.gaap || c.gaap || "",
                  consolidated: info.consolidated || c.consolidated || "",
                  subsidiary_count:
                    info.subsidiary_count || c.subsidiary_count || "",
                  internal_control:
                    info.internal_control || c.internal_control || "",
                  initial_audit: info.initial_audit || c.initial_audit || "",
                });
              } else {
                setClient({
                  ...c,
                  industry: c.industry || "",
                  asset_size: c.asset_size || "",
                  listing_status: c.listing_status || "",
                  business_report: c.business_report || "",
                  gaap: c.gaap || "",
                  consolidated: c.consolidated || "",
                  subsidiary_count: c.subsidiary_count || "",
                  internal_control: c.internal_control || "",
                  initial_audit: c.initial_audit || "",
                });
              }
            } catch {
              setClient({
                ...c,
                industry: c.industry || "",
                asset_size: c.asset_size || "",
                listing_status: c.listing_status || "",
                business_report: c.business_report || "",
                gaap: c.gaap || "",
                consolidated: c.consolidated || "",
                subsidiary_count: c.subsidiary_count || "",
                internal_control: c.internal_control || "",
                initial_audit: c.initial_audit || "",
              });
            }
          }}
          onClose={() => setShowClientSearch(false)}
        />
      )}

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
                  setClient((prev) => ({
                    ...prev,
                    client_code: code,
                    industry: info.industry || "",
                    asset_size: info.asset_size || "",
                    listing_status: info.listing_status || "",
                    business_report: info.business_report || "",
                    gaap: info.gaap || "",
                    consolidated: info.consolidated || "",
                    subsidiary_count: info.subsidiary_count || "",
                    internal_control: info.internal_control || "",
                    initial_audit: info.initial_audit || "",
                  }));
                }
              } catch {
                /* silent fail — client info autofill is best-effort */
              }
            }
          }}
          onClose={() => setShowProjectSearch(false)}
        />
      )}

      {/* 1. 서비스 분류 */}
      <section>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-pwc-gray-100">
          <h3 className="text-sm font-bold text-pwc-black">서비스 분류</h3>
        </div>
        <div className="max-w-xs">
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
      </section>

      {/* 2. 클라이언트 기본정보 */}
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

      {/* 3. 프로젝트 정보 */}
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
              placeholder="프로젝트명"
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
              value={project.qrp_name ? `${project.qrp_name}(${project.qrp_empno})` : project.qrp_empno}
              onChange={(e) => pField("qrp_empno", e.target.value)}
              placeholder="QRP 사번 입력 또는 검색"
              className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
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
          </div>
          <p className="text-xs text-pwc-gray-600 italic mt-1">
            ※ Fulcrum / RA-Staff / Specialist 시간은 Step 3 (Time Budget) 에서 분배 입력합니다.
          </p>
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
