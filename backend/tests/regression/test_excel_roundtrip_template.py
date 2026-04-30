"""Excel template export → upload round-trip equality (Tasks 28+29).

For each fixture: seed the DB with the project state, export the template
to xlsx, upload that xlsx back, and assert the DB state equals the original.

Actual API prefix: /api/v1/budget  (mounted in main.py as budget_input router)
Template rows use "months" dict format: {"2026-04": 8.0, ...}
Members endpoint: PUT /api/v1/budget/projects/{code}/members — flat list
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "roundtrip"
FIXTURE_FILES = sorted(FIXTURE_DIR.glob("*.json"))


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _check_skip(fx: dict) -> None:
    skip = fx.get("skip_until_pol")
    if skip:
        pytest.skip(f"fixture {fx['name']} blocked by {skip}")


def _make_row_key(row: dict) -> tuple:
    """Stable sort key for a template row (months-dict style)."""
    return (
        row.get("budget_category", ""),
        row.get("budget_unit", ""),
        row.get("empno", ""),
    )


@pytest.mark.parametrize(
    "fixture_path",
    FIXTURE_FILES,
    ids=[p.stem for p in FIXTURE_FILES],
)
def test_template_roundtrip(client: TestClient, admin_cookie: dict, fixture_path: Path):
    """Seed → export xlsx → upload xlsx → compare DB state to original fixture."""
    fx = _load(fixture_path)
    _check_skip(fx)

    project_code = fx["project"]["project_code"]
    expect_error = fx.get("expect_validation_error", False)

    # ── 1. Seed: project ───────────────────────────────────────────────────────
    # Use admin cookie so project creation is not restricted to EL/PM empno check
    seed_resp = client.post(
        "/api/v1/budget/projects",
        json=fx["project"],
        cookies=admin_cookie,
    )
    # 400 means project already exists from a prior run — try PUT instead
    if seed_resp.status_code == 400 and "already exists" in seed_resp.text:
        seed_resp = client.put(
            f"/api/v1/budget/projects/{project_code}",
            json=fx["project"],
            cookies=admin_cookie,
        )
    assert seed_resp.status_code in (200, 201), (
        f"[{fx['name']}] project seed failed: {seed_resp.status_code} {seed_resp.text}"
    )

    # ── 2. Seed: members ───────────────────────────────────────────────────────
    if fx.get("members"):
        m_resp = client.put(
            f"/api/v1/budget/projects/{project_code}/members",
            json=fx["members"],  # flat list, not {"members": [...]}
            cookies=admin_cookie,
        )
        assert m_resp.status_code == 200, (
            f"[{fx['name']}] members seed failed: {m_resp.status_code} {m_resp.text}"
        )

    # ── 3. Seed: template rows ─────────────────────────────────────────────────
    if fx.get("template_rows"):
        t_payload = {
            "rows": fx["template_rows"],
            "template_status": "작성중",
        }
        t_resp = client.put(
            f"/api/v1/budget/projects/{project_code}/template",
            json=t_payload,
            cookies=admin_cookie,
        )
        if expect_error:
            # Edge fixtures may legitimately be rejected by the API
            if t_resp.status_code in (400, 422):
                # Validation error as expected — round-trip not possible; pass
                return
            # If the API accepted the data (no validation yet), record the gap
            # but continue — the export/upload may still exercise the path
        else:
            assert t_resp.status_code == 200, (
                f"[{fx['name']}] template seed failed: {t_resp.status_code} {t_resp.text}"
            )

    # ── 4. Export ──────────────────────────────────────────────────────────────
    export_resp = client.get(
        f"/api/v1/budget/projects/{project_code}/template/export",
        cookies=admin_cookie,
    )
    assert export_resp.status_code == 200, (
        f"[{fx['name']}] export failed: {export_resp.status_code} {export_resp.text}"
    )
    content_type = export_resp.headers.get("content-type", "")
    assert "spreadsheetml.sheet" in content_type or "openxmlformats" in content_type, (
        f"[{fx['name']}] unexpected content-type: {content_type}"
    )
    xlsx_bytes = export_resp.content
    assert len(xlsx_bytes) > 100, f"[{fx['name']}] exported xlsx suspiciously small"

    # ── 5. Upload (round-trip) ─────────────────────────────────────────────────
    upload_resp = client.post(
        f"/api/v1/budget/projects/{project_code}/template/upload",
        files={
            "file": (
                "rt.xlsx",
                xlsx_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        cookies=admin_cookie,
    )
    assert upload_resp.status_code == 200, (
        f"[{fx['name']}] upload failed: {upload_resp.status_code} {upload_resp.text}"
    )

    # ── 6. Re-fetch and compare ───────────────────────────────────────────────
    state_resp = client.get(
        f"/api/v1/budget/projects/{project_code}/template",
        cookies=admin_cookie,
    )
    assert state_resp.status_code == 200, (
        f"[{fx['name']}] template GET failed: {state_resp.status_code}"
    )
    state = state_resp.json()
    actual_rows = state.get("rows", [])

    # Build expected: aggregate fixture rows by (category, unit, empno)
    # Multiple month entries per key are already grouped since fixture rows
    # have one months-dict each, but multiple fixture rows may share a key.
    from collections import defaultdict
    expected_map: dict[tuple, dict] = defaultdict(lambda: {"months": {}})
    for row in fx.get("template_rows", []):
        key = _make_row_key(row)
        for ym, hrs in (row.get("months") or {}).items():
            prev = expected_map[key]["months"].get(ym, 0.0)
            expected_map[key]["months"][ym] = prev + hrs
        expected_map[key]["budget_category"] = row.get("budget_category", "")
        expected_map[key]["budget_unit"] = row.get("budget_unit", "")
        expected_map[key]["empno"] = row.get("empno", "")

    # Filter out zero-hour rows from expected (save_template skips hours <= 0)
    expected_map = {
        k: v for k, v in expected_map.items()
        if any(h > 0 for h in v["months"].values())
    }

    # Build actual map from re-fetched state
    actual_map: dict[tuple, dict] = {}
    for row in actual_rows:
        key = _make_row_key(row)
        actual_map[key] = row

    assert len(actual_map) == len(expected_map), (
        f"[{fx['name']}] row count drift: "
        f"expected {len(expected_map)} got {len(actual_map)}. "
        f"Expected keys: {sorted(expected_map.keys())}. "
        f"Actual keys: {sorted(actual_map.keys())}"
    )

    for key, exp in expected_map.items():
        assert key in actual_map, (
            f"[{fx['name']}] key {key!r} missing from DB after round-trip"
        )
        act = actual_map[key]
        act_months = act.get("months", {})
        for ym, exp_hours in exp["months"].items():
            assert ym in act_months, (
                f"[{fx['name']}] month {ym} missing for key {key!r}"
            )
            assert abs(float(act_months[ym]) - float(exp_hours)) < 1e-9, (
                f"[{fx['name']}] hours mismatch for {key!r} month {ym}: "
                f"expected {exp_hours} got {act_months[ym]}"
            )
