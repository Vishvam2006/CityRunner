import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-2xl font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md shadow-blue-900/20": variant === "default",
            "bg-red-500 text-white hover:bg-red-600": variant === "destructive",
            "border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-100": variant === "outline",
            "bg-slate-800 text-slate-100 hover:bg-slate-700": variant === "secondary",
            "hover:bg-slate-800/50 hover:text-slate-50 text-slate-300": variant === "ghost",
            "text-blue-500 underline-offset-4 hover:underline": variant === "link",
            "h-12 px-6 py-2 text-base": size === "default",
            "h-10 rounded-xl px-4 text-sm": size === "sm",
            "h-16 rounded-3xl px-8 text-lg font-semibold": size === "lg",
            "h-12 w-12": size === "icon",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
