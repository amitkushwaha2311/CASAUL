/**
 * CAUSAL — Authentication Shell Component
 *
 * Implements the Cast & Render visual reference adapted to CAUSAL's dark design system:
 * - Fixed full-screen video background (exact CloudFront asset)
 * - Restrained dark CAUSAL-coloured wash for high form legibility
 * - Subtle SVG grain layer
 * - Fine top progress/accent line in Muted Bronze (#A99A80)
 * - Inter Tight typography (weights 400 & 500)
 * - Responsive two-column desktop / single-column mobile & tablet composition
 * - Reduced-motion accessibility & video fallback handling
 */

"use client";

import React, { useState, useEffect, useRef } from "react";

const AUTH_VIDEO_SRC =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/45567745-d826-44a2-a5ce-7ef670944e60.mp4";

const INTER_TIGHT_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&display=swap";

interface AuthShellProps {
  children: React.ReactNode;
  visual: React.ReactNode;
}

export function AuthShell({ children, visual }: AuthShellProps) {
  const [videoError, setVideoError] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Autoplay is handled declaratively via attributes; ensure playback in browser environments
    if (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !navigator.userAgent.includes("jsdom")
    ) {
      try {
        const promise = videoRef.current?.play();
        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {});
        }
      } catch {
        // Autoplay policy handled gracefully
      }
    }
  }, []);

  return (
    <>
      {/* ── Inter Tight Font Resource ───────────────────────────────── */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={INTER_TIGHT_FONT_URL} />

      {/* ── Scoped Authentication CSS ──────────────────────────────── */}
      <style>{`
        /* Keyframes */
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes authFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shimmerFineLine {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        @keyframes pulseDot {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.45;
            transform: scale(0.85);
          }
        }

        /* Root Auth Container */
        .causal-auth-root {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background-color: #111210;
          color: #F0EDE5;
          font-family: 'Inter Tight', var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow-x: hidden;
        }

        /* Fixed Background Video Layer */
        .causal-auth-video-layer {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background-color: #111210;
        }

        .causal-auth-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 0.8s ease-in-out;
        }

        .causal-auth-video.loaded {
          opacity: 0.38;
        }

        /* Dark CAUSAL Wash Overlay */
        .causal-auth-wash {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background:
            radial-gradient(ellipse 90% 80% at 50% 40%, rgba(17, 18, 16, 0.68) 0%, rgba(17, 18, 16, 0.94) 100%),
            linear-gradient(180deg, rgba(17, 18, 16, 0.72) 0%, rgba(25, 26, 23, 0.88) 100%);
        }

        /* Subtle SVG Grain Layer */
        .causal-auth-grain {
          position: fixed;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          opacity: 0.032;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          background-repeat: repeat;
        }

        /* Top Fine Progress / Shimmer Line */
        .causal-auth-progress-line {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          z-index: 30;
          pointer-events: none;
          background: linear-gradient(
            90deg,
            rgba(169, 154, 128, 0) 0%,
            rgba(169, 154, 128, 0.4) 25%,
            rgba(240, 237, 229, 0.8) 50%,
            rgba(169, 154, 128, 0.4) 75%,
            rgba(169, 154, 128, 0) 100%
          );
          background-size: 200% 100%;
          animation: shimmerFineLine 8s ease-in-out infinite;
        }

        /* Two-Column Master Layout */
        .causal-auth-layout {
          position: relative;
          z-index: 10;
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
        }

        /* Left Visual Panel */
        .causal-auth-visual-panel {
          display: none;
          flex: 0 0 520px;
          min-height: 100vh;
          min-height: 100dvh;
          background: rgba(17, 18, 16, 0.76);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid rgba(240, 237, 229, 0.08);
        }

        @media (min-width: 960px) {
          .causal-auth-visual-panel {
            display: flex;
            flex-direction: column;
          }
        }

        @media (min-width: 1280px) {
          .causal-auth-visual-panel {
            flex: 0 0 560px;
          }
        }

        /* Right Form Panel */
        .causal-auth-form-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          min-height: 100dvh;
          padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
          box-sizing: border-box;
          overflow-y: auto;
        }

        /* Form Card Surface */
        .causal-auth-card {
          position: relative;
          width: 100%;
          max-width: 440px;
          margin: auto;
          background: rgba(25, 26, 23, 0.78);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(240, 237, 229, 0.10);
          border-radius: 24px;
          padding: 38px 34px;
          box-shadow:
            0 24px 64px -12px rgba(0, 0, 0, 0.85),
            0 0 0 1px rgba(240, 237, 229, 0.04);
          animation: authFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-sizing: border-box;
          overflow: hidden;
        }

        /* Card Top Subtle Accent Line */
        .causal-auth-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 10%;
          right: 10%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(169, 154, 128, 0.5), transparent);
          pointer-events: none;
        }

        /* Mobile Adjustments (down to 320px) */
        @media (max-width: 480px) {
          .causal-auth-card {
            padding: 28px 20px;
            border-radius: 20px;
            box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.8);
          }
          .causal-auth-form-panel {
            padding-left: 14px;
            padding-right: 14px;
          }
        }

        /* Reduced-Motion Accessibility */
        @media (prefers-reduced-motion: reduce) {
          .causal-auth-card {
            animation: none !important;
          }
          .causal-auth-progress-line {
            animation: none !important;
          }
          .causal-auth-video {
            display: none !important;
          }
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div className="causal-auth-root">
        {/* ── Layer 0: Background Video & Fallback ──────────────────── */}
        <div className="causal-auth-video-layer" aria-hidden="true">
          {!videoError && (
            <video
              ref={videoRef}
              src={AUTH_VIDEO_SRC}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onCanPlay={() => setVideoLoaded(true)}
              onError={() => setVideoError(true)}
              className={`causal-auth-video ${videoLoaded ? "loaded" : ""}`}
            />
          )}
        </div>

        {/* ── Layer 1: Dark CAUSAL Wash Overlay ─────────────────────── */}
        <div className="causal-auth-wash" aria-hidden="true" />

        {/* ── Layer 2: Subtle SVG Grain Layer ───────────────────────── */}
        <div className="causal-auth-grain" aria-hidden="true" />

        {/* ── Layer 3: Fine Top Shimmer Line ────────────────────────── */}
        <div className="causal-auth-progress-line" aria-hidden="true" />

        {/* ── Layer 4: Main Content Grid ────────────────────────────── */}
        <div className="causal-auth-layout">
          {/* Left: Infrastructure Visual (Desktop) */}
          <aside className="causal-auth-visual-panel" aria-label="CAUSAL System Architecture">
            {visual}
          </aside>

          {/* Right: Authentication Form */}
          <main className="causal-auth-form-panel">
            <div className="causal-auth-card">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
