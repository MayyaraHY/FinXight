/**
 * Formats a number with thousand separators and 2 decimal places
 * Returns "-" for null or undefined values
 * 
 * @param value - The number to format (can be null/undefined)
 * @returns Formatted string (e.g., "1,234.56" or "-")
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
