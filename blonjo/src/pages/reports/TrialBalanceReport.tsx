import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import { A4Paper } from '../../components/A4Paper';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function TrialBalanceReport() {
  const { t, i18n } = useTranslation();
  
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const formatDateISO = (d: Date) => d.toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(formatDateISO(firstDay));
  const [endDate, setEndDate] = useState(formatDateISO(today));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReportPdf = async () => {
    try {
      setLoading(true);
      const currentLang = i18n.language || 'id';
      const response = await apiClient.get(`/reports/trial-balance/pdf?start_date=${startDate}&end_date=${endDate}&lang=${currentLang}`, {
        responseType: 'blob'
      });
      
      const url = URL.createObjectURL(response as any);
      
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
    } catch (error) {
      console.error('Failed to generate PDF', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportPdf();
  }, [i18n.language]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, []);

  return (
    <div className="w-full">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border border-border mb-6 shadow-sm print:hidden">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filter_from_date') || 'Dari Tanggal'}</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filter_to_date') || 'Sampai Tanggal'}</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-40" />
        </div>
        <Button onClick={fetchReportPdf} disabled={loading} size="sm" className="h-9 font-bold px-6">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
          {t('btn_show') || 'Tampilkan'}
        </Button>
      </div>

      {loading && !pdfUrl ? (
        <div className="flex flex-col justify-center items-center h-96 space-y-4">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-zinc-500 font-medium">{t('loading_pdf') || 'Menyusun Laporan PDF...'}</p>
        </div>
      ) : pdfUrl ? (
        <A4Paper title={t('menu_trial_balance') || 'Neraca Percobaan'} pdfUrl={pdfUrl} onRefresh={fetchReportPdf} />
      ) : (
        <div className="flex justify-center items-center h-64 text-zinc-400 font-medium">
          {t('fail_load_pdf') || 'Gagal memuat pratinjau laporan.'}
        </div>
      )}
    </div>
  );
}
