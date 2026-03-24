"use client";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: {
    name: string;
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (value: string) => void;
  }[];
  toggles?: {
    name: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
  }[];
}

export default function FilterBar({ filters, toggles }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-white/80 backdrop-blur-sm border border-pwc-gray-100/60 rounded-lg shadow-sm">
      {toggles?.map((toggle) => (
        <div key={toggle.name} className="flex items-center gap-0.5 mr-1">
          {toggle.options.map((opt) => (
            <button
              key={opt}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                toggle.value === opt
                  ? "bg-pwc-black text-white"
                  : "bg-transparent text-pwc-gray-600 hover:text-pwc-black"
              }`}
              onClick={() => toggle.onChange(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ))}

      {toggles && toggles.length > 0 && (
        <div className="w-px h-5 bg-pwc-gray-200 mx-1" />
      )}

      {filters.map((filter) => (
        <div key={filter.name} className="flex items-center gap-1.5">
          <label className="text-[11px] text-pwc-gray-600 font-medium whitespace-nowrap">
            {filter.label}
          </label>
          <select
            value={filter.value ?? ""}
            onChange={(e) => filter.onChange(e.target.value)}
            className="text-xs border border-pwc-gray-200 rounded px-2 py-1 bg-white text-pwc-gray-900 min-w-[100px] focus:outline-none focus:border-pwc-orange transition-colors"
          >
            <option value="">모두</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
