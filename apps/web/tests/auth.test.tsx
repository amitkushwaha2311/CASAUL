/**
 * CAUSAL — Frontend Tests: Authentication (Login & Signup Pages, Auth Context)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "../app/login/page";
import SignupPage from "../app/signup/page";

// ── Mock Next.js navigation ──────────────────────────────────
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (param: string) => null,
  }),
  usePathname: () => "/login",
}));

// ── Mock AuthContext methods for direct page testing ─────────
const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockLogout = vi.fn();

vi.mock("@/lib/auth-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-context")>();
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
      getToken: () => null,
    }),
  };
});

describe("Authentication: Sign In Page (/login)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sign-in editorial headline and inputs", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Access the CAUSAL Resilience Platform")).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders the link to the sign-up page", () => {
    render(<LoginPage />);

    const signupLink = screen.getByRole("link", { name: /create an account/i });
    expect(signupLink).toBeInTheDocument();
    expect(signupLink).toHaveAttribute("href", "/signup");
  });

  it("toggles password visibility when clicking the reveal button", () => {
    render(<LoginPage />);

    const passwordInput = document.getElementById("login-password") as HTMLInputElement;
    const toggleBtn = document.getElementById("login-toggle-password") as HTMLButtonElement;

    expect(passwordInput.type).toBe("password");
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe("text");
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe("password");
  });

  it("disables submit button when inputs are empty", () => {
    render(<LoginPage />);

    const submitBtn = document.getElementById("login-submit-btn") as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit button and calls login on form submission", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    const emailInput = document.getElementById("login-email") as HTMLInputElement;
    const passwordInput = document.getElementById("login-password") as HTMLInputElement;
    const submitBtn = document.getElementById("login-submit-btn") as HTMLButtonElement;
    const form = submitBtn.closest("form")!;

    fireEvent.change(emailInput, { target: { value: "operator@causal.systems" } });
    fireEvent.change(passwordInput, { target: { value: "Secr3tP@ssw0rd!" } });

    expect(submitBtn).not.toBeDisabled();
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("operator@causal.systems", "Secr3tP@ssw0rd!");
      expect(mockPush).toHaveBeenCalledWith("/app");
    });
  });

  it("displays an error alert when login fails", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Invalid operator credentials"));
    render(<LoginPage />);

    const emailInput = document.getElementById("login-email") as HTMLInputElement;
    const passwordInput = document.getElementById("login-password") as HTMLInputElement;
    const submitBtn = document.getElementById("login-submit-btn") as HTMLButtonElement;
    const form = submitBtn.closest("form")!;

    fireEvent.change(emailInput, { target: { value: "wrong@causal.systems" } });
    fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Invalid operator credentials")).toBeInTheDocument();
    });
  });
});

describe("Authentication: Sign Up Page (/signup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sign-up editorial headline and registration inputs", () => {
    render(<SignupPage />);

    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm password$/i)).toBeInTheDocument();
  });

  it("renders the link to the sign-in page", () => {
    render(<SignupPage />);

    const signinLink = screen.getByRole("link", { name: /sign in/i });
    expect(signinLink).toBeInTheDocument();
    expect(signinLink).toHaveAttribute("href", "/login");
  });

  it("calculates password strength dynamically as user types", () => {
    render(<SignupPage />);

    const passwordInput = document.getElementById("signup-password") as HTMLInputElement;

    fireEvent.change(passwordInput, { target: { value: "abc" } });
    expect(screen.getByText("Weak")).toBeInTheDocument();

    fireEvent.change(passwordInput, { target: { value: "Password123!" } });
    expect(screen.getByText("Strong")).toBeInTheDocument();
  });

  it("shows an error and disables submission when passwords do not match", () => {
    render(<SignupPage />);

    const nameInput = document.getElementById("signup-display-name") as HTMLInputElement;
    const emailInput = document.getElementById("signup-email") as HTMLInputElement;
    const passwordInput = document.getElementById("signup-password") as HTMLInputElement;
    const confirmInput = document.getElementById("signup-confirm-password") as HTMLInputElement;
    const submitBtn = document.getElementById("signup-submit-btn") as HTMLButtonElement;

    fireEvent.change(nameInput, { target: { value: "Dev Operator" } });
    fireEvent.change(emailInput, { target: { value: "dev@causal.systems" } });
    fireEvent.change(passwordInput, { target: { value: "Password123!" } });
    fireEvent.change(confirmInput, { target: { value: "Mismatch999!" } });

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("submits registration successfully when fields are valid", async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    render(<SignupPage />);

    const nameInput = document.getElementById("signup-display-name") as HTMLInputElement;
    const emailInput = document.getElementById("signup-email") as HTMLInputElement;
    const passwordInput = document.getElementById("signup-password") as HTMLInputElement;
    const confirmInput = document.getElementById("signup-confirm-password") as HTMLInputElement;
    const submitBtn = document.getElementById("signup-submit-btn") as HTMLButtonElement;
    const form = submitBtn.closest("form")!;

    fireEvent.change(nameInput, { target: { value: "Dev Operator" } });
    fireEvent.change(emailInput, { target: { value: "dev@causal.systems" } });
    fireEvent.change(passwordInput, { target: { value: "StrongPass123!" } });
    fireEvent.change(confirmInput, { target: { value: "StrongPass123!" } });

    expect(submitBtn).not.toBeDisabled();
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        "dev@causal.systems",
        "Dev Operator",
        "StrongPass123!"
      );
      expect(mockPush).toHaveBeenCalledWith("/app");
    });
  });
});
