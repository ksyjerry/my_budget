"use client";

interface SummaryRowProps {
  total: number;
  etControllable: number;
}

export function SummaryRow({ total, etControllable }: SummaryRowProps) {
  const diff = total - etControllable;
  const pct = etControllable > 0 ? Math.min(100, (total / etControllable) * 100) : 0;
  const barColor =
    diff === 0 ? "bg-pwc-green" : diff > 0 ? "bg-pwc-red" : "bg-pwc-orange";

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {/* Progress bar */}
      <div className="w-full bg-pwc-gray-100 rounded-full h-2 overflow-hidden">
        <div
          style={{ width: `${pct}%` }}
          className={`${barColor} h-2 rounded-full transition-all duration-300`}
        />
      </div>
      {/* Numeric breakdown */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="font-medium">
          총 배분:{" "}
          <span className="font-bold text-pwc-black">
            {total.toLocaleString()}h
          </span>
        </span>
        <span className="text-pwc-gray-600">
          ET Controllable: {etControllable.toLocaleString()}h
        </span>
        <span
          className={`font-medium ${
            diff === 0
              ? "text-pwc-green"
              : diff > 0
              ? "text-pwc-red"
              : "text-pwc-yellow"
          }`}
        >
          {diff === 0
            ? "✓ 일치"
            : diff > 0
            ? `+${diff.toLocaleString()}h 초과 (${pct.toFixed(1)}%)`
            : `${diff.toLocaleString()}h 부족 (${pct.toFixed(1)}%)`}
        </span>
      </div>
    </div>
  );
}
