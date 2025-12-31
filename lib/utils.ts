import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCategoryColor(category: string, type: "income" | "expense" = "expense"): string {
  const categoryColors: Record<string, string> = {
    // Expense categories
    Food: "#ef4444",
    Utilities: "#f97316",
    Transportation: "#06b6d4",
    Entertainment: "#8b5cf6",
    Shopping: "#ec4899",
    Health: "#10b981",
    Education: "#3b82f6",
    Other: "#6b7280",
    // Income categories
    Salary: "#10b981",
    Income: "#10b981",
    Bonus: "#8b5cf6",
    Investment: "#06b6d4",
  }

  return categoryColors[category] || "#6b7280"
}
