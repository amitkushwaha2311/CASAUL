/**
 * CAUSAL — Lenis Smooth Scroll Provider
 *
 * Wraps the public landing page only.
 * Do NOT include this in the /app/* shell — operational HUDs
 * benefit from standard native scroll behaviour.
 *
 * Configuration:
 *   - duration 1.2s with an exponential ease-out curve
 *   - smoothWheel: true
 *   - No touchpadMultiplier override (Lenis default is good)
 */

"use client";

import React from "react";
import { ReactLenis } from "lenis/react";

interface LenisProviderProps {
  children: React.ReactNode;
}

export function LenisProvider({ children }: LenisProviderProps) {
  return (
    <ReactLenis
      root
      options={{
        duration: 1.2,
        // Exponential ease-out: t => 1 - 2^(-10t)
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        // wheelMultiplier default (1.0) — intentionally not overridden
      }}
    >
      {children}
    </ReactLenis>
  );
}

export default LenisProvider;
