"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [empno, setEmpno] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  // Already logged in — redirect based on role
  useEffect(() => {
    if (!loading && isAuthenticated) {
      const stored = localStorage.getItem("auth_user");
      const role = stored ? JSON.parse(stored).role : "";
      router.replace(role === "Staff" ? "/overview-person" : "/");
    }
  }, [loading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empno.trim()) {
      setError("사번을 입력해주세요.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await login(empno.trim());
      // role에 따라 리다이렉트
      const stored = localStorage.getItem("auth_user");
      const role = stored ? JSON.parse(stored).role : "";
      router.replace(role === "Staff" ? "/overview-person" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F3F3]">
      <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-pwc-gray-100/60 p-10">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <Image
            src="/pwc-logo.png"
            alt="PwC"
            width={72}
            height={40}
            style={{ width: "auto", height: "auto" }}
            className="object-contain"
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-pwc-black mb-1">
          My Budget+
        </h1>
        <p className="text-sm text-pwc-gray-600 text-center mb-8">
          사번을 입력하여 서비스를 이용하세요.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-pwc-black mb-2">
              사번
            </label>
            <input
              type="text"
              placeholder="사번을 입력하세요"
              value={empno}
              onChange={(e) => setEmpno(e.target.value)}
              className="w-full px-4 py-3.5 border border-pwc-gray-200 rounded-lg bg-pwc-gray-50 text-pwc-gray-900 text-sm placeholder-pwc-gray-600 focus:outline-none focus:border-pwc-orange focus:bg-white transition-colors"
              autoFocus
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="text-sm text-pwc-red bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-pwc-orange text-white font-semibold rounded-lg hover:bg-[#B83D02] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
