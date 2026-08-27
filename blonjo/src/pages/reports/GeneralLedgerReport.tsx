import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import apiClient, { fetchClient } from '../../api/client';
import { A4Paper } from '../../components/A4Paper';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

export default function GeneralLedgerReport() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Date Filters
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const formatDateISO = (d: Date) => d.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(formatDateISO(firstDay));
  const [endDate, setEndDate] = useState(formatDateISO(today));

  // Load COA
  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const data = await fetchClient('/finance/accounts');
        setAccounts(data);
        if (data.length > 0) {
          // Default to first account (usually Cash/Kas)
          setSelectedAccountId(data[0].id.toString());
        }
      } catch (err: any) {
        toast.error(t('toast_err_load_accounts', { error: err.message || err }));
      } finally {
        setLoadingAccounts(false);
      }
    };
    loadAccounts();
  }, []);

  // Fetch Ledger PDF
  const fetchLedgerPdf = async () => {
    if (!selectedAccountId) return;
    try {
      setLoadingPdf(true);
      const currentLang = i18n.language || 'id';
      const response = await apiClient.get(
        `/reports/general-ledger/pdf?account_id=${selectedAccountId}&start_date=${startDate}&end_date=${endDate}&lang=${currentLang}`, 
        { responseType: 'blob' }
      );
      
      const url = URL.createObjectURL(response as any);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
    } catch (error: any) {
      console.error('Failed to generate GL PDF', error);
      toast.error(t('toast_err_load_ledger', { error: error.message || error }) || "Gagal memuat pratinjau buku besar");
    } finally {
      setLoadingPdf(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) {
      fetchLedgerPdf();
    }
  }, [selectedAccountId, i18n.language]); // Trigger on account selection & language changes

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, []);

  return (
    <div className="w-full max-w-none px-2 md:px-4 lg:px-6 py-6 space-y-6 mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')} className="h-9 w-9 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t('menu_general_ledger')}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              {t('reports_hub_gl_desc')}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border border-border shadow-sm print:hidden">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('filter_select_account') || 'Pilih Akun'}
          </label>
          {loadingAccounts ? (
            <div className="h-9 w-60 bg-muted animate-pulse rounded-md" />
          ) : (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="flex h-9 w-60 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {t(acc.name)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filter_from_date') || 'Dari Tanggal'}</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filter_to_date') || 'Sampai Tanggal'}</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-40" />
        </div>
        <Button onClick={fetchLedgerPdf} disabled={loadingPdf} size="sm" className="h-9 font-bold px-6">
          {loadingPdf ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
          {t('btn_filter_show') || 'Tampilkan'}
        </Button>
      </div>

      {/* PDF View Canvas */}
      {loadingPdf && !pdfUrl ? (
        <div className="flex flex-col justify-center items-center h-96 space-y-4">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-zinc-500 font-medium">Menyusun Laporan Buku Besar PDF...</p>
        </div>
      ) : pdfUrl ? (
        <A4Paper title={t('menu_general_ledger')} pdfUrl={pdfUrl} onRefresh={fetchLedgerPdf} />
      ) : (
        <div className="flex justify-center items-center h-64 text-zinc-400 font-medium border border-dashed rounded-xl">
          Silakan pilih akun untuk melihat pratinjau Buku Besar.
        </div>
      )}
    </div>
  );
}
