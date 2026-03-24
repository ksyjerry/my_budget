interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  highlight?: boolean;
}

export default function KPICard({ label, value, subtitle, highlight }: KPICardProps) {
  return (
    <div className="flex-1 min-w-0 px-4 py-3">
      <p className="text-[11px] text-pwc-gray-600 font-medium tracking-wide uppercase mb-1.5">{label}</p>
      <p
        className={`text-2xl font-bold leading-tight ${
          highlight ? "text-pwc-orange"
          : typeof value === "string" && value === "True" ? "text-pwc-green"
          : typeof value === "string" && value.startsWith("False") ? "text-pwc-red"
          : "text-pwc-black"
        }`}
      >
        {typeof value === "number" ? Math.round(value).toLocaleString() : value}
      </p>
      {subtitle && (
        <p className="text-[11px] text-pwc-gray-600 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
