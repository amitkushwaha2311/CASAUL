/**
 * CAUSAL — Design primitive component tests.
 *
 * Verifies that design system primitives render correctly.
 * These tests do NOT require a running API server.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Panel } from "../components/ui/panel";
import { LoadingState } from "../components/ui/loading-state";
import { ErrorState } from "../components/ui/error-state";
import { EmptyState } from "../components/ui/empty-state";

// ── Button ─────────────────────────────────────────────────────

describe("Button", () => {
  it("renders with default props", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Click me");
  });

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading is true", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("does not call onClick when disabled", async () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});

// ── Badge ──────────────────────────────────────────────────────

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>NORMAL</Badge>);
    expect(screen.getByText("NORMAL")).toBeInTheDocument();
  });

  it("renders with all status variants without crashing", () => {
    const variants = ["normal", "degraded", "critical", "failed", "recovering", "simulation", "unknown"] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders a dot indicator when dot prop is true", () => {
    const { container } = render(<Badge dot>With dot</Badge>);
    // The dot span has no text — check it exists by style
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBeGreaterThan(1);
  });
});

// ── Panel ──────────────────────────────────────────────────────

describe("Panel", () => {
  it("renders children", () => {
    render(<Panel>Panel content</Panel>);
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("renders with elevated elevation without crashing", () => {
    render(<Panel elevation="elevated">Elevated</Panel>);
    expect(screen.getByText("Elevated")).toBeInTheDocument();
  });
});

// ── LoadingState ───────────────────────────────────────────────

describe("LoadingState", () => {
  it("renders default message", () => {
    render(<LoadingState />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders custom message", () => {
    render(<LoadingState message="Fetching data…" />);
    expect(screen.getByText("Fetching data…")).toBeInTheDocument();
  });
});

// ── ErrorState ─────────────────────────────────────────────────

describe("ErrorState", () => {
  it("renders default title", () => {
    render(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders custom title and message", () => {
    render(<ErrorState title="API Error" message="Could not connect." />);
    expect(screen.getByText("API Error")).toBeInTheDocument();
    expect(screen.getByText("Could not connect.")).toBeInTheDocument();
  });

  it("renders error code when provided", () => {
    render(<ErrorState code="RESOURCE_NOT_FOUND" />);
    expect(screen.getByText("RESOURCE_NOT_FOUND")).toBeInTheDocument();
  });

  it("calls onRetry when retry button clicked", async () => {
    const handleRetry = vi.fn();
    render(<ErrorState onRetry={handleRetry} />);
    await userEvent.click(screen.getByText("Try again"));
    expect(handleRetry).toHaveBeenCalledOnce();
  });
});

// ── EmptyState ─────────────────────────────────────────────────

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No incidents found" />);
    expect(screen.getByText("No incidents found")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="Empty" description="Nothing to see here." />);
    expect(screen.getByText("Nothing to see here.")).toBeInTheDocument();
  });

  it("renders action button and calls it on click", async () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={{ label: "Create system", onClick: handleAction }}
      />
    );
    await userEvent.click(screen.getByText("Create system"));
    expect(handleAction).toHaveBeenCalledOnce();
  });
});
