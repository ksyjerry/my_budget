"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type Dispatch,
  type ReactNode,
} from "react";
import React from "react";

// ── Types ──────────────────────────────────────────

export interface CrossFilterSelection {
  sourceId: string;
  dimension: string;
  value: string;
}

export interface CrossFilterState {
  selections: CrossFilterSelection[];
}

type CrossFilterAction =
  | { type: "TOGGLE_FILTER"; sourceId: string; dimension: string; value: string }
  | { type: "CLEAR_FILTER"; sourceId: string }
  | { type: "CLEAR_ALL" };

// ── Reducer ────────────────────────────────────────

function crossFilterReducer(
  state: CrossFilterState,
  action: CrossFilterAction
): CrossFilterState {
  switch (action.type) {
    case "TOGGLE_FILTER": {
      const existing = state.selections.find(
        (s) =>
          s.sourceId === action.sourceId &&
          s.dimension === action.dimension &&
          s.value === action.value
      );
      if (existing) {
        // 재클릭 → 해제
        return {
          selections: state.selections.filter((s) => s !== existing),
        };
      }
      // 같은 sourceId의 기존 필터 교체 (한 시각화에서 하나만)
      return {
        selections: [
          ...state.selections.filter((s) => s.sourceId !== action.sourceId),
          {
            sourceId: action.sourceId,
            dimension: action.dimension,
            value: action.value,
          },
        ],
      };
    }
    case "CLEAR_FILTER":
      return {
        selections: state.selections.filter(
          (s) => s.sourceId !== action.sourceId
        ),
      };
    case "CLEAR_ALL":
      return { selections: [] };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────

interface CrossFilterContextValue {
  state: CrossFilterState;
  dispatch: Dispatch<CrossFilterAction>;
}

const CrossFilterContext = createContext<CrossFilterContextValue | null>(null);

// ── Provider ───────────────────────────────────────

export function CrossFilterProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(crossFilterReducer, {
    selections: [],
  });

  return React.createElement(
    CrossFilterContext.Provider,
    { value: { state, dispatch } },
    children
  );
}

// ── Hook ───────────────────────────────────────────

export function useCrossFilter() {
  const ctx = useContext(CrossFilterContext);
  if (!ctx) {
    throw new Error("useCrossFilter must be used within CrossFilterProvider");
  }

  const { state, dispatch } = ctx;

  const toggleFilter = useCallback(
    (sourceId: string, dimension: string, value: string) => {
      dispatch({ type: "TOGGLE_FILTER", sourceId, dimension, value });
    },
    [dispatch]
  );

  const clearFilter = useCallback(
    (sourceId: string) => {
      dispatch({ type: "CLEAR_FILTER", sourceId });
    },
    [dispatch]
  );

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, [dispatch]);

  /** 특정 sourceId를 제외한 활성 필터 목록 */
  const getActiveFilters = useCallback(
    (excludeSourceId: string): CrossFilterSelection[] => {
      return state.selections.filter((s) => s.sourceId !== excludeSourceId);
    },
    [state.selections]
  );

  /** 특정 sourceId+dimension+value가 현재 선택되었는지 */
  const isSelected = useCallback(
    (sourceId: string, value: string): boolean => {
      return state.selections.some(
        (s) => s.sourceId === sourceId && s.value === value
      );
    },
    [state.selections]
  );

  /** 활성 필터가 있는지 */
  const hasActiveFilter = state.selections.length > 0;

  return {
    state,
    dispatch,
    toggleFilter,
    clearFilter,
    clearAll,
    getActiveFilters,
    isSelected,
    hasActiveFilter,
  };
}

// ── 데이터 필터링 유틸 ─────────────────────────────

/**
 * Cross-filter에 의해 데이터를 필터링.
 * filters: 자신의 sourceId를 제외한 활성 필터 배열
 * data: 원본 데이터 배열
 * getDimensionValue: 데이터 항목에서 dimension에 해당하는 값을 추출하는 함수
 */
export function applyFilters<T>(
  data: T[],
  filters: CrossFilterSelection[],
  getDimensionValue: (item: T, dimension: string) => string | undefined
): T[] {
  if (filters.length === 0 || data.length === 0) return data;

  // 실제로 이 데이터에 적용 가능한 필터만 골라냄 (차원이 매칭되는 경우)
  const applicable = filters.filter(
    (f) => getDimensionValue(data[0], f.dimension) !== undefined
  );
  if (applicable.length === 0) return data; // 원본 ref 그대로 — 무의미한 리렌더 방지

  return data.filter((item) =>
    applicable.every((f) => {
      const val = getDimensionValue(item, f.dimension);
      if (val === undefined) return true;
      return val === f.value;
    })
  );
}
