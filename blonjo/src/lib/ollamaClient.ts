/**
 * ollamaClient.ts
 *
 * Klien Ollama Lokal untuk Blonjo Frontend.
 * Digunakan khusus untuk PARSING TEKS (Smart Note → JSON).
 *
 * Model: qwen3.5:4b (dipatok, bukan auto-detect)
 * Ollama default URL: http://localhost:11434
 *
 * Alur:
 *  1. checkLocalParseModel() → cek apakah Ollama aktif & qwen3.5:4b tersedia
 *  2. runOllamaParse(text) → kirim teks ke model, dapatkan JSON transaksi
 *
 * CATATAN KEAMANAN:
 * Ollama harus dikonfigurasi dengan OLLAMA_ORIGINS yang mengizinkan asal
 * frontend (misal: OLLAMA_ORIGINS="http://localhost:5173").
 * Di Mac: set via env sebelum menjalankan ollama serve.
 */

import { PARSE_TRANSACTION_SYSTEM_PROMPT } from './parsePrompt';

const OLLAMA_BASE_URL = 'http://localhost:11434';

/** Model yang digunakan untuk parsing lokal — dipatok ke qwen3.5:4b */
const LOCAL_PARSE_MODEL = 'qwen3.5:4b';

/** Timeout untuk pengecekan ketersediaan Ollama (ms) */
const PING_TIMEOUT_MS = 3_000;

/** Timeout maksimal untuk proses parsing (ms) */
const PARSE_TIMEOUT_MS = 30_000;

/**
 * Cek apakah Ollama aktif DAN model qwen3.5:4b tersedia.
 *
 * @returns Nama model (string) jika siap, null jika tidak.
 */
export async function checkLocalParseModel(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: any) =>
      m.name.toLowerCase()
    );
    if (models.length === 0) return null;

    // Cari exact match atau prefix match untuk qwen3.5:4b
    const found = models.find(
      (m) => m === LOCAL_PARSE_MODEL || m.startsWith(LOCAL_PARSE_MODEL)
    );
    return found || null;
  } catch {
    // Ollama mati, tidak dapat dijangkau, atau timeout
    return null;
  }
}

/**
 * Jalankan parsing teks transaksi menggunakan qwen3.5:4b secara lokal.
 * Prompt yang digunakan identik dengan yang ada di MCP Server (parsePrompt.ts).
 *
 * @param text - Teks transaksi yang akan di-parse
 * @returns Objek JSON hasil parsing
 * @throws Error jika Ollama gagal atau response bukan JSON valid
 */
export async function runOllamaParse(text: string): Promise<any> {
  // Inject tanggal hari ini dari browser (bukan dari server container)
  // Ini menjamin tanggal selalu akurat terlepas dari jam server VPS
  const todayISO = new Date().toISOString().split('T')[0];
  const promptWithDate =
    `[KONTEKS SISTEM - WAJIB DIIKUTI] Tanggal hari ini (today_date) adalah: ${todayISO}. ` +
    `Gunakan tanggal ini sebagai transaction_date (format YYYY-MM-DD) jika tidak ada tanggal eksplisit di teks input.\n\n` +
    text;

  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_PARSE_MODEL,
      system: PARSE_TRANSACTION_SYSTEM_PROMPT,
      prompt: promptWithDate,
      stream: false,
      format: 'json', // Paksa output berupa JSON (didukung Ollama)
      options: {
        temperature: 0.1, // Rendah agar deterministik & presisi
        num_predict: 2048,
      },
    }),
    signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Ollama Error HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  try {
    const parsed = JSON.parse(data.response);
    return parsed;
  } catch {
    throw new Error(
      `Ollama returned invalid JSON: ${data.response?.slice(0, 100)}...`
    );
  }
}
