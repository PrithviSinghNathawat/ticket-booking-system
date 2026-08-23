import { ButtonHTMLAttributes } from "react";
import Link from "next/link";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-transform active:translate-y-px disabled:opacity-50 disabled:pointer-events-none disabled:active:translate-y-0";

const variants = {
  primary: "bg-[var(--accent)] text-[var(--accent-fg)] px-4 py-2 shadow-[0_1px_0_rgba(0,0,0,0.15)]",
  secondary: "border border-[var(--border-subtle)] px-4 py-2 hover:bg-[var(--border-subtle)]/30",
  danger: "border border-red-300 text-red-700 px-4 py-2 hover:bg-red-50",
  ghost: "px-2 py-1 hover:bg-[var(--border-subtle)]/30",
} as const;

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  href,
  children,
}: {
  variant?: Variant;
  className?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
