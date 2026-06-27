import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchClient } from '../../../api/client';
import type { JournalEntry } from '../types';

const EMPTY_ENTRIES: JournalEntry[] = [
  { account_id: '', debit: 0, credit: 0 },
  { account_id: '', debit: 0, credit: 0 },
];

/**
 * useManualEntry — Semua state dan handler untuk mode Manual Entry.
 * Tidak bergantung pada state Smart Note sama sekali.
 */
export function useManualEntry() {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate]               = useState(today);
  const [refNo, setRefNo]             = useState('');
  const [description, setDescription] = useState('');
  const [type, setType]               = useState('manual');
  const [entries, setEntries]         = useState<JournalEntry[]>(EMPTY_ENTRIES);
  const [saving, setSaving]           = useState(false);

  const totalDebit  = useMemo(() => entries.reduce((s, e) => s + (Number(e.debit)  || 0), 0), [entries]);
  const totalCredit = useMemo(() => entries.reduce((s, e) => s + (Number(e.credit) || 0), 0), [entries]);
  const isBalanced  = totalDebit === totalCredit && totalDebit > 0;

  const handleSubmit = useCallback(async () => {
    if (!isBalanced) return;
    setSaving(true);
    try {
      await fetchClient('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transaction_date: date,
          reference_no:     refNo || undefined,
          description,
          transaction_type: type,
          status:           'draft',
          total_amount:     totalDebit,
          entries: entries.map(e => ({
            account_id: parseInt(e.account_id),
            debit:  Number(e.debit),
            credit: Number(e.credit),
          })),
        }),
      });
      toast.success('Jurnal berhasil disimpan (Draft)');
      // Reset hanya field isian — date & type tetap untuk memudahkan input batch
      setDescription('');
      setRefNo('');
      setEntries(EMPTY_ENTRIES);
    } catch (error: any) {
      toast.error(error.message || 'Gagal menyimpan jurnal');
    } finally {
      setSaving(false);
    }
  }, [isBalanced, date, refNo, description, type, totalDebit, entries]);

  return {
    date,       setDate,
    refNo,      setRefNo,
    description, setDescription,
    type,       setType,
    entries,    setEntries,
    saving,
    totalDebit,
    totalCredit,
    isBalanced,
    handleSubmit,
  };
}
