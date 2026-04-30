"use client";

import * as React from "react";

export interface NumberFieldProps {
  label?: string;
  value?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  step?: number;
  min?: number;
  max?: number;
  allowNegative?: boolean;
  /** Display thousand separator when readOnly. Default true. */
  displayThousandSeparator?: boolean;
  /** Used for percentage-of-total display. */
  contractHours?: number;
  /** Optional placeholder for editable mode. */
  placeholder?: string;
  className?: string;
  /** Override inner <input> styling (Step 3 grid cells use compact mode). */
  inputClassName?: string;
  /** Forward autoFocus to the inner <input>. */
  autoFocus?: boolean;
  /** Forward onKeyDown to the inner <input>. */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Called after the internal step-snap onBlur handler. */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  /** Ref forwarded to the inner <input> element. */
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Centralized numeric input with safe defaults:
 *  - min = 0 by default (override with allowNegative or explicit min)
 *  - readOnly displays toLocaleString("ko-KR") with thousand separators
 *  - step omitted defaults to integer-only via min snap
 *
 * IMPORTANT: do not introduce ad-hoc <input type="number"> in src/app or
 * src/components — see scripts/ci/check-no-direct-number-input.sh.
 */
export function NumberField(props: NumberFieldProps) {
  const {
    label,
    value,
    onChange,
    readOnly,
    step = 1,
    min = 0,
    max,
    allowNegative = false,
    displayThousandSeparator = true,
    contractHours,
    placeholder,
    className,
    inputClassName,
    autoFocus,
    onKeyDown,
    onBlur: onBlurProp,
    inputRef,
  } = props;

  const effectiveMin = allowNegative ? (min < 0 ? min : -Number.MAX_SAFE_INTEGER) : min;

  const pct =
    contractHours && contractHours > 0 && value
      ? `${Math.round((value / contractHours) * 100)}%`
      : null;

  const display =
    readOnly && typeof value === "number"
      ? displayThousandSeparator
        ? value.toLocaleString("ko-KR")
        : String(value)
      : value ?? "";

  const handleChange = (raw: string) => {
    let v = parseFloat(raw);
    if (Number.isNaN(v)) v = 0;
    if (!allowNegative && v < 0) v = 0;
    if (typeof effectiveMin === "number" && v < effectiveMin) v = effectiveMin;
    if (typeof max === "number" && v > max) v = max;
    if (step > 0) {
      v = Math.round(v / step) * step;
    }
    onChange?.(v);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-pwc-gray-600 mb-1">
          {label}
          {pct && <span className="ml-1 text-pwc-orange">({pct})</span>}
        </label>
      )}
      <input
        ref={inputRef}
        type={readOnly ? "text" : "number"}
        value={display}
        step={step}
        min={effectiveMin}
        max={max}
        readOnly={readOnly}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={(e) => {
          handleChange(e.target.value);
          onBlurProp?.(e);
        }}
        onKeyDown={onKeyDown}
        className={
          inputClassName !== undefined
            ? `w-full text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${inputClassName}`
            : `w-full px-2 py-1.5 text-sm border rounded text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                readOnly
                  ? "bg-pwc-gray-50 border-pwc-gray-100 text-pwc-gray-600"
                  : "border-pwc-gray-200 focus:outline-none focus:border-pwc-orange"
              }`
        }
      />
    </div>
  );
}

export default NumberField;
