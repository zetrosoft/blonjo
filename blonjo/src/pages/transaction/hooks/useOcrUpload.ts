import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { fetchClient } from '../../../api/client';
import { parseNoteText, type ParsedTransaction } from '../../../lib/smartParser';

/**
 * useOcrUpload — Handle upload struk foto dan polling status OCR.
 *
 * Setelah OCR selesai, otomatis isi noteText dan trigger parse
 * menggunakan callback dari useSmartNote.
 */
export function useOcrUpload(
  setNoteText: (text: string) => void,
  onParse: (text: string) => void,
) {
  const [isUploading, setIsUploading] = useState(false);
  const [currentOcrTaskId, setCurrentOcrTaskId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOCRStatus = useCallback((taskId: number) => {
    setCurrentOcrTaskId(taskId);
    stopPolling();

    pollRef.current = setInterval(async () => {
      try {
        const tasks = await fetchClient('/ocr/tasks');
        const task = tasks.find((t: any) => t.id === taskId);
        if (!task) return;

        if (task.status === 'completed' || task.status === 'corrected') {
          stopPolling();
          setIsUploading(false);

          // Susun teks dari hasil OCR
          let text = '';
          const d = task.extracted_data;
          
          if (d && (d.items?.length > 0 || d.total_amount)) {
            text = `${d.description || 'Nota Baru'} :\n`;
            d.items?.forEach((item: any) => {
              const qtyStr = item.qty ? `${item.qty} ${item.unit || 'pcs'} @ ` : '';
              const priceStr = item.price || item.unit_price || item.harga_satuan || 0;
              text += `• ${item.name || item.nama_barang} ${qtyStr}${priceStr}\n`;
            });
            if (d.total_amount || d.total) text += `Total: ${d.total_amount || d.total}`;
          } else if (task.raw_ocr_text) {
            text = `Pembelian ${task.raw_ocr_text}`;
          } else {
            text = 'Nota Baru';
          }

          setNoteText(text);
          toast.success('OCR Berhasil', { description: 'Data mentah telah dimasukkan ke Smart Note.' });

          // Parse menggunakan backend/RAG parser
          setTimeout(() => onParse(text), 500);
        } else if (task.status === 'failed') {
          stopPolling();
          setIsUploading(false);
          toast.error('OCR Gagal', { description: task.error_message || 'Gagal mengekstrak data struk.' });
        }
      } catch (err) {
        console.error('[useOcrUpload] Polling error:', err);
      }
    }, 2000);
  }, [setNoteText, onParse, stopPolling]);

  const uploadFileDirectly = useCallback(async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await fetchClient('/ocr/upload', { method: 'POST', body: formData });
      toast.info('File dari kamera diunggah', { description: 'Sedang memproses data dengan AI...' });
      pollOCRStatus(result.id);
    } catch (error: any) {
      setIsUploading(false);
      toast.error('Gagal mengunggah', { description: error.message });
    }
  }, [pollOCRStatus]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFileDirectly(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadFileDirectly]);

  return {
    isUploading,
    currentOcrTaskId,
    fileInputRef,
    handleFileUpload,
    uploadFileDirectly,
  };
}
