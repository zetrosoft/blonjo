import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchClient } from '../../../api/client';
import type { Account, JournalEntry } from '../types';
import type { ParsedTransaction } from '../../../lib/smartParser';
import { formatRp } from '../../../lib/utils';

/**
 * useSmartConfirm — Kalkulasi journal entry otomatis dan submit transaksi Smart Note.
 *
 * Menerima accounts + parsedResult sebagai input,
 * mengelola state dialog konfirmasi dan journal entries.
 */
export function useSmartConfirm(
  accounts: Account[],
  parsedResult: ParsedTransaction | null,
  onSuccess: () => void,   // callback reset setelah berhasil submit
) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Helper cari akun berdasarkan keyword ─────────────────────────
  const findAccount = useCallback((keywords: string[]): string => {
    const found = accounts.find(a =>
      keywords.some(k => a.name.toLowerCase().includes(k))
    );
    return found ? found.id.toString() : '';
  }, [accounts]);

  // ── Hitung jurnal otomatis berdasarkan tipe transaksi ────────────
  const buildDefaultEntries = useCallback((
    txType: string,
    amount: number,
    paymentMethod?: string,
    description?: string,
  ): JournalEntry[] => {
    const isTempo = paymentMethod && ['tempo', 'hutang', 'utang', 'kredit'].some(kw => paymentMethod.toLowerCase().includes(kw));
    const descLower = (description || '').toLowerCase();
    const isCapitalWithdrawal = txType === 'capital' && ['tarik', 'pengembalian', 'penarikan', 'prive', 'withdraw', 'ambil'].some(kw => descLower.includes(kw));
    
    // Default credit for purchase is cash/bank, but if tempo it's hutang
    const purchaseCredit = isTempo ? ['hutang', 'utang'] : ['kas', 'bank'];
    // Default debit for sales is cash/bank, but if tempo it's piutang
    const salesDebit = isTempo ? ['piutang'] : ['kas', 'bank'];

    const capitalDebit = isCapitalWithdrawal ? ['modal pemilik', 'modal'] : ['kas', 'bank'];
    const capitalCredit = isCapitalWithdrawal ? ['kas', 'bank'] : ['modal'];

    const keyMap: Record<string, [string[], string[]]> = {
      purchase:   [['persediaan', 'beli', 'biaya'], purchaseCredit],
      income:     [['kas', 'bank'],                  ['pendapatan', 'jual']],
      operational:[['beban', 'biaya', 'operasional'], ['kas', 'bank']],
      capital:    [['kas', 'bank'],                  ['modal']],
      capital_withdrawal: [['modal', 'prive'],         ['kas', 'bank']],
      capital_reclassification: [['modal'],            ['titipan', 'simpanan', 'hutang']],
      customer_deposit:    [['kas', 'bank'],         ['tabungan', 'paket', 'hutang']],
      customer_withdrawal: [['tabungan', 'paket', 'hutang'], ['kas', 'bank']],
      non_cash_out:[['bank'],                         ['kas']],
      non_cash_in: [['kas'],                          ['bank']],
      sales:      [salesDebit,                       ['pendapatan', 'jual']],
      purchase_return: [['kas', 'bank', 'hutang'],   ['persediaan']],
      sales_return:    [['pendapatan', 'retur'],     ['kas', 'bank', 'piutang']],
      expense:    [['beban', 'biaya'],               ['kas', 'bank']],
      cash_count: [['kas', 'utama'],                 ['pendapatan', 'lain', 'beban', 'operasional']],
    };
    
    const [debitKws, creditKws] = keyMap[txType] ?? [[], []];
    return [
      { account_id: findAccount(debitKws),  debit: amount, credit: 0 },
      { account_id: findAccount(creditKws), debit: 0,      credit: amount },
    ];
  }, [findAccount]);

  // ── Buka dialog — inject suggested_entries jika ada ─────────────
  const open = useCallback(() => {
    if (!parsedResult) return;
    const amount = parsedResult.total_amount;

    if (parsedResult.suggested_entries?.length) {
      // Skala ulang hanya jika pengguna secara manual mengedit total_amount di form.
      // Catatan Arsitektur:
      // Backend /finance/transactions/parse sudah menghitung suggested_entries secara presisi.
      // Pada transaksi SALES dengan jurnal perpetual, terdapat 2 pasang jurnal independen:
      // (1) Kas/Bank vs Pendapatan Penjualan = nilai penjualan (amount)
      // (2) HPP vs Persediaan = estimasi beban pokok
      // Oleh karena itu, amount tidak boleh dibagi dengan totalDebit gabungan (Kas + HPP).
      const isSales = parsedResult.transaction_type === 'sales';
      let baseTotal = 0;

      if (isSales) {
        // Cari baris penjualan/omzet primer (kredit pada pendapatan, atau debet kas/bank selain HPP/Persediaan)
        const revenueEntry = parsedResult.suggested_entries.find((e: any) =>
          (e.account?.code?.startsWith('4-') || e.account?.account_type === 'revenue') && Number(e.credit || 0) > 0
        );
        if (revenueEntry) {
          baseTotal = Number(revenueEntry.credit);
        } else {
          const cashEntry = parsedResult.suggested_entries.find((e: any) =>
            !e.account?.code?.startsWith('5-') && !e.account?.code?.startsWith('1-13') && Number(e.debit || 0) > 0
          );
          baseTotal = cashEntry ? Number(cashEntry.debit) : 0;
        }
      }

      // Fallback untuk non-sales atau jika deteksi sales tidak menemukan entri primer
      if (baseTotal <= 0) {
        const totalDebit = parsedResult.suggested_entries.reduce((sum: number, e: any) => sum + Number(e.debit || 0), 0);
        const totalCredit = parsedResult.suggested_entries.reduce((sum: number, e: any) => sum + Number(e.credit || 0), 0);
        baseTotal = Math.max(totalDebit, totalCredit);
      }

      const ratio = (baseTotal > 0 && Math.abs(amount - baseTotal) > 0.01) ? amount / baseTotal : 1;

      const mapped = parsedResult.suggested_entries.map((e: any) => ({
        account_id: e.account_id.toString(),
        debit:  ratio === 1 ? Math.round(Number(e.debit || 0)) : Math.round(Number(e.debit || 0) * ratio),
        credit: ratio === 1 ? Math.round(Number(e.credit || 0)) : Math.round(Number(e.credit || 0) * ratio),
        account: e.account,
      }));

      // Self-balancing: pastikan selisih pembulatan desimal otomatis diseimbangkan
      const sumD = mapped.reduce((s: number, e: any) => s + e.debit, 0);
      const sumC = mapped.reduce((s: number, e: any) => s + e.credit, 0);
      const diff = sumD - sumC;

      if (diff !== 0 && mapped.length > 0) {
        if (diff > 0) {
          // Debit > Kredit: selaraskan ke baris kredit terbesar
          const maxCreditIdx = mapped.reduce((maxI: number, e: any, i: number, arr: any[]) => e.credit > arr[maxI].credit ? i : maxI, 0);
          if (mapped[maxCreditIdx].credit > 0) {
            mapped[maxCreditIdx].credit += diff;
          }
        } else {
          // Kredit > Debit: selaraskan ke baris debit terbesar
          const maxDebitIdx = mapped.reduce((maxI: number, e: any, i: number, arr: any[]) => e.debit > arr[maxI].debit ? i : maxI, 0);
          if (mapped[maxDebitIdx].debit > 0) {
            mapped[maxDebitIdx].debit += Math.abs(diff);
          }
        }
      }

      setEntries(mapped);
    } else {
      setEntries(buildDefaultEntries(parsedResult.transaction_type, amount, parsedResult.payment_method, parsedResult.description || parsedResult.raw_text));
    }

    setIsOpen(true);
  }, [parsedResult, buildDefaultEntries]);

  const updateEntry = useCallback((index: number, field: keyof JournalEntry, value: any) => {
    setEntries(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  // ── Submit ke server ─────────────────────────────────────────────
  const submit = useCallback(async (
    status: 'draft' | 'posted',
    ocrTaskId: number | null,
  ) => {
    if (!parsedResult) return;

    const totalD = entries.reduce((s, e) => s + Number(e.debit  || 0), 0);
    const totalC = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    if (totalD !== totalC || totalD <= 0) {
      toast.error('Gagal', { description: 'Total Debit dan Kredit harus seimbang!' });
      return;
    }

    setSaving(true);
    try {
      await fetchClient('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transaction_date: parsedResult.transaction_date,
          description:      parsedResult.description,
          transaction_type: parsedResult.transaction_type,
          total_amount:     parsedResult.total_amount,
          payment_method:   parsedResult.payment_method || null,
          due_date:         parsedResult.due_date ? parsedResult.due_date : null,
          status,
          entries: entries.map(e => ({
            account_id: parseInt(String(e.account_id), 10),
            debit:  Number(e.debit || 0),
            credit: Number(e.credit || 0),
          })),
          items: (parsedResult.items || []).map(i => ({
            ...i,
            ocr_name: i.ocr_name || i.name,
            contact_name: parsedResult.contact_name || null,
          })),
        }),
      });

      // Kirim feedback koreksi OCR jika transaksi berasal dari scan struk
      if (ocrTaskId) {
        fetchClient(`/ocr/tasks/${ocrTaskId}/correct`, {
          method: 'POST',
          body: JSON.stringify({
            transaction_date: parsedResult.transaction_date,
            reference_no:     '',
            description:      parsedResult.description,
            total_amount:     parsedResult.total_amount,
            transaction_type: parsedResult.transaction_type,
            items: parsedResult.items.map(i => ({
              name: i.name, ocr_name: i.ocr_name || i.name, qty: i.qty, price: i.unit_price,
              total: i.total, contact_name: parsedResult.contact_name,
            })),
          }),
        }).catch(err => console.error('[useSmartConfirm] OCR feedback failed:', err));
      }

      toast.success('Transaksi berhasil disimpan', {
        description: `${parsedResult.type_label} — ${formatRp(parsedResult.total_amount)} (${status})`,
      });
      setIsOpen(false);
      onSuccess();
    } catch (error: any) {
      if (error.status === 409 || (error.message && error.message.includes('DUPLICATE_TRANSACTION'))) {
        toast.warning('⚠️ DUPLIKASI TRANSAKSI', {
          description: 'Transaksi serupa (Supplier, Tanggal, Nominal) sudah pernah dicatat sebelumnya.',
          duration: 6000
        });
      } else {
        toast.error('Gagal menyimpan transaksi', { description: error.message });
      }
    } finally {
      setSaving(false);
    }
  }, [parsedResult, entries, onSuccess]);

  return {
    isOpen,
    setIsOpen,
    entries,
    saving,
    open,
    updateEntry,
    submit,
  };
}
