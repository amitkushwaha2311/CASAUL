/**
 * CAUSAL — Button primitive.
 *
 * Supports: primary (warm ivory) | secondary (elevated charcoal) | ghost | danger (oxide red) | outline | bronze
 * Supports: sm | md | lg sizes
 */

import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "bronze";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--color-ivory)",
    color: "var(--color-text-inverse)",
    border: "1px solid transparent",
    fontWeight: 600,
  },
  secondary: {
    backgroundColor: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-subtle)",
    fontWeight: 500,
  },
  bronze: {
    backgroundColor: "var(--color-accent-muted)",
    color: "var(--color-accent)",
    border: "1px solid rgba(169, 154, 128, 0.3)",
    fontWeight: 500,
  },
  outline: {
    backgroundColor: "transparent",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-default)",
    fontWeight: 500,
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid transparent",
    fontWeight: 500,
  },
  danger: {
    backgroundColor: "var(--color-status-failed-bg)",
    color: "var(--color-status-failed)",
    border: "1px solid var(--color-status-failed-border)",
    fontWeight: 500,
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "0.25rem 0.625rem", fontSize: "0.75rem", borderRadius: "var(--radius-sm)" },
  md: { padding: "0.5rem 1rem", fontSize: "0.8125rem", borderRadius: "var(--radius-md)" },
  lg: { padding: "0.625rem 1.25rem", fontSize: "0.9375rem", borderRadius: "var(--radius-md)" },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        fontFamily: "var(--font-mono)",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "all var(--duration-fast) var(--ease-default)",
        letterSpacing: "0.02em",
        lineHeight: 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            width: "12px",
            height: "12px",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.6s linear infinite",
          }}
        />
      )}
      {children}
    </button>
  );
}

export default Button;
