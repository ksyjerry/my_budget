"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/lib/auth";

const overviewIcon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

const overviewSubItems = [
  { name: "Overview for EL/PM", href: "/" },
  { name: "Overview for Staff", href: "/overview-person" },
];

const projectDetailsIcon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const projectDetailsSubItems = [
  { name: "Details for EL/PM", href: "/projects" },
  { name: "Details for Staff", href: "/projects-staff" },
  { name: "Budget Tracking", href: "/projects/tracking", partnerOnly: true },
];

const navItems = [
  {
    name: "인별 Details",
    href: "/assignments",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    name: "Summary",
    href: "/summary",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    name: "Budget 입력",
    href: "/budget-input",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    name: "Appendix",
    href: "/appendix",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
];

function OverviewDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = pathname === "/" || pathname.startsWith("/overview-person");
  const currentLabel = pathname.startsWith("/overview-person") ? "Overview for Staff" : "Overview for EL/PM";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] rounded-md transition-colors whitespace-nowrap",
          isActive ? "text-pwc-orange font-bold" : "text-pwc-gray-600 font-medium hover:text-pwc-black"
        )}
      >
        {overviewIcon}
        {currentLabel}
        <svg className={clsx("w-3 h-3 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-pwc-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
          {overviewSubItems.map((sub) => (
            <Link
              key={sub.href}
              href={sub.href}
              onClick={() => setOpen(false)}
              className={clsx(
                "block px-4 py-2 text-[13px] hover:bg-orange-50 transition-colors",
                (sub.href === "/" ? pathname === "/" : pathname.startsWith(sub.href))
                  ? "text-pwc-orange font-bold"
                  : "text-pwc-gray-600"
              )}
            >
              {sub.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetailsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [hasPartnerAccess, setHasPartnerAccess] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = pathname.startsWith("/projects");
  const isTracking = pathname.startsWith("/projects/tracking");
  const currentLabel = isTracking
    ? "Budget Tracking"
    : pathname.startsWith("/projects-staff")
    ? "Details for Staff"
    : "Details for EL/PM";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const stored = localStorage.getItem("auth_user");
        const token = stored ? JSON.parse(stored).token : "";
        if (!token) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const res = await fetch(`${apiBase}/api/v1/tracking/access`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHasPartnerAccess(data.has_access === true);
        }
      } catch {
        /* ignore */
      }
    };
    checkAccess();
  }, []);

  const visibleSubItems = projectDetailsSubItems.filter(
    (sub) => !("partnerOnly" in sub && sub.partnerOnly) || hasPartnerAccess
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] rounded-md transition-colors whitespace-nowrap",
          isActive ? "text-pwc-orange font-bold" : "text-pwc-gray-600 font-medium hover:text-pwc-black"
        )}
      >
        {projectDetailsIcon}
        {currentLabel}
        <svg className={clsx("w-3 h-3 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-pwc-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
          {visibleSubItems.map((sub) => {
            const isTrackingItem = sub.href === "/projects/tracking";
            const itemActive = isTrackingItem
              ? pathname.startsWith("/projects/tracking")
              : pathname === sub.href ||
                (sub.href === "/projects-staff" && pathname.startsWith("/projects-staff")) ||
                (sub.href === "/projects" &&
                  pathname.startsWith("/projects") &&
                  !pathname.startsWith("/projects-staff") &&
                  !pathname.startsWith("/projects/tracking"));
            return (
              <Link
                key={sub.href}
                href={sub.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "block px-4 py-2 text-[13px] hover:bg-orange-50 transition-colors",
                  itemActive ? "text-pwc-orange font-bold" : "text-pwc-gray-600"
                )}
              >
                {sub.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserDropdown({ user, onLogout }: { user: { name: string; empno: string }; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 hover:bg-pwc-gray-50 rounded-md px-2 py-1 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-pwc-orange/10 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-pwc-orange" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-pwc-gray-900">{user.name}</span>
        <svg className={clsx("w-3 h-3 text-pwc-gray-600 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-pwc-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
          <div className="px-4 py-2 border-b border-pwc-gray-100">
            <p className="text-xs font-medium text-pwc-gray-900">{user.name}</p>
            <p className="text-[11px] text-pwc-gray-600">{user.empno}</p>
          </div>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full text-left px-4 py-2 text-xs text-pwc-gray-600 hover:bg-red-50 hover:text-pwc-red transition-colors"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isStaff = user?.role === "Staff";

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="bg-white border-b border-pwc-gray-100 h-[52px] flex items-center px-6 gap-8 sticky top-0 z-50">
      {/* Left: Logo + Title */}
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <Image
          src="/pwc-logo.png"
          alt="PwC"
          width={48}
          height={28}
          style={{ width: "auto", height: "auto" }}
          className="object-contain"
        />
        <span className="text-[15px] font-bold text-pwc-black tracking-tight whitespace-nowrap">
          My Budget+
        </span>
      </Link>

      <div className="w-px h-6 bg-pwc-gray-200" />

      {/* Center: Navigation */}
      <nav className="flex items-center gap-0.5 flex-1">
        {isStaff ? (
          <>
            {/* Staff: Overview for Staff + Details for Staff만 */}
            <Link
              href="/overview-person"
              className={clsx(
                "flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] rounded-md transition-colors whitespace-nowrap",
                pathname.startsWith("/overview-person")
                  ? "text-pwc-orange font-bold"
                  : "text-pwc-gray-600 font-medium hover:text-pwc-black"
              )}
            >
              {overviewIcon}
              Overview for Staff
            </Link>
            <Link
              href="/projects-staff"
              className={clsx(
                "flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] rounded-md transition-colors whitespace-nowrap",
                pathname.startsWith("/projects-staff")
                  ? "text-pwc-orange font-bold"
                  : "text-pwc-gray-600 font-medium hover:text-pwc-black"
              )}
            >
              {projectDetailsIcon}
              Details for Staff
            </Link>
          </>
        ) : (
          <>
            {/* EL/PM: 전체 메뉴 */}
            <OverviewDropdown pathname={pathname} />
            <ProjectDetailsDropdown pathname={pathname} />
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] rounded-md transition-colors whitespace-nowrap",
                    isActive
                      ? "text-pwc-orange font-bold"
                      : "text-pwc-gray-600 font-medium hover:text-pwc-black"
                  )}
                >
                  {item.icon}
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Right: Admin + User info */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px] text-pwc-gray-600 leading-tight text-right">
          Last Refreshed: 2026-03-18 03:06
        </span>
        {user && (
          <>
            <div className="w-px h-5 bg-pwc-gray-200" />
            <Link
              href="/admin"
              className={clsx(
                "flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md transition-colors whitespace-nowrap",
                pathname.startsWith("/admin")
                  ? "text-pwc-orange font-bold"
                  : "text-pwc-gray-600 font-medium hover:text-pwc-black"
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              관리
            </Link>
            <div className="w-px h-5 bg-pwc-gray-200" />
            <UserDropdown user={user} onLogout={handleLogout} />
          </>
        )}
      </div>
    </header>
  );
}
