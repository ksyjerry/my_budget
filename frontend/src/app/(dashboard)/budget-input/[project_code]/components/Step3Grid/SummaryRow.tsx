"use client";

interface SummaryRowProps {
  total: number;
  etControllable: number;
}

export function SummaryRow({ total, etControllable }: SummaryRowProps) {
  const diff = total - etControllable;
  return (
    <div className="flex items-center gap-4 text-sm">
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
          ? "일치"
          : diff > 0
          ? `+${diff.toLocaleString()}h 초과`
          : `${diff.toLocaleString()}h 부족`}
      </span>
    </div>
  );
}
