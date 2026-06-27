/**
 * Universal Numeric Heuristics — Standar Penanganan Angka Indo & US
 * =================================================================
 * Sesuai ARCHITECTURE.md Bab 8.
 */
export function parseUniversalNumber(str: string | number): number {
  if (str === null || str === undefined || str === '') return 0;
  if (typeof str === 'number') return str;

  let clean = str.toString().trim().replace(/\s/g, '');
  if (!clean) return 0;

  const hasDot = clean.includes('.');
  const hasComma = clean.includes(',');

  // 1. DUAL SEPARATOR (1.250.000,50 or 1,250,000.50)
  if (hasDot && hasComma) {
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    
    if (lastComma > lastDot) {
      // Indo style: dot=thousand, comma=decimal
      return Number(clean.replace(/\./g, '').replace(',', '.'));
    } else {
      // US style: comma=thousand, dot=decimal
      return Number(clean.replace(/,/g, ''));
    }
  }

  // 2. SINGLE SEPARATOR (1.000 or 10.50)
  if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ',';
    const parts = clean.split(separator);
    const lastPart = parts[parts.length - 1];

    // Heuristic: If last part has exactly 3 digits, it's likely a thousand separator
    // BUT only if there are other parts before it.
    if (parts.length > 1 && lastPart.length === 3) {
      return Number(clean.replace(new RegExp(`\\${separator}`, 'g'), ''));
    } else {
      // Likely a decimal separator
      return Number(clean.replace(separator, '.'));
    }
  }

  // 3. NO SEPARATOR
  return Number(clean) || 0;
}
