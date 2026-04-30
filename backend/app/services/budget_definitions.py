"""Single source of truth for Budget semantic computations.

Why this module exists:
  - "Budget" has multiple legitimate meanings (총 계약시간 / 총계약−AX/DX / Staff
    배부분 / ET Controllable). Spreading the math across services led to drift
    (영역 6 결함들). This module centralizes definitions; callers must use these
    functions instead of inline arithmetic.
  - Enforced by scripts/ci/check-no-direct-budget-arithmetic.sh.

POL-01 (메타 spec) decides which definition each *view* uses; until decided,
display_budget() raises NotImplementedError.
"""
from typing import Literal


def _f(v) -> float:
    """Coerce None / missing to 0.0."""
    return float(v) if v is not None else 0.0


def total_contract_hours(project) -> float:
    """B시트 C15 — 총 계약시간."""
    return _f(getattr(project, "contract_hours", None))


def axdx_excluded_budget(project) -> float:
    """총 계약시간 − AX/DX 시간 (= '중계약시간-AX/DX').

    Used by Power BI 프로젝트 테이블 Budget column. POL-01 candidate (b).
    """
    return total_contract_hours(project) - _f(getattr(project, "axdx_hours", None))


def staff_controllable_budget(project) -> float:
    """ET Controllable Budget — Step 3에서 분배 가능한 시간.

    Computed at Step 1 input time; persisted in `et_controllable_budget` column.
    """
    return _f(getattr(project, "et_controllable_budget", None))


def staff_actual_budget(project_code: str) -> float:
    """budget_details 합계 — 실제 분배된 시간. Requires DB session.

    Implemented in budget_service if/when called. Placeholder until needed.
    """
    raise NotImplementedError(
        "staff_actual_budget requires DB session; wire up at call site"
    )


BudgetView = Literal[
    "overview_kpi_total_contract",
    "overview_project_table_budget",
    "tracking_budget_hour",
    "summary_project_budget",
]


def display_budget(project, *, view: BudgetView) -> float:
    """View별 표시 Budget — POL-01 결정 후 routing.

    POL-01 미결정 동안 raise NotImplementedError. 영역 6에서 활성화.
    """
    raise NotImplementedError(
        f"display_budget(view={view!r}) blocked: POL-01 미결정. "
        "메타 spec 1.4 + policy-decisions.md 참고."
    )
