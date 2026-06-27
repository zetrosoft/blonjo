import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format number into Indonesian Rupiah format
 * Example: 1250000 -> Rp 1.250.000
 */
export function formatRp(val: number): string {
  if (isNaN(val) || val === null || val === undefined) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(val);
}

/**
 * Format number into Indonesian number format (thousands separator = dot)
 * Example: 1250000 -> 1.250.000
 */
export function formatNumber(val: number, maxDecimals: number = 2): string {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  }).format(val);
}

/**
 * Format date/time string into Indonesian locale
 */
export function formatDateTime(dateStr: string | Date): string {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return date.toLocaleString('id-ID');
}
