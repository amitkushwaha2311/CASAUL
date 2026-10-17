import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import HomePage from "../app/page";

// Mock matchMedia for window in jsdom
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

describe("CAUSAL Public Landing Page (/)", () => {
  it("renders the primary hero headline and product value proposition", () => {
    render(<HomePage />);

    // Check primary hero headline
    const headline = screen.getByRole("heading", {
      level: 1,
      name: /SEE THE CASCADE/i,
    });
    expect(headline).toBeInTheDocument();

    // Check product subtitle
    expect(
      screen.getByText(
        /Autonomous causal reasoning, predictive blast-radius forecasting, and counterfactual scenario modeling/i
      )
    ).toBeInTheDocument();

    // Check system status badge
    expect(
      screen.getByText(/SYSTEM ONLINE · PHASES 1–(6|10) ACTIVE/i)
    ).toBeInTheDocument();
  });

  it("provides direct navigation CTAs to the /app platform shell and API docs", () => {
    render(<HomePage />);

    // Enter Platform CTA
    const enterPlatformBtns = screen.getAllByRole("link", {
      name: /Enter Platform|Launch Console|Launch CAUSAL Platform/i,
    });
    expect(enterPlatformBtns.length).toBeGreaterThan(0);
    expect(enterPlatformBtns[0]).toHaveAttribute("href", "/app");

    // API Docs links
    const apiDocLinks = screen.getAllByRole("link", {
      name: /API Docs|Swagger API Specs/i,
    });
    expect(apiDocLinks.length).toBeGreaterThan(0);
    expect(apiDocLinks[0]).toHaveAttribute("href", "http://localhost:8000/api/docs");
    expect(apiDocLinks[0]).toHaveAttribute("target", "_blank");
  });

  it("displays honest disclaimer labeling marketing animations as illustrative simulations", () => {
    render(<HomePage />);

    const disclaimerBadges = screen.getAllByText(/ILLUSTRATIVE SIMULATION/i);
    expect(disclaimerBadges.length).toBeGreaterThan(0);
    expect(disclaimerBadges[0]).toBeInTheDocument();
    expect(
      screen.getByText(/Digital Twin Graph Demonstration · Directional Causal Dependencies/i)
    ).toBeInTheDocument();
  });

  it("allows triggering and resetting the interactive dependency cascade simulation", () => {
    vi.useFakeTimers();
    render(<HomePage />);

    // Initially, Substation Alpha is in normal state
    const simulateBtn = screen.getByRole("button", {
      name: /Simulate Substation Alpha Trip/i,
    });
    expect(simulateBtn).toBeInTheDocument();

    // Trigger cascade simulation
    act(() => {
      fireEvent.click(simulateBtn);
    });

    // Substation Alpha trips
    expect(screen.getByText(/0.0 kV · BREAKER TRIPPED/i)).toBeInTheDocument();
    expect(screen.getByText(/CASCADE ACTIVE · PHASE 1\/4/i)).toBeInTheDocument();

    // Advance timer to trigger Step 2 (Pump degradation)
    act(() => {
      vi.advanceTimersByTime(850);
    });
    expect(screen.getByText(/CASCADE ACTIVE · PHASE 2\/4/i)).toBeInTheDocument();

    // Select pump node to verify updated degraded telemetry in inspector
    const pumpNode = screen.getByLabelText(/Node Aqueduct Pump Station 4/i);
    act(() => {
      fireEvent.click(pumpNode);
    });
    expect(screen.getByText(/Pressure Drop 42 bar/i)).toBeInTheDocument();

    // Reset button should now be available
    const resetBtn = screen.getByRole("button", {
      name: /Reset System State/i,
    });
    expect(resetBtn).toBeInTheDocument();

    // Click reset
    act(() => {
      fireEvent.click(resetBtn);
    });

    // Returns to nominal
    expect(screen.getByRole("button", { name: /Simulate Substation Alpha Trip/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders causal reasoning hypotheses and allows inspecting evidence dossier", () => {
    render(<HomePage />);

    // Check section title
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Evidence-Grounded Causal Hypotheses/i,
      })
    ).toBeInTheDocument();

    // Check hypothesis cards
    expect(
      screen.getByText(/Cavitation in Aqueduct Pump 4 caused by Substation Alpha voltage drop/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mechanical impeller fatigue fracture/i)
    ).toBeInTheDocument();

    // Select second hypothesis
    const secondHyp = screen.getByText(/Mechanical impeller fatigue fracture/i);
    fireEvent.click(secondHyp);

    // Verify updated candidate factor dossier
    expect(
      screen.getByText(/Component mechanical wear/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Previous ultrasonic acoustic inspection passed 48 hours prior/i)
    ).toBeInTheDocument();
  });

  it("allows switching forecasting horizons with statistical uncertainty integrity notice", () => {
    render(<HomePage />);

    // Check forecasting section header
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Predictive Blast-Radius Timelines/i,
      })
    ).toBeInTheDocument();

    // Check methodology integrity callout
    expect(
      screen.getByText(/Forecasts represent model predictions, clearly distinguished from observed operational telemetry/i)
    ).toBeInTheDocument();

    // Check T+0m, T+5m, T+15m, T+30m horizon tabs
    const horizonT0 = screen.getByRole("button", { name: /T\+0m/i });
    const horizonT30 = screen.getByRole("button", { name: /T\+30m/i });
    expect(horizonT0).toBeInTheDocument();
    expect(horizonT30).toBeInTheDocument();

    // Switch to T+30m
    fireEvent.click(horizonT30);
    expect(screen.getByText(/89%/i)).toBeInTheDocument();
    expect(screen.getByText(/7 \/ 8 Nodes/i)).toBeInTheDocument();
  });

  it("allows toggling counterfactual scenario overrides with dynamic blast radius recalculation", () => {
    render(<HomePage />);

    // Check scenario sandbox header
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Counterfactual What-If Sandboxes/i,
      })
    ).toBeInTheDocument();

    // Check baseline is marked read-only
    expect(screen.getByText(/READ ONLY · IMMUTABLE/i)).toBeInTheDocument();

    // Check override options exist
    const overrideOption = screen.getByText(/Engage Aux Diesel Generator \(4MW\)/i);
    expect(overrideOption).toBeInTheDocument();

    // Toggle override
    fireEvent.click(overrideOption);

    // Dynamic calculation updates
    expect(screen.getByText(/Mitigated Blast Radius Calculation/i)).toBeInTheDocument();
  });

  it("renders multi-domain infrastructure support cards", () => {
    render(<HomePage />);

    expect(screen.getByText(/High-Voltage Power Grids/i)).toBeInTheDocument();
    expect(screen.getByText(/Municipal Aqueducts & Water/i)).toBeInTheDocument();
    expect(screen.getByText(/Regional Telecom Backbones/i)).toBeInTheDocument();
    expect(screen.getByText(/Cyber-Physical Transit & Rail/i)).toBeInTheDocument();
  });

  it("renders the footer with architecture specifications and links to app routes", () => {
    render(<HomePage />);

    expect(screen.getByText(/Phase 1: Multi-Domain Graph DB/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 5: Causal Evidence Reasoner/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 6: Temporal Forecast Engine/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Built for Resilient Cyber-Physical Infrastructure/i)
    ).toBeInTheDocument();
  });
});
