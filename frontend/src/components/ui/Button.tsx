import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "link" | "success" | "warning";
export type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loadingText?: string;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border border-transparent",
  secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-transparent",
  danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm border border-transparent",
  ghost: "bg-transparent hover:bg-slate-100 text-slate-700 border border-transparent",
  outline: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm",
  link: "bg-transparent text-indigo-600 hover:text-indigo-700 hover:underline border-transparent shadow-none p-0 h-auto",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border border-transparent",
  warning: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm border border-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  icon: "p-2 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      isLoading = false,
      variant = "primary",
      size = "md",
      loadingText,
      icon,
      disabled,
      ...props
    },
    ref
  ) => {
    // Determine the base styling
    const baseStyle =
      "inline-flex items-center justify-center gap-2 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2";

    // When disabled or loading, we reduce opacity and change cursor,
    // but we retain the variant colors so the button still looks like its variant.
    const stateStyle = disabled || isLoading ? "opacity-60 cursor-not-allowed" : "";

    // Merge styles manually (simple merge, prioritizing user className)
    const combinedClassName = `${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${stateStyle} ${className}`.trim();

    return (
      <button ref={ref} disabled={disabled || isLoading} className={combinedClassName} {...props}>
        {isLoading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          icon
        )}
        
        {isLoading && loadingText ? (
          <span>{loadingText}</span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
