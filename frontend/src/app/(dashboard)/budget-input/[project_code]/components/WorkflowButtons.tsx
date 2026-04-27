"use client";

import type { ProjectInfo } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface WorkflowButtonsProps {
  projectCode: string;
  project: ProjectInfo;
  setProject: React.Dispatch<React.SetStateAction<ProjectInfo>>;
  isNew?: boolean;
}

export function WorkflowButtons({
  projectCode,
  project,
  setProject,
  isNew,
}: WorkflowButtonsProps) {
  if (isNew) return null;

  return (
    <>
      {/* POL-04 워크플로우 */}
      {project.template_status === "작성중" && (
        <button
          type="button"
          onClick={async () => {
            const res = await fetch(
              `${API_BASE}/api/v1/budget/projects/${projectCode}/submit`,
              { method: "POST", credentials: "include" }
            );
            if (res.ok) {
              const data = await res.json();
              setProject((prev: ProjectInfo) => ({
                ...prev,
                template_status: data.template_status,
              }));
              alert("작성완료로 제출되었습니다.");
            } else {
              const d = await res.json().catch(() => ({}));
              alert(
                `제출 실패: ${(d as { detail?: string }).detail || res.statusText}`
              );
            }
          }}
          className="px-4 py-1.5 text-sm font-medium bg-pwc-orange text-white rounded hover:bg-[#B83D02] transition-colors"
        >
          작성완료 제출
        </button>
      )}

      {project.template_status === "작성완료" && (
        <button
          type="button"
          onClick={async () => {
            if (
              !confirm(
                "이 프로젝트를 승인하시겠습니까? 승인 후 편집이 잠깁니다."
              )
            )
              return;
            const res = await fetch(
              `${API_BASE}/api/v1/budget/projects/${projectCode}/approve`,
              { method: "POST", credentials: "include" }
            );
            if (res.ok) {
              const data = await res.json();
              setProject((prev: ProjectInfo) => ({
                ...prev,
                template_status: data.template_status,
              }));
              alert("승인되었습니다.");
            } else {
              const d = await res.json().catch(() => ({}));
              alert(
                `승인 실패: ${(d as { detail?: string }).detail || res.statusText}`
              );
            }
          }}
          className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
        >
          승인
        </button>
      )}

      {project.template_status === "승인완료" && (
        <button
          type="button"
          onClick={async () => {
            if (
              !confirm(
                "이 프로젝트의 락을 해제하시겠습니까? 작성중 상태로 돌아갑니다."
              )
            )
              return;
            const res = await fetch(
              `${API_BASE}/api/v1/budget/projects/${projectCode}/unlock`,
              { method: "POST", credentials: "include" }
            );
            if (res.ok) {
              const data = await res.json();
              setProject((prev: ProjectInfo) => ({
                ...prev,
                template_status: data.template_status,
              }));
              alert("락이 해제되었습니다.");
            } else {
              const d = await res.json().catch(() => ({}));
              alert(
                `락 해제 실패: ${(d as { detail?: string }).detail || res.statusText}`
              );
            }
          }}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          락 해제
        </button>
      )}
    </>
  );
}
