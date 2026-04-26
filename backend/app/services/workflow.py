"""POL-04 표준형 워크플로우 — single source of state transitions.

상태: 작성중 → 작성완료 → 승인완료 (단방향) + 승인완료 → 작성중 (락 해제)

권한:
- 작성중 → 작성완료: 해당 프로젝트의 PM 또는 admin
- 작성완료 → 승인완료: 해당 프로젝트의 EL 또는 admin
- 승인완료 → 작성중: 해당 프로젝트의 EL 또는 admin
- admin (scope=all): 모든 전이 허용

POL-04 외부 결정자 컨펌이 다른 안 (단순형/확장형) 으로 결정되면 본 모듈만 갱신.
"""
from __future__ import annotations
from typing import Literal


VALID_STATUSES = ("작성중", "작성완료", "승인완료")
StatusType = Literal["작성중", "작성완료", "승인완료"]

ALLOWED_TRANSITIONS = {
    ("작성중", "작성완료"): "pm",
    ("작성완료", "승인완료"): "el",
    ("승인완료", "작성중"): "el",
}


class WorkflowError(Exception):
    """Workflow transition validation failure."""


def transition_status(
    project,
    *,
    target_status: StatusType,
    actor_empno: str,
    actor_role: str,
) -> None:
    """Mutate project.template_status if transition is valid + actor authorized.

    Raises WorkflowError on invalid transition or unauthorized actor.
    Caller is responsible for db.commit().
    """
    if target_status not in VALID_STATUSES:
        raise WorkflowError(f"unknown target_status: {target_status!r}")

    current = project.template_status or "작성중"
    transition = (current, target_status)

    if actor_role == "admin":
        project.template_status = target_status
        return

    required_role = ALLOWED_TRANSITIONS.get(transition)
    if required_role is None:
        raise WorkflowError(
            f"invalid transition {current!r} → {target_status!r}"
        )

    if required_role == "pm":
        if str(getattr(project, "pm_empno", "")) != str(actor_empno):
            raise WorkflowError(
                f"PM 권한 필요 (현재: {actor_empno}, 프로젝트 PM: {project.pm_empno})"
            )
    elif required_role == "el":
        if str(getattr(project, "el_empno", "")) != str(actor_empno):
            raise WorkflowError(
                f"EL 권한 필요 (현재: {actor_empno}, 프로젝트 EL: {project.el_empno})"
            )

    project.template_status = target_status
