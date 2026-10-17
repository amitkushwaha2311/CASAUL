/**
 * CAUSAL — Application Shell Layout.
 *
 * Professional Operational Instrument:
 * - Obsidian (#111210) & Deep Charcoal (#191A17) surfaces
 * - Warm Ivory (#F0EDE5) and Muted Bronze (#A99A80) typography & selection states
 * - Precise technical SVG icons for all workspaces
 * - Responsive drawer for mobile and tablet views
 * - Preserves all existing IDs (nav-*, sidebar-wordmark) and route structures
 */

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface NavItemConfig {
  href: string;
  label: string;
  id: string;
  icon: (active: boolean) => React.ReactNode;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    href: "/app",
    label: "Overview",
    id: "nav-overview",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/app/assessments",
    label: "Assessments",
    id: "nav-assessments",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/app/command-center",
    label: "Command Center",
    id: "nav-command-center",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    href: "/app/state",
    label: "Digital Twin",
    id: "nav-digital-twin",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
      </svg>
    ),
  },
  {
    href: "/app/incidents",
    label: "Incidents",
    id: "nav-incidents",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    href: "/app/causal",
    label: "Causal",
    id: "nav-causal",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="18" r="3" />
        <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
        <polyline points="12 15.5 15.5 15.5 15.5 12" />
      </svg>
    ),
  },
  {
    href: "/app/simulation",
    label: "Simulation",
    id: "nav-simulation",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <circle cx="12" cy="12" r="9" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
  },
  {
    href: "/app/interventions",
    label: "Interventions",
    id: "nav-interventions",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    href: "/app/recommendations",
    label: "Recommendations",
    id: "nav-recommendations",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="M7 21h10" />
        <path d="M12 3v18" />
        <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
      </svg>
    ),
  },
  {
    href: "/app/evidence",
    label: "Evidence",
    id: "nav-evidence",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/app/scenarios",
    label: "Scenarios",
    id: "nav-scenarios",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    href: "/app/analytics",
    label: "Analytics",
    id: "nav-analytics",
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? "#A99A80" : "currentColor"} strokeWidth={1.75}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth guard — redirect to login if unauthenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  const currentNav = NAV_ITEMS.find((item) =>
    item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href)
  ) || NAV_ITEMS[0];

  // Show spinner while checking auth
  if (isLoading || !isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#111210",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: "2px solid rgba(169,154,128,0.2)",
            borderTopColor: "#A99A80",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#111210] text-[#F0EDE5]">
      {/* ── Mobile Top Header (< lg) ─────────────────────────── */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[rgba(240,237,229,0.10)] bg-[#191A17] sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2 text-decoration-none">
          <span className="font-mono font-bold tracking-tight text-[#F0EDE5] text-base">
            CAUSAL
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[rgba(169,154,128,0.15)] text-[#A99A80] border border-[rgba(169,154,128,0.25)]">
            OPS
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#A7A398] truncate max-w-[130px]">
            {currentNav.label}
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded border border-[rgba(240,237,229,0.12)] bg-[#20211D] text-[#F0EDE5] hover:border-[#A99A80]"
            aria-label="Toggle navigation menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* ── Mobile Drawer (< lg) ─────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pt-14">
          <div className="bg-[#191A17] border-b border-[rgba(240,237,229,0.12)] p-4 max-h-[80vh] overflow-y-auto space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  id={item.id}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-xs font-mono transition-colors ${
                    active
                      ? "bg-[#20211D] text-[#F0EDE5] border-l-2 border-[#A99A80] font-semibold"
                      : "text-[#A7A398] hover:bg-[#20211D]/60 hover:text-[#F0EDE5]"
                  }`}
                >
                  {item.icon(active)}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Desktop Sidebar (>= lg) ──────────────────────────── */}
      <aside
        role="navigation"
        aria-label="Platform navigation"
        className="hidden lg:flex w-[230px] shrink-0 border-r border-[rgba(240,237,229,0.10)] bg-[#191A17] flex-col py-6 px-3.5 justify-between select-none"
      >
        <div>
          {/* Editorial Wordmark */}
          <div className="px-3 mb-6">
            <Link
              href="/"
              id="sidebar-wordmark"
              className="group block text-decoration-none"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold font-mono tracking-tight text-[#F0EDE5] group-hover:text-white transition-colors">
                  CAUSAL
                </span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[rgba(130,151,125,0.14)] text-[#82977D] border border-[rgba(130,151,125,0.3)]">
                  LIVE
                </span>
              </div>
              <p className="text-[10px] font-mono tracking-wider uppercase text-[#A7A398] mt-1 group-hover:text-[#F0EDE5] transition-colors">
                Resilience Engine
              </p>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  id={item.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-mono transition-all ${
                    active
                      ? "bg-[#20211D] text-[#F0EDE5] border-l-2 border-[#A99A80] font-semibold shadow-sm"
                      : "text-[#A7A398] hover:bg-[#20211D]/50 hover:text-[#F0EDE5] border-l-2 border-transparent"
                  }`}
                >
                  <span className="shrink-0">{item.icon(active)}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Operational Diagnostics Status Card */}
        <div className="mt-6 pt-4 border-t border-[rgba(240,237,229,0.08)] space-y-3">
          {/* User info card */}
          <div className="px-2 py-2.5 rounded-lg bg-[#20211D] border border-[rgba(240,237,229,0.08)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-[rgba(169,154,128,0.18)] border border-[rgba(169,154,128,0.32)] flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-mono font-bold text-[#A99A80]">
                  {user?.display_name?.charAt(0).toUpperCase() ?? "U"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-[#F0EDE5] truncate leading-none">{user?.display_name}</p>
                <p className="text-[9px] font-mono text-[#736F66] truncate mt-0.5">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(169,154,128,0.12)] text-[#A99A80] border border-[rgba(169,154,128,0.25)]">
                {user?.role ?? "VIEWER"}
              </span>
              <button
                id="sidebar-logout-btn"
                onClick={() => logout()}
                className="text-[10px] font-mono text-[#736F66] hover:text-[#F0EDE5] transition-colors px-1.5 py-0.5 rounded hover:bg-[rgba(240,237,229,0.06)] flex items-center gap-1"
                aria-label="Sign out"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          </div>

          {/* Engine cluster status */}
          <div className="p-3 rounded-lg border border-[rgba(240,237,229,0.08)] bg-[#20211D]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A7A398]">
                Engine Cluster
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#82977D]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#82977D] animate-pulse" />
                Nominal
              </span>
            </div>
            <div className="space-y-1 font-mono text-[10px] text-[#A7A398]">
              <div className="flex justify-between">
                <span>FastAPI Kernel</span>
                <span className="text-[#F0EDE5]">p8000</span>
              </div>
              <div className="flex justify-between">
                <span>Graph Storage</span>
                <span className="text-[#A99A80]">PostgreSQL</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content Canvas ──────────────────────────────── */}
      <main className="flex-1 overflow-x-hidden flex flex-col min-w-0 bg-[#111210]">
        {children}
      </main>
    </div>
  );
}
