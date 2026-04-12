"""FY26 Adjusted EM Rate 기반 원가 계산 유틸.

공식: Budget Cost = Σ(직급별 시간 × 직급별 시간당 원가)
- 1~3월은 Busy Season 원가율, 그 외는 Non-Busy 원가율
- Partner 시간은 원가 0
- 모르는 grade는 0 (원가 미산정)
"""

# FY26 Total Cost (표준임율 + 표준경비율, 단위: 원/시간)
FY26_RATES: dict[str, dict[str, float]] = {
    "P": {"nonbusy": 0, "busy": 0},
    "MD": {"nonbusy": 171970.8, "busy": 248622},
    "D": {"nonbusy": 130458.4, "busy": 188606.5},
    "SM": {"nonbusy": 111606, "busy": 161351.25},
    "M": {"nonbusy": 98430.2, "busy": 142302.5},
    "SA": {"nonbusy": 76354.4, "busy": 110387},
    "A": {"nonbusy": 53803.6, "busy": 77785},
    "AA": {"nonbusy": 39306.4, "busy": 56826.25},
}

# DB의 grade 값 → 표준 code 매핑
_GRADE_ALIASES: dict[str, str] = {
    # Partner
    "P": "P", "Ptr": "P", "Partner": "P",
    # Managing Director
    "MD": "MD", "Managing Director": "MD",
    # Director
    "D": "D", "Dir": "D", "Director": "D",
    # Senior Manager
    "SM": "SM", "Sr.Manager": "SM", "Senior-Manager": "SM", "Sr Manager": "SM",
    # Manager
    "M": "M", "Manager": "M", "Manager 1": "M", "Manager 2": "M",
    # Senior Associate
    "SA": "SA", "SA1": "SA", "SA2": "SA",
    "Sr.Associate": "SA", "Senior-Associate": "SA",
    "Senior-Associate 1": "SA", "Senior-Associate 2": "SA",
    # Associate
    "A": "A", "Associate": "A",
    # Assistant Associate
    "AA": "AA", "A.Associate": "AA", "Assistant-Associate": "AA",
}


def normalize_grade(raw: str | None) -> str | None:
    """원시 grade 값을 FY26 rate 테이블 키로 정규화."""
    if not raw:
        return None
    return _GRADE_ALIASES.get(raw.strip())


def is_busy_season(year_month: str) -> bool:
    """year_month ('2026-01' 또는 '202601') → Busy Season 여부."""
    if not year_month:
        return False
    # "2026-01" or "202601"
    if "-" in year_month:
        month_str = year_month.split("-")[1]
    else:
        month_str = year_month[4:6]
    try:
        month = int(month_str)
    except (ValueError, TypeError):
        return False
    return month in (1, 2, 3)


def get_rate(grade_raw: str | None, year_month: str) -> float:
    """직급과 연월에 해당하는 시간당 원가 반환.

    Returns:
        float: 시간당 원가 (원). 정규화 실패 또는 Partner면 0.
    """
    code = normalize_grade(grade_raw)
    if not code or code == "P":
        return 0.0
    rates = FY26_RATES.get(code)
    if not rates:
        return 0.0
    return rates["busy"] if is_busy_season(year_month) else rates["nonbusy"]


def calc_cost(grade_raw: str | None, year_month: str, hours: float) -> float:
    """시간 × 원가율."""
    if not hours:
        return 0.0
    return hours * get_rate(grade_raw, year_month)


def get_rate_by_code(code: str, year_month: str) -> float:
    """정규화된 grade code로 직접 rate 조회 (M, D, SM 등)."""
    rates = FY26_RATES.get(code)
    if not rates:
        return 0.0
    return rates["busy"] if is_busy_season(year_month) else rates["nonbusy"]


def calc_cost_by_code(code: str, year_month: str, hours: float) -> float:
    """직접 grade code로 원가 계산."""
    if not hours:
        return 0.0
    return hours * get_rate_by_code(code, year_month)
