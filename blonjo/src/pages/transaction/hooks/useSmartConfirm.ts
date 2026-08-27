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
      // Skala ulang dari AI jika jumlah berbeda dengan nominal user
      const anchor = parsedResult.suggested_entries.find((e: any) =>
        (e.debit > 0 && e.credit === 0) || (e.credit > 0 && e.debit === 0)
      );
      const anchorVal = anchor ? Math.max(Number(anchor.debit), Number(anchor.credit)) : 0;
      const ratio = anchorVal > 0 ? amount / anchorVal : 1;

      setEntries(parsedResult.suggested_entries.map((e: any) => ({
        account_id: e.account_id.toString(),
        debit:  Math.round(Number(e.debit)  * ratio),
        credit: Math.round(Number(e.credit) * ratio),
        account: e.account,
      })));
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
