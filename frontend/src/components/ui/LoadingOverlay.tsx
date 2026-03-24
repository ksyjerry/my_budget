"use client";

export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-[3px] border-pwc-gray-100" />
          <div className="absolute inset-0 rounded-full border-[3px] border-t-[#D04A02] animate-spin" />
        </div>
        <span className="text-xs text-pwc-gray-600 font-medium">Loading...</span>
      </div>
    </div>
  );
}
