import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { fetchClient } from '../../../api/client';
import { parseNoteText, type ParsedTransaction } from '../../../lib/smartParser';

const SMART_NOTE_EXAMPLES = [
  'Beli beras 5kg @ 15000, minyak 2L @ 28000 bayar tunai',
  'Penjualan kerupuk 10 bungkus total 50rb',
  'Bayar listrik 150rb via bank',
];

/**
 * useSmartNote — Semua state dan handler untuk mode Smart Note.
 *
 * Alur:
 *  1. User ketik → noteText
 *  2. Tekan parse → API call → merge server+local → parsedResult
 *  3. Voice interim → tampilkan teks (belum parse)
 *  4. Voice final   → parse otomatis
 */
export function useSmartNote() {
  const [noteText, setNoteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedTransaction | null>(null);
  const exampleIdx = useRef(0);

  // ── Parse gabungan server + lokal ────────────────────────────────
  const mergeAndSet = useCallback(async (text: string) => {
    setIsParsing(true);
    const local = parseNoteText(text);
    try {
      const res: any = await fetchClient('/finance/transactions/parse', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setParsedResult({
        ...local,
        transaction_type: res.parsed_data.transaction_type || local.transaction_type,
        total_amount: res.parsed_data.total_amount || local.total_amount,
        description: res.parsed_data.description || local.description,
        transaction_date: res.parsed_data.transaction_date || local.transaction_date,
        suggested_entries: res.suggested_entries,
      });
    } catch {
      // Server gagal → fallback ke local parser (tidak perlu toast, silent)
      setParsedResult(local);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleParse = useCallback(() => {
    if (!noteText.trim()) return;
    mergeAndSet(noteText);
  }, [noteText, mergeAndSet]);

  const handleVoiceTranscript = useCallback((text: string, isInterim: boolean) => {
    setNoteText(text);
    if (isInterim) {
      setParsedResult(null); // Belum final, bersihkan preview
    } else {
      mergeAndSet(text);
    }
  }, [mergeAndSet]);

  const handleReset = useCallback(() => {
    setNoteText('');
    setParsedResult(null);
  }, []);

  const handleLoadExample = useCallback(() => {
    const example = SMART_NOTE_EXAMPLES[exampleIdx.current % SMART_NOTE_EXAMPLES.length];
    exampleIdx.current += 1;
    setNoteText(example);
    setParsedResult(null);
  }, []);

  const updateParsed = useCallback((updates: Partial<ParsedTransaction>) => {
    setParsedResult(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  return {
    noteText,
    setNoteText,
    isParsing,
    parsedResult,
    setParsedResult,
    handleParse,
    handleVoiceTranscript,
    handleReset,
    handleLoadExample,
    updateParsed,
  };
}
