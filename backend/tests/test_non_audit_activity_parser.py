"""Tests for non-audit activity Excel parser."""
import os
from pathlib import Path

import pytest

from app.services.non_audit_activity_import import (
    SERVICE_TYPE_SHEET_MAP,
    parse_non_audit_activities,
)


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "files" / "비감사 Activity 표준화_260420.xlsx"


@pytest.fixture(scope="module")
def parsed():
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    return parse_non_audit_activities(str(FIXTURE_PATH))


def test_sheet_map_has_seven_non_audit_services():
    assert set(SERVICE_TYPE_SHEET_MAP.values()) == {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_parsed_contains_all_seven_services(parsed):
    service_types_returned = {row["service_type"] for row in parsed}
    assert service_types_returned == {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_row_shape(parsed):
    sample = parsed[0]
    for key in ("service_type", "task_category", "activity_subcategory", "activity_detail", "budget_unit", "role", "sort_order"):
        assert key in sample


def test_esg_rows_counted(parsed):
    esg = [r for r in parsed if r["service_type"] == "ESG"]
    assert 10 <= len(esg) <= 40


def test_trade_rows_nonempty(parsed):
    trade = [r for r in parsed if r["service_type"] == "TRADE"]
    assert len(trade) >= 1
    for r in trade:
        assert r["task_category"], f"row missing task_category: {r}"


def test_blank_rows_skipped(parsed):
    for r in parsed:
        assert r["task_category"] or r["activity_detail"], f"blank row slipped through: {r}"
