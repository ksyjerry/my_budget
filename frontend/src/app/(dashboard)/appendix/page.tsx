"use client";

import { useState } from "react";


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DownloadItem {
  label: string;
  description: string;
  endpoint: string;
  filename: string;
}

const sections: { title: string; icon: string; items: DownloadItem[] }[] = [
  {
    title: "Overview",
    icon: "01",
    items: [
      { label: "프로젝트 현황", description: "프로젝트별 Budget/Actual/진행률", endpoint: "overview", filename: "Overview_프로젝트현황" },
      { label: "활동별 Budget", description: "대분류별 Budget 시간 집계", endpoint: "engagement-time", filename: "Overview_활동별Budget" },
      { label: "EL/PM/QRP Time", description: "EL, PM, QRP 시간 배분", endpoint: "elpm-qrp-time", filename: "Overview_ELPMQRP" },
      { label: "Staff Time", description: "Staff별 Budget/Actual 시간", endpoint: "staff-time", filename: "Overview_StaffTime" },
    ],
  },
  {
    title: "Project별 Detail",
    icon: "02",
    items: [
      { label: "프로젝트 기본정보", description: "프로젝트 코드, EL/PM, 시간 배분", endpoint: "project", filename: "Project_기본정보" },
      { label: "인별 Budget Detail", description: "인원별 관리단위/월별 Budget 시간", endpoint: "person-detail", filename: "Project_인별Detail" },
      { label: "Budget 집계", description: "프로젝트×관리단위별 Budget 합계", endpoint: "budget-aggregate", filename: "Project_Budget집계" },
    ],
  },
  {
    title: "인별 Detail",
    icon: "03",
    items: [
      { label: "Budget Detail", description: "전체 Budget 상세 (프로젝트/관리단위/월별)", endpoint: "budget-detail", filename: "인별_BudgetDetail" },
      { label: "FLDT 구성원", description: "프로젝트별 ET 구성원 목록", endpoint: "fldt-detail", filename: "인별_FLDT구성원" },
    ],
  },
  {
    title: "Summary",
    icon: "04",
    items: [
      { label: "Summary", description: "프로젝트별 계약시간/Budget/Actual/YRA", endpoint: "summary", filename: "Summary_프로젝트별" },
      { label: "Group별 Summary", description: "부서별 프로젝트 요약", endpoint: "group-prj-summary", filename: "Summary_Group별" },
    ],
  },
  {
    title: "Raw Data",
    icon: "05",
    items: [
      { label: "Budget 원본", description: "budget_details 전체 데이터", endpoint: "budget", filename: "Raw_Budget" },
      { label: "Actual 원본", description: "TMS Actual 상세 데이터 (Azure)", endpoint: "actual", filename: "Raw_Actual" },
      { label: "Actual Detail", description: "Activity 코드 포함 Actual 상세", endpoint: "actual-detail", filename: "Raw_ActualDetail" },
    ],
  },
];

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function DownloadButton({ item }: { item: DownloadItem }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/export/${item.endpoint}`, { credentials: "include" });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("다운로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 w-full border border-pwc-gray-100 rounded-lg px-4 py-3 bg-white">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-pwc-black">{item.label}</div>
        <div className="text-xs text-pwc-gray-600 truncate">{item.description}</div>
      </div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-pwc-gray-100 text-pwc-gray-900 rounded hover:bg-pwc-gray-200 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <DownloadIcon />
        {loading ? "다운로드 중..." : "다운로드"}
      </button>
    </div>
  );
}

export default function AppendixPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-pwc-black">Excel Quick Download</h2>
        <p className="text-sm text-pwc-gray-600 mt-1">각 View의 데이터를 CSV 파일로 다운로드할 수 있습니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {sections.map((section) => (
          <div key={section.title} className="section-card">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-pwc-gray-100">
              <span className="w-6 h-6 rounded bg-pwc-orange text-white text-[10px] font-bold flex items-center justify-center">
                {section.icon}
              </span>
              <h3 className="text-sm font-bold text-pwc-black">{section.title}</h3>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <DownloadButton key={item.endpoint} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center space-y-0.5 pt-2">
        <p className="text-xs text-pwc-red font-medium">
          동 자료는 Assurance EL/PM 에게만 접근 권한이 있으며,
        </p>
        <p className="text-xs text-pwc-red font-medium">
          Download된 data도 접근 권한 없는 자에게 공개, 유출되지 않도록 주의하여 주시기 바랍니다.
        </p>
      </div>
    </div>
  );
}
