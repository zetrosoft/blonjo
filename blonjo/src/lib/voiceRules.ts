export interface VoiceRule {
  /** Pattern string RegExp yang ingin dicari (otomatis case-insensitive) */
  pattern: string;
  /** Teks pengganti atau COMMAND (seperti [STOP]) */
  replacement: string;
  /** Keterangan rule (opsional) */
  description?: string;
}

export const defaultVoiceRules: VoiceRule[] = [
  {
    pattern: "enter",
    replacement: "\n",
    description: 'Ubah kata "enter" menjadi baris baru'
  },
  {
    pattern: "a keong|saunya",
    replacement: "@",
    description: 'Ubah "a keong" atau "saunya" menjadi simbol @'
  },
  {
    pattern: "(\\d+)\\s+kali\\s+(\\d+)",
    replacement: "$1x$2",
    description: 'Ubah format "{n} kali {n}" menjadi "{n}x{n}"'
  },
  {
    pattern: "strip|bulet",
    replacement: "- ",
    description: 'Ubah kata "strip" atau "bulet" menjadi tanda list (-)'
  },
  {
    pattern: "sama dengan",
    replacement: "=",
    description: 'Ubah kata "sama dengan" menjadi simbol ='
  },
  {
    pattern: "plus",
    replacement: "+",
    description: 'Ubah kata "plus" menjadi simbol +'
  },
  {
    pattern: "minus",
    replacement: "-",
    description: 'Ubah kata "minus" menjadi simbol -'
  },
  {
    pattern: "stop|selesai",
    replacement: "[STOP]",
    description: 'Berhenti merekam suara secara otomatis'
  }
];

/**
 * Menerapkan seluruh rule yang ada di dalam array rules ke sebuah teks.
 * Ini memungkinkan aturan-aturan ini diubah secara dinamis atau ditarik dari database di masa depan.
 */
export function applyVoiceRules(text: string, rules: VoiceRule[] = defaultVoiceRules): string {
  let result = text;
  for (const rule of rules) {
    try {
      if (!rule.pattern) continue;
      // Gunakan regex global dan case-insensitive
      // Pastikan pattern aman dijalankan di new RegExp
      const regex = new RegExp(`\\b(?:${rule.pattern})\\b`, 'gi');
      result = result.replace(regex, rule.replacement);
    } catch (e) {
      // Fallback jika regex tidak valid (misal ada karakter khusus yang tidak di-escape)
      result = result.split(rule.pattern).join(rule.replacement);
    }
  }
  return result;
}

export function sanitizeVoiceRules(rules: any): VoiceRule[] {
  if (!Array.isArray(rules)) return [];
  const result: VoiceRule[] = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;
    
    let pattern = '';
    if (rule.pattern && typeof rule.pattern === 'object') {
      pattern = rule.pattern.source || '';
    } else if (rule.pattern) {
      pattern = String(rule.pattern);
    }
    
    let replacement = '';
    if (rule.replacement && typeof rule.replacement === 'object') {
      replacement = '';
    } else if (rule.replacement !== undefined && rule.replacement !== null) {
      replacement = String(rule.replacement);
    }
    
    if (pattern.trim() !== '') {
      result.push({
        pattern: pattern.trim(),
        replacement,
        description: rule.description ? String(rule.description) : undefined
      });
    }
  }
  return result;
}

