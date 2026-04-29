"use client";

import type { TemplateRow } from "../types";

export interface DistributionResult {
  /** rowKey → months map: {"category|unit|empno": {"2026-04": 5, "2026-05": 5, ...}} */
  changes: Map<string, Record<string, number>>;
  /** preview summary for UI display */
  summary: { totalHours: number; rowCount: number };
}

/**
 * 균등 분배 — 총 시간 N → 12개월에 N/12 (소수점은 마지막 월에 누적).
 */
export function distributeEvenly(
  rows: TemplateRow[],
  monthRange: string[],
  totalHoursPerRow: number,
): DistributionResult {
  const changes = new Map<string, Record<string, number>>();
  const monthCount = monthRange.length;
  if (monthCount === 0 || totalHoursPerRow <= 0) {
    return { changes, summary: { totalHours: 0, rowCount: 0 } };
  }

  const perMonth = Math.floor((totalHoursPerRow / monthCount) * 4) / 4; // 0.25 단위
  const remainder = totalHoursPerRow - perMonth * monthCount;

  for (const row of rows) {
    const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
    const months: Record<string, number> = {};
    for (let i = 0; i < monthRange.length - 1; i++) {
      months[monthRange[i]] = perMonth;
    }
    months[monthRange[monthCount - 1]] = perMonth + remainder;
    changes.set(key, months);
  }

  return {
    changes,
    summary: { totalHours: totalHoursPerRow * rows.length, rowCount: rows.length },
  };
}

/**
 * 기말 집중 분배 — 총 시간 N. 기말(마지막 3개월) 에 N×기말비율, 나머지 9개월에 균등.
 */
export function distributeYearEndConcentrated(
  rows: TemplateRow[],
  monthRange: string[],
  totalHoursPerRow: number,
  yearEndRatio: number, // 0.0 ~ 1.0
): DistributionResult {
  const changes = new Map<string, Record<string, number>>();
  const monthCount = monthRange.length;
  if (monthCount < 3 || totalHoursPerRow <= 0) {
    return { changes, summary: { totalHours: 0, rowCount: 0 } };
  }

  const yearEndHours = totalHoursPerRow * yearEndRatio;
  const restHours = totalHoursPerRow - yearEndHours;
  const yearEndMonths = monthRange.slice(-3);
  const restMonths = monthRange.slice(0, -3);

  const yearEndPerMonth = Math.floor((yearEndHours / 3) * 4) / 4;
  const restPerMonth = restMonths.length > 0
    ? Math.floor((restHours / restMonths.length) * 4) / 4
    : 0;

  for (const row of rows) {
    const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
    const months: Record<string, number> = {};
    for (const m of restMonths) months[m] = restPerMonth;
    for (const m of yearEndMonths) months[m] = yearEndPerMonth;

    // Adjust last month to absorb rounding remainder
    const totalAssigned = Object.values(months).reduce((s, v) => s + v, 0);
    const lastMonth = monthRange[monthCount - 1];
    months[lastMonth] += totalHoursPerRow - totalAssigned;

    changes.set(key, months);
  }

  return {
    changes,
    summary: { totalHours: totalHoursPerRow * rows.length, rowCount: rows.length },
  };
}

/**
 * 유사회사 비율 적용 — peer_statistics 의 avg_ratio 곱한 시간으로 분배 후 균등.
 *
 * peerStats: { budget_unit → avg_ratio (0.0~1.0) }
 * baseHours: 적용 기준 시간 (예: ET Controllable Budget)
 */
export function distributeByPeerRatio(
  rows: TemplateRow[],
  monthRange: string[],
  peerStats: Record<string, number>,
  baseHours: number,
): DistributionResult {
  const changes = new Map<string, Record<string, number>>();
  let totalHours = 0;
  let rowCount = 0;

  for (const row of rows) {
    const ratio = peerStats[row.budget_unit];
    if (ratio === undefined || ratio <= 0) continue;

    const hoursForRow = Math.round(baseHours * ratio * 4) / 4; // 0.25 단위
    if (hoursForRow <= 0) continue;

    const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
    const monthCount = monthRange.length;
    const perMonth = Math.floor((hoursForRow / monthCount) * 4) / 4;
    const remainder = hoursForRow - perMonth * monthCount;

    const months: Record<string, number> = {};
    for (let i = 0; i < monthCount - 1; i++) {
      months[monthRange[i]] = perMonth;
    }
    months[monthRange[monthCount - 1]] = perMonth + remainder;
    changes.set(key, months);
    totalHours += hoursForRow;
    rowCount++;
  }

  return { changes, summary: { totalHours, rowCount } };
}
