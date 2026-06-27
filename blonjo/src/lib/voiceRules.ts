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
 * Mencoba memproses perintah pembuatan tabel Markdown dari suara.
 * Format yang didukung: 
 * "buat tabel kolom satu {nama} kolom dua {nama} baris satu {isi} kolom dua {isi} ..."
 */
function parseVoiceTableCommand(text: string): string {
  const lower = text.toLowerCase();
  if (!lower.includes('buat tabel')) return text;

  try {
    // 1. Ambil bagian setelah "buat tabel"
    const content = text.split(/buat tabel/i)[1].trim();

    // 2. Cari Header (Kolom)
    const headerPart = content.split(/baris/i)[0].trim();
    const columnMatches = headerPart.split(/kolom\s+(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d+)/i).filter(s => s.trim() !== "");

    if (columnMatches.length === 0) return text;

    const headers = columnMatches.map(c => c.trim().replace(/^[:=]\s*/, ''));

    // 3. Cari Baris-baris
    const rows: string[][] = [];
    const rowSegments = content.split(/baris\s+(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d+)/i).slice(1);

    for (const segment of rowSegments) {
      const cellMatches = segment.split(/kolom\s+(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d+)/i).filter(s => s.trim() !== "");
      if (cellMatches.length > 0) {
        rows.push(cellMatches.map(c => c.trim().replace(/^[:=]\s*/, '')));
      } else {
        // Jika tidak ada kata "kolom" di dalam baris, masukkan seluruh segment ke kolom pertama
        rows.push([segment.trim()]);
      }
    }

    // 4. Bangun Markdown Table
    let markdown = `\n| ${headers.join(' | ')} |\n`;
    markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

    for (const row of rows) {
      // Pastikan jumlah kolom baris sama dengan header
      const paddedRow = headers.map((_, i) => row[i] || "");
      markdown += `| ${paddedRow.join(' | ')} |\n`;
    }

    return markdown;
  } catch (e) {
    console.error("Gagal parse voice table:", e);
    return text;
  }
}

/**
 * Memproses ekspresi tanggal relatif (Bahasa Indonesia) menjadi tanggal absolut (YYYY-MM-DD).
 * Contoh: 
 * - "hari kemarin" -> H-1
 * - "lusa" -> H-2 (Aturan Khusus Proyek)
 * - "{n} hari yang lalu" -> H-n
 * - "jatuh tempo {n} hari" -> H+n
 */
function parseRelativeDates(text: string): string {
  let result = text;
  const now = new Date();

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // 1. "hari kemarin" -> H-1
  if (result.toLowerCase().includes("hari kemarin")) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    result = result.replace(/hari kemarin/gi, formatDate(yesterday));
  }

  // 2. "lusa" -> H-2 (Aturan Khusus Proyek, biasanya H+2 tapi user minta H-2)
  if (result.toLowerCase().includes("lusa")) {
    const hMinus2 = new Date(now);
    hMinus2.setDate(now.getDate() - 2);
    result = result.replace(/\blusa\b/gi, formatDate(hMinus2));
  }

  // 3. "{n} hari yang lalu" -> H-n
  const agoRegex = /(\d+)\s+hari\s+yang\s+lalu/gi;
  result = result.replace(agoRegex, (_, n) => {
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - parseInt(n, 10));
    return formatDate(pastDate);
  });

  // 4. "jatuh tempo {n} hari" -> H+n
  const dueRegex = /jatuh\s+tempo\s+(\d+)\s+hari/gi;
  result = result.replace(dueRegex, (_, n) => {
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + parseInt(n, 10));
    return `jatuh tempo ${formatDate(futureDate)}`;
  });

  return result;
}

/**
 * Menerapkan seluruh rule yang ada di dalam array rules ke sebuah teks.
 * Ini memungkinkan aturan-aturan ini diubah secara dinamis atau ditarik dari database di masa depan.
 */
export function applyVoiceRules(text: string, rules: VoiceRule[] = defaultVoiceRules): string {
  // 1. Cek perintah tabel khusus
  let result = parseVoiceTableCommand(text);

  // 2. Cek tanggal relatif (Dinamis)
  result = parseRelativeDates(result);

  if (result === text || result !== text) {
    // Jalankan rule standar (Statik/Regex)
    for (const rule of rules) {
      try {
        if (!rule.pattern) continue;
        // Gunakan regex global dan case-insensitive
        const regex = new RegExp(`\\b(?:${rule.pattern})\\b`, 'gi');
        result = result.replace(regex, rule.replacement);
      } catch (e) {
        // Fallback jika regex tidak valid
        result = result.split(rule.pattern).join(rule.replacement);
      }
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
