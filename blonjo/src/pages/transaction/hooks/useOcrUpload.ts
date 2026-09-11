import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { fetchClient, ApiError } from '../../../api/client';

// ═════════════════════════════════════════════════════════════════════════════
// useOcrUpload — Hook utama untuk upload foto struk/nota
// ═════════════════════════════════════════════════════════════════════════════

/**
 * useOcrUpload — Handle upload struk foto dan polling status OCR.
 *
 * Strategi:
 *  - OCR Gambar SELALU dikirim ke AI Vision Server (MCP/Gemini)
 *  - Alasan: model Vision lokal (misal llama3.2-vision) membutuhkan >5GB RAM,
 *    tidak cocok untuk Mac M1 8GB yang sudah terpakai oleh dev tools.
 *  - Parsing hasil OCR (teks → JSON) ditangani oleh useSmartNote yang sudah
 *    menggunakan Ollama Lokal (qwen3.5:4b) jika tersedia.
 *
 * ocrSource: 'llm' | null  → digunakan untuk badge di UI
 *
 * CATATAN: Kode ONNX TrOCR (@huggingface/transformers) yang sebelumnya ada
 * di file ini telah dihapus karena:
 *  1. Model TrOCR-small-printed berhalusinasi parah pada gambar struk penuh.
 *  2. Library menambah beban bundler (lazy import tetap memperlambat).
 *  3. Digantikan oleh jalur Gemini Vision yang akurasi & kecepatannya jauh lebih baik.
 */
export function useOcrUpload(
  setNoteText: (text: string) => void,
  onParse: (text: string, extraData?: any) => void,
) {
  const [isUploading, setIsUploading] = useState(false);
  const [currentOcrTaskId, setCurrentOcrTaskId] = useState<number | null>(null);
  const [ocrSource, setOcrSource] = useState<'llm' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const resetOcr = useCallback(() => {
    setCurrentOcrTaskId(null);
    setOcrSource(null);
    setIsUploading(false);
    stopPolling();
  }, [stopPolling]);

  // ── Polling status OCR task dari server ────────────────────────────────
  const pollOCRStatus = useCallback((taskId: number) => {
    setCurrentOcrTaskId(taskId);
    stopPolling();

    pollRef.current = setInterval(async () => {
      try {
        const task = await fetchClient(`/ocr/tasks/${taskId}`);

        if (task.status === 'completed' || task.status === 'corrected') {
          stopPolling();
          setIsUploading(false);

          // Susun teks dari hasil OCR secara lengkap (prioritaskan hasil koreksi yang tersimpan)
          let text = '';
          const d = task.corrected_data || task.extracted_data;

          if (d && Object.keys(d).length > 0) {
            // Helper rekursif untuk mencari nama supplier/merchant/vendor di berbagai struktur JSON
            const findSupplier = (obj: any): string => {
              if (!obj || typeof obj !== 'object') return '';

              // 1. Cek properti langsung bertipe string
              const directKeys = ['contact_name', 'company_name', 'merchant_name', 'supplier_name', 'vendor_name', 'supplier', 'merchant', 'vendor'];
              for (const k of directKeys) {
                if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim();
              }

              // 2. Cek properti bertipe objek
              const objKeys = ['merchant', 'vendor', 'company_info', 'header', 'supplier_info'];
              for (const k of objKeys) {
                const sub = obj[k];
                if (sub && typeof sub === 'object') {
                  const name = sub.name || sub.brand_name || sub.company_name || sub.merchant_name || sub.supplier_name || sub.vendor_name;
                  if (typeof name === 'string' && name.trim()) return name.trim();
                }
              }

              // 3. Rekursif mencari key yang mengandung kata kunci
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (val && typeof val === 'object') {
                  const res = findSupplier(val);
                  if (res) return res;
                } else if (typeof val === 'string' && /company|merchant|vendor|supplier/i.test(key) && !/address|phone|email|id/i.test(key)) {
                  if (val.trim() && val.length < 100) return val.trim();
                }
              }
              return '';
            };

            const supplierName = findSupplier(d);
            text = supplierName ? `Pembelian di ${supplierName}` : (d.description || 'Nota Baru');

            const transactionDate = d.date || (d.transaction && d.transaction.date) || d.transaction_date;
            if (transactionDate) {
              text += ` (Tanggal Nota: ${transactionDate})`;
            }

            const paymentMethod = d.payment_method || (d.transaction && d.transaction.payment_method);
            if (paymentMethod) {
              text += ` (Metode Pembayaran: ${paymentMethod})`;
            }
            const dueDate = d.due_date || (d.transaction && d.transaction.due_date);
            if (dueDate) {
              text += ` (Jatuh Tempo: ${dueDate})`;
            }

            let hasInlineDiscount = false;
            let sumItemSubtotals = 0;
            if (d.items && d.items.length > 0) {
              // Cek dulu apakah ada diskon per-item
              d.items.forEach((item: any) => {
                const discProd = parseFloat(item.discount_product) || 0;
                const discCust = parseFloat(item.discount_customer) || 0;
                if (discProd > 0 || discCust > 0) {
                  hasInlineDiscount = true;
                  return;
                }
                for (const key of Object.keys(item)) {
                  if (/discount|diskon|potongan|disc/i.test(key)) {
                    const val = parseFloat(item[key]);
                    if (!isNaN(val) && val > 0) { hasInlineDiscount = true; break; }
                  }
                }
                const itQty = parseFloat(item.quantity || item.qty || 1);
                const itPrice = parseFloat(item.unit_price || item.price || 0);
                const itSub = parseFloat(item.subtotal || item.total || item.neto || 0);
                if (itQty > 0 && itPrice > 0 && itSub > 0 && (itQty * itPrice) > itSub && (itQty * itPrice - itSub) >= 1) {
                  hasInlineDiscount = true;
                }
              });

              // Jika TIDAK ada diskon per-item, sertakan diskon nota global jika ada (Anti Double-Counting)
              const globalDiscount = d.summary?.discount_total || d.summary?.global_discount_amount || d.discount_total || 0;
              if (!hasInlineDiscount && globalDiscount > 0) {
                text += ` (Diskon Nota: ${globalDiscount})`;
              }

              text += ` :\n`;
              d.items.forEach((item: any) => {
                const name = item.product_name || item.name || item.nama_barang || item.item || item.description || 'Item';
                const qty = item.quantity || item.qty || item.amount || 0;
                const unit = item.unit || item.satuan || item.unit_of_measure || 'pcs';
                
                // Ambil subtotal / neto
                const subtotal = item.subtotal || item.total || item.jumlah || item.neto || 0;

                let discount = 0;
                // Dukung kolom spesifik distributor: discount_product + discount_customer
                const discProd = parseFloat(item.discount_product) || 0;
                const discCust = parseFloat(item.discount_customer) || 0;
                if (discProd > 0 || discCust > 0) {
                  discount = discProd + discCust;
                } else if (item.discount_amount !== undefined && item.discount_amount !== null) {
                  discount = parseFloat(item.discount_amount) || 0;
                } else if (item.discount_value !== undefined && item.discount_value !== null) {
                  discount = parseFloat(item.discount_value) || 0;
                } else if (item.discount !== undefined && item.discount !== null) {
                  discount = parseFloat(item.discount) || 0;
                } else if (item.potongan !== undefined && item.potongan !== null) {
                  discount = parseFloat(item.potongan) || 0;
                }

                let price = item.unit_price || item.price || item.harga_satuan || item.rate || 0;
                
                // Self-Healing: Jika diskon 0 namun (qty * price) > subtotal, selisihnya adalah diskon tersirat
                if (discount === 0 && price > 0 && subtotal > 0 && qty > 0 && (qty * price) > subtotal) {
                  const impliedDisc = (qty * price) - subtotal;
                  if (impliedDisc >= 1.0) {
                    discount = Math.round(impliedDisc * 100) / 100;
                  }
                }

                if (discount > 0 && subtotal > 0 && qty > 0) {
                  // Standar Asli: Jika ada diskon, @ harga ditulis harga kotor agar (qty * price - diskon) = subtotal
                  price = Math.round(((subtotal + discount) / qty) * 100) / 100;
                } else if ((!price || price === 0) && subtotal > 0 && qty > 0) {
                  price = Math.round((subtotal / qty) * 100) / 100;
                }

                if (subtotal > 0) {
                  sumItemSubtotals += subtotal;
                }

                const qtyStr = qty ? `${qty} ${unit} @ ` : '';
                const discStr = discount > 0 ? ` diskon ${discount}` : '';
                text += `• ${name} ${qtyStr}${price}${discStr}\n`;
              });
            } else {
              const globalDiscount = d.summary?.discount_total || d.summary?.global_discount_amount || d.discount_total || 0;
              if (globalDiscount > 0) {
                text += ` (Diskon Nota: ${globalDiscount})`;
              }
              text += `\n`;
            }

            let total = d.total_amount || d.total || d.total_amount_idr || d.summary?.total_amount || d.summary?.total_amount_idr || d.summary?.total || d.summary?.grand_total || 0;
            // Rekonsiliasi typo OCR dot-matrix (misal 204158 vs 204153 hasil sum item)
            if (sumItemSubtotals > 0 && (!total || Math.abs(total - sumItemSubtotals) <= 10)) {
              total = sumItemSubtotals;
            }
            if (total) {
              text += (d.items && d.items.length > 0) ? `Total: ${total}` : `Total Belanja: ${total}`;
            }
          } else if (task.raw_ocr_text) {
            text = `Pembelian ${task.raw_ocr_text}`;
          } else {
            text = 'Nota Baru';
          }

          setNoteText(text);
          const isDup = Boolean(task.is_duplicate || (task.extracted_data && task.extracted_data.is_duplicate));
          const hasCorrection = Boolean(task.corrected_data);
          const autoCorrected = d?._auto_corrected_entities;

          if (isDup) {
            toast.warning('⚠️ DUPLIKASI NOTA TERDETEKSI', {
              description: task.duplicate_warning || (task.extracted_data && task.extracted_data.duplicate_warning) || `Transaksi serupa untuk berkas '${task.file_name}' sudah pernah tercatat sebelumnya.`,
              duration: 8000
            });
          } else if (hasCorrection) {
            toast.success('✨ Koreksi Tersimpan Dimuat', {
              description: `Item nota '${task.file_name}' berhasil disesuaikan dengan hasil editan Anda sebelumnya.`,
              duration: 6000
            });
          } else if (autoCorrected && autoCorrected.length > 0) {
            toast.success('🎯 Normalisasi Semantik AI Aktif', {
              description: `${autoCorrected.length} nama supplier/barang otomatis disesuaikan dari riwayat koreksi Anda.`,
              duration: 6000
            });
          } else {
            toast.success('AI Vision Berhasil', { description: 'Data struk telah diproses oleh AI Server.' });
          }

          // Parse menggunakan Ollama (jika aktif) atau backend smart parser
          setTimeout(() => onParse(text, isDup ? {
            is_duplicate: true,
            duplicate_task_id: task.id,
            duplicate_warning: task.duplicate_warning || `File '${task.file_name}' terdeteksi 100% duplikat di database.`
          } : undefined), 500);
        } else if (task.status === 'failed') {
          stopPolling();
          setIsUploading(false);
          toast.error('OCR Gagal', { description: task.error_message || 'Gagal mengekstrak data struk.' });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return; // task belum ready
        console.error('[useOcrUpload] Polling error:', err);
      }
    }, 2000);
  }, [setNoteText, onParse, stopPolling]);

  // Helper untuk memproses task yang sudah selesai (baik instant maupun via polling)
  const handleCompletedTask = useCallback((task: any) => {
    setIsUploading(false);
    setCurrentOcrTaskId(task.id);

    let text = '';
    const d = task.extracted_data || task.corrected_data;
    if (d) {
      const supplierName = d.merchant || d.merchant_name || d.supplier_name || d.vendor_name || d.toko || d.supplier || d.contact_name || '';
      if (supplierName) text += `${supplierName}\n`;
      const invNo = d.invoice_number || d.no_nota || d.no_invoice || d.invoice_no || '';
      if (invNo) text += `No Nota: ${invNo}\n`;
      const dateVal = d.date || d.tanggal || d.transaction_date || '';
      if (dateVal) text += `Tanggal: ${dateVal}\n`;

      if (d.items && Array.isArray(d.items) && d.items.length > 0) {
        let hasInlineDiscount = false;
        d.items.forEach((item: any) => {
          if ((item.discount_amount && parseFloat(item.discount_amount) > 0) || 
              (item.discount_value && parseFloat(item.discount_value) > 0) || 
              (item.discount && parseFloat(item.discount) > 0)) {
            hasInlineDiscount = true;
          }
        });

        const globalDiscount = d.summary?.discount_total || d.summary?.global_discount_amount || d.discount_total || 0;
        if (!hasInlineDiscount && globalDiscount > 0) {
          text += ` (Diskon Nota: ${globalDiscount})`;
        }

        text += ` :\n`;
        d.items.forEach((item: any) => {
          const name = item.product_name || item.name || item.nama_barang || item.item || item.description || 'Item';
          const qty = item.quantity || item.qty || item.amount || 0;
          const unit = item.unit || item.satuan || item.unit_of_measure || 'pcs';
          const subtotal = item.subtotal || item.total || item.jumlah || item.neto || 0;

          let price = item.unit_price || item.price || item.harga_satuan || item.rate || 0;
          if ((!price || price === 0) && subtotal > 0 && qty > 0) {
            price = subtotal / qty;
          }

          let discount = 0;
          if (item.discount_amount !== undefined && item.discount_amount !== null) {
            discount = parseFloat(item.discount_amount) || 0;
          } else if (item.discount_value !== undefined && item.discount_value !== null) {
            discount = parseFloat(item.discount_value) || 0;
          } else if (item.discount !== undefined && item.discount !== null) {
            discount = parseFloat(item.discount) || 0;
          }

          const qtyStr = qty ? `${qty} ${unit} @ ` : '';
          const discStr = discount > 0 ? ` diskon ${discount}` : '';
          text += `• ${name} ${qtyStr}${price}${discStr}\n`;
        });
      } else {
        const globalDiscount = d.summary?.discount_total || d.summary?.global_discount_amount || d.discount_total || 0;
        if (globalDiscount > 0) {
          text += ` (Diskon Nota: ${globalDiscount})`;
        }
        text += `\n`;
      }

      const total = d.total_amount || d.total || d.total_amount_idr || d.summary?.total_amount || d.summary?.total_amount_idr || d.summary?.total || d.summary?.grand_total || 0;
      if (total) {
        text += (d.items && d.items.length > 0) ? `Total: ${total}` : `Total Belanja: ${total}`;
      }
    } else if (task.raw_ocr_text) {
      text = `Pembelian ${task.raw_ocr_text}`;
    } else {
      text = 'Nota Baru';
    }

    setNoteText(text);
    const isDup = Boolean(task.is_duplicate || (task.extracted_data && task.extracted_data.is_duplicate));
    if (isDup) {
      toast.warning('⚠️ DUPLIKASI NOTA TERDETEKSI', {
        description: task.duplicate_warning || (task.extracted_data && task.extracted_data.duplicate_warning) || `Transaksi serupa untuk berkas '${task.file_name}' sudah pernah tercatat sebelumnya.`,
        duration: 8000
      });
    } else {
      toast.success('AI Vision Berhasil', { description: 'Data struk telah diproses oleh AI Server.' });
    }

    setOcrSource('llm');
    setTimeout(() => onParse(text, isDup ? {
      is_duplicate: true,
      duplicate_task_id: task.id,
      duplicate_warning: task.duplicate_warning || `File '${task.file_name}' terdeteksi 100% duplikat di database.`
    } : undefined), 500);
  }, [setNoteText, onParse]);

  // ── Upload langsung ke AI Vision Server ──────────────────────────────────
  const uploadFileDirectly = useCallback(async (file: File) => {
    setIsUploading(true);
    setOcrSource(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await fetchClient('/ocr/upload', { method: 'POST', body: formData });
      
      // Jika status task sudah completed/corrected (misal duplikat nota lama yang langsung dikembalikan)
      if (result.status === 'completed' || result.status === 'corrected') {
        handleCompletedTask(result);
        return;
      }

      pollOCRStatus(result.id);
    } catch (error: any) {
      setIsUploading(false);
      toast.error('Gagal mengunggah gambar', { description: error.message });
    }
  }, [pollOCRStatus, handleCompletedTask]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFileDirectly(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadFileDirectly]);

  return {
    isUploading,
    ocrSource,
    currentOcrTaskId,
    fileInputRef,
    handleFileUpload,
    uploadFileDirectly,
    resetOcr,
  };
}

/**
 * Legacy no-op helper untuk kompatibilitas preload OCR model
 */
export function preloadOcrModel() {
  // No-op: OCR ditangani oleh AI Vision Server (MCP/Gemini)
}

