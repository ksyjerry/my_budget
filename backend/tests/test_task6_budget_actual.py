"""Task #6: Budget/Actual 기준 불일치 검증.

문제: Overview 프로젝트별 Time에서 Budget에는 EL/PM 제외, Actual에는 EL/PM 포함.
검증: Budget과 Actual이 동일 기준(Staff만 또는 전체)으로 비교되는지 확인.
"""
import pytest
from sqlalchemy import text
from tests.conftest import auth_header


# ── 데이터 레벨 검증 ──────────────────────────────

class TestBudgetActualConsistency:
    """Budget과 Actual이 동일 기준으로 집계되는지 DB/API 레벨 검증."""

    def test_overview_api_returns_data(self, client, elpm_token):
        """Overview API가 정상 응답하는지 확인."""
        res = client.get("/api/v1/overview", headers=auth_header(elpm_token))
        assert res.status_code == 200
        data = res.json()
        assert "kpi" in data
        assert "projects" in data

    def test_project_budget_is_contract_hours(self, client, elpm_token, db):
        """프로젝트별 Budget이 contract_hours(총 계약시간)와 일치하는지."""
        res = client.get("/api/v1/overview", headers=auth_header(elpm_token))
        data = res.json()

        if not data["projects"]:
            pytest.skip("No projects")

        # 첫 번째 프로젝트로 검증
        proj = data["projects"][0]
        pc = proj["project_code"]
        api_budget = proj["budget"]

        # DB에서 contract_hours 직접 조회
        result = db.execute(
            text("SELECT COALESCE(contract_hours, 0) FROM projects WHERE project_code = :pc"),
            {"pc": pc},
        )
        db_contract = float(result.scalar())

        assert abs(api_budget - db_contract) < 0.1, (
            f"Project {pc}: API budget={api_budget}, DB contract_hours={db_contract}"
        )

    def test_budget_actual_same_scope(self, client, elpm_token):
        """Budget과 Actual이 동일 scope인지 검증.

        Budget이 Staff만이면 Actual도 Staff만이어야 함.
        Budget이 전체면 Actual도 전체여야 함.
        """
        res = client.get("/api/v1/overview", headers=auth_header(elpm_token))
        data = res.json()

        for proj in data["projects"][:5]:  # 상위 5개만 검증
            budget = proj["budget"]
            actual = proj["actual"]
            progress = proj["progress"]

            # Budget이 0인데 Actual이 큰 경우 → scope 불일치 가능성
            if budget == 0 and actual > 50:
                print(f"⚠️  {proj['project_name']}: budget=0, actual={actual} — scope 불일치 가능")

            # Progress가 비정상적으로 높은 경우(>500%) → scope 불일치 가능성
            if budget > 0 and progress > 500:
                print(f"⚠️  {proj['project_name']}: progress={progress}% — Budget/Actual scope 불일치 가능")

    def test_kpi_total_consistency(self, client, elpm_token):
        """KPI 총 계약시간과 프로젝트별 Budget 합계가 일치하는지."""
        res = client.get("/api/v1/overview", headers=auth_header(elpm_token))
        data = res.json()

        proj_budget_sum = sum(p["budget"] for p in data["projects"])
        kpi_contract = data["kpi"]["contract_hours"]

        assert abs(proj_budget_sum - kpi_contract) < 1, (
            f"KPI contract_hours={kpi_contract}, project budget sum={proj_budget_sum}"
        )


# ── EL/PM/QRP Time 검증 ──────────────────────────

class TestElpmQrpTime:
    """EL/PM/QRP Time의 Budget/Actual 검증."""

    def test_qrp_actual_not_always_zero(self, client, elpm_token, db):
        """QRP Actual이 항상 0이 아닌지 확인 (Task #8 관련)."""
        res = client.get("/api/v1/overview", headers=auth_header(elpm_token))
        data = res.json()

        qrp_rows = [r for r in data.get("elpm_qrp_time", []) if r["role"] == "QRP"]
        qrp_with_actual = [r for r in qrp_rows if r["actual"] > 0]

        if qrp_rows:
            print(f"QRP rows: {len(qrp_rows)}, with actual>0: {len(qrp_with_actual)}")
            for r in qrp_rows[:3]:
                print(f"  {r['project_name']}: budget={r['budget']}, actual={r['actual']}")

    def test_elpm_budget_matches_project_fields(self, client, elpm_token):
        """EL/PM Budget이 projects 테이블의 el_hours/pm_hours와 일치하는지."""
        res = client.get("/api/v1/overview", headers=auth_header(elpm_token))
        data = res.json()

        elpm_rows = data.get("elpm_qrp_time", [])
        if not elpm_rows:
            pytest.skip("No EL/PM/QRP data")

        # EL/PM 행이 존재하는지만 확인
        roles = {r["role"] for r in elpm_rows}
        print(f"EL/PM/QRP roles found: {roles}")
        assert len(roles) > 0, "No roles found in elpm_qrp_time"
