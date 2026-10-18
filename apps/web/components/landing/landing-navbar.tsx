"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import { useAuth } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/lib/api-client";

const NAV_LINKS = [
  { href: "#dependency-visualization", label: "Cascade Visualizer" },
  { href: "#causal-engine", label: "Causal Hypotheses" },
  { href: "#forecasting", label: "Blast-Radius Forecasting" },
  { href: "#scenarios", label: "Scenario Sandbox" },
  { href: "#domains", label: "Domains" },
];

export function LandingNavbar() {
  const apiDocsUrl = `${getApiBaseUrl()}/api/docs`;
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  // Scroll progress for the hairline indicator
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile drawer on Escape and prevent body scrolling when open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 h-16 transition-colors duration-200 ${
        scrolled
          ? "bg-[#111210]/95 backdrop-blur-md border-b border-[rgba(240,237,229,0.09)] shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
          : "bg-[#111210]/60 backdrop-blur-sm border-b border-[rgba(240,237,229,0.05)]"
      }`}
    >
      <div className="max-w-[1520px] h-full mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between gap-4">
        {/* ── Left: Compact Brand Lockup (Single-line vertical height) ──────── */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group flex-shrink-0 text-decoration-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
          aria-label="CAUSAL Home"
        >
          <div className="relative flex items-center justify-center w-7 h-7 rounded border border-[rgba(240,237,229,0.16)] bg-[#191A17] group-hover:border-[#A99A80]/70 transition-colors flex-shrink-0">
            {/* Crosshair logo mark */}
            <span className="w-1.5 h-1.5 rounded-sm bg-[#A99A80]" />
            <span className="absolute w-2 h-px bg-[#A99A80]/40 left-1/2 -translate-x-1/2" />
            <span className="absolute h-2 w-px bg-[#A99A80]/40 top-1/2 -translate-y-1/2" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold tracking-[-0.01em] text-[#F0EDE5] font-mono leading-none">
              CAUSAL
            </span>
            <span className="w-px h-3 bg-[rgba(240,237,229,0.18)] hidden sm:block" />
            <span className="text-[10px] font-mono tracking-[0.14em] text-[#A7A398] uppercase leading-none hidden sm:block">
              Resilience Engine
            </span>
          </div>
        </Link>

        {/* ── Middle: Primary Navigation (Single-line, nowrap, centered) ─────── */}
        <nav
          className="hidden xl:flex items-center justify-center gap-1 2xl:gap-2 flex-1 mx-2"
          aria-label="Primary Navigation"
        >
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-[0.06em] text-[#A7A398] hover:text-[#F0EDE5] hover:bg-[rgba(240,237,229,0.04)] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* ── Right: Authentication & Action CTAs ─────────────────────────── */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* External API Docs link: shown on desktop */}
          <a
            href={apiDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            id="nav-api-docs-link"
            className="hidden lg:inline-flex items-center px-3 py-1.5 rounded text-[11px] font-mono text-[#A7A398] hover:text-[#F0EDE5] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.25)] hover:bg-[rgba(240,237,229,0.03)] whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
          >
            API Docs
          </a>

          {/* Unauthenticated: Sign in link */}
          {!isLoading && !isAuthenticated && (
            <Link
              href="/login"
              id="nav-sign-in-link"
              className="hidden sm:inline-flex items-center justify-center px-3 py-1.5 min-w-[70px] rounded text-[11px] font-mono text-[#A7A398] hover:text-[#F0EDE5] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.25)] hover:bg-[rgba(240,237,229,0.03)] whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
            >
              Sign in
            </Link>
          )}

          {/* Authenticated: Sign out & Profile indicator */}
          {!isLoading && isAuthenticated && (
            <button
              id="nav-logout-btn"
              onClick={() => logout()}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-[#A7A398] hover:text-[#F0EDE5] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.25)] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
              aria-label="Sign out"
            >
              <div className="w-4 h-4 rounded-full bg-[rgba(169,154,128,0.2)] border border-[rgba(169,154,128,0.35)] flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-mono font-bold text-[#A99A80]">
                  {user?.display_name?.charAt(0).toUpperCase() ?? "U"}
                </span>
              </div>
              <span>Sign out</span>
            </button>
          )}

          {/* Primary Action CTA: Launch Console — Permanently Rendered */}
          <Link
            href="/app"
            id="nav-enter-platform-btn"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white hover:shadow-[0_0_20px_rgba(240,237,229,0.25)] transition-all shadow-sm whitespace-nowrap border border-[rgba(240,237,229,0.3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
          >
            <span>Launch Console</span>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>

          {/* Mobile Menu Hamburger Button (< xl) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden p-1.5 rounded text-[#A7A398] hover:text-[#F0EDE5] hover:bg-[#191A17] border border-transparent hover:border-[rgba(240,237,229,0.10)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A99A80]"
            aria-label="Toggle Navigation Menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* ── Scroll Progress Hairline ────────────────────────────────────────── */}
      <motion.div
        aria-hidden="true"
        style={{
          scaleX,
          transformOrigin: "left center",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: "#A99A80",
          opacity: 0.8,
        }}
      />

      {/* ── Responsive Mobile & Tablet Navigation Drawer (< xl) ─────────────── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 top-16 bg-black/60 backdrop-blur-sm z-40 xl:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div
            className="fixed top-16 right-0 left-0 bg-[#111210] border-b border-[rgba(240,237,229,0.12)] px-6 py-6 z-50 xl:hidden shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto"
            role="dialog"
            aria-label="Mobile Navigation Menu"
          >
            <div className="space-y-1 font-mono text-xs mb-6">
              <div className="text-[10px] uppercase tracking-wider text-[#736F66] mb-3 px-2">
                Navigation Sections
              </div>
              {NAV_LINKS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2.5 rounded text-[#A7A398] hover:text-[#F0EDE5] hover:bg-[#191A17] transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="pt-4 border-t border-[rgba(240,237,229,0.10)] flex flex-col gap-2.5 font-mono text-xs">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/app"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-2.5 rounded text-center font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <span>Go to Dashboard</span>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full py-2.5 rounded text-center text-[#A7A398] hover:text-[#F0EDE5] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.25)] transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-2.5 rounded text-center text-[#A7A398] hover:text-[#F0EDE5] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.25)] transition-colors"
                  >
                    Sign in to Console
                  </Link>
                  <Link
                    href="/app"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-2.5 rounded text-center font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <span>Launch Console</span>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </>
              )}
              <a
                href={apiDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 rounded text-center text-[#736F66] hover:text-[#A7A398] text-[11px] transition-colors"
              >
                API Documentation ↗
              </a>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

export default LandingNavbar;
