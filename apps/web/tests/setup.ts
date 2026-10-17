/**
 * CAUSAL — Vitest test setup.
 */

import "@testing-library/jest-dom";

// ── Mock IntersectionObserver for Framer Motion / Motion ───────────────────
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    private callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {}

  observe(target: Element) {
    this.callback(
      [
        {
          isIntersecting: true,
          target,
          intersectionRatio: 1,
          boundingClientRect: target.getBoundingClientRect?.() ?? ({} as DOMRectReadOnly),
          intersectionRect: target.getBoundingClientRect?.() ?? ({} as DOMRectReadOnly),
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// ── Mock ResizeObserver ─────────────────────────────────────────────────────
class MockResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// ── Mock matchMedia ─────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
