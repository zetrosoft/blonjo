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
 * useSmartNote — State & Handler untuk Mode Smart Note.
 * Pemrosesan murni menggunakan Server Backend Sajen API (Gemini / MCP).
 */
export function useSmartNote() {
  const [noteText, setNoteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedTransaction | null>(null);
  const exampleIdx = useRef(0);

  // ── Parse murni Server Backend Sajen API (Gemini / MCP) ───────────
  const mergeAndSet = useCallback(async (text: string, extraData?: any) => {
    setIsParsing(true);

    try {
      const res: any = await fetchClient('/finance/transactions/parse', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });

      const parsedData = res.parsed_data || {};
      const baseParsed = extraData ? { ...parsedData, ...extraData } : parsedData;

      setParsedResult({
        transaction_type: baseParsed.transaction_type || 'expense',
        type_label: baseParsed.type_label || 'Pengeluaran',
        type_color: baseParsed.type_color || 'rose',
        description: baseParsed.description || text,
        total_amount: Number(baseParsed.total_amount) || 0,
        transaction_date: baseParsed.transaction_date || new Date().toISOString().split('T')[0],
        contact_name: baseParsed.contact_name || '',
        contact_address: baseParsed.contact_address || '',
        items: Array.isArray(baseParsed.items) ? baseParsed.items : [],
        payment_method: baseParsed.payment_method || 'cash',
        due_date: baseParsed.due_date || '',
        raw_text: text,
        confidence: baseParsed.confidence || 'high',
        ocr_source: 'llm',
        suggested_entries: res.suggested_entries || baseParsed.suggested_entries || [],
        is_duplicate: Boolean(baseParsed.is_duplicate),
        duplicate_task_id: baseParsed.duplicate_task_id,
        duplicate_warning: baseParsed.duplicate_warning,
      });
    } catch (err: any) {
      console.error('[useSmartNote] Server Parsing Error:', err);
      toast.error('Gagal Menganalisa Transaksi AI', {
        description: err?.detail || err?.message || 'Server Backend Sajen tidak dapat dihubungi. Silakan periksa koneksi atau coba beberapa saat lagi.',
        duration: 8000
      });
      // Fallback lokal sederhana hanya jika server benar-benar bermasalah
      const local = await parseNoteText(text);
      const baseParsed = extraData ? { ...local, ...extraData } : local;
      setParsedResult(baseParsed);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleParse = useCallback((overrideText?: any, extraData?: any) => {
    const textToParse = typeof overrideText === 'string' ? overrideText : noteText;
    if (!textToParse.trim()) return;
    const extra = typeof overrideText === 'object' && overrideText !== null ? overrideText : extraData;
    mergeAndSet(textToParse, extra);
  }, [noteText, mergeAndSet]);

  const handleVoiceTranscript = useCallback(
    (text: string, isInterim: boolean) => {
      setNoteText(text);
      if (isInterim) {
        setParsedResult(null);
      } else {
        mergeAndSet(text);
      }
    },
    [mergeAndSet]
  );

  const handleReset = useCallback(() => {
    setNoteText('');
    setParsedResult(null);
  }, []);

  const handleLoadExample = useCallback(() => {
    const example =
      SMART_NOTE_EXAMPLES[exampleIdx.current % SMART_NOTE_EXAMPLES.length];
    exampleIdx.current += 1;
    setNoteText(example);
    setParsedResult(null);
  }, []);

  const updateParsed = useCallback((updates: Partial<ParsedTransaction>) => {
    setParsedResult((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  return {
    noteText,
    setNoteText,
    isParsing,
    parsedResult,
    setParsedResult,
    mergeAndSet,
    handleParse,
    handleVoiceTranscript,
    handleReset,
    handleLoadExample,
    updateParsed,
  };
}
