import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { 
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, 
  AlertTriangle, CheckCircle, RefreshCw, Landmark, Wallet, Calendar,
  ArrowRight, Loader2
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp, formatNumber } from '../../lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';


interface ProjectionItem {
  date: string;
  starting_cash: number;
  outflow_amount: number;
  outflow_details: string;
  inflow_amount: number;
  ending_cash: number;
  status: 'AMAN' | 'WARNING';
  accuracy_inflow_pct?: number;
  accuracy_outflow_pct?: number;
}

export default function BudgetingPage() {
  const { t } = useTranslation();
  const [projections, setProjections] = useState<ProjectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOutflow, setSelectedOutflow] = useState<{
    date: string;
    amount: number;
    details: string;
  } | null>(null);

  const [todayTransactions, setTodayTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  })();

  useEffect(() => {
    if (selectedOutflow && selectedOutflow.date <= todayStr) {
      const fetchDateTx = async () => {
        setLoadingTransactions(true);
        try {
          const targetDate = selectedOutflow.date;
          const res = await fetchClient(`/finance/transactions?start_date=${targetDate}&end_date=${targetDate}`);
          if (Array.isArray(res)) {
            // Saring hanya pengeluaran kas aktual (purchase atau expense) yang bukan Tempo (kredit)
            const outflows = res.filter((t: any) => {
              const isOutflow = t.transaction_type === 'purchase' || t.transaction_type === 'expense';
              const isTempo = t.payment_method?.toLowerCase() === 'tempo';
              return isOutflow && !isTempo;
            });
            setTodayTransactions(outflows);
          }
        } catch (err) {
          console.error('Failed to fetch transactions for selected date:', err);
        } finally {
          setLoadingTransactions(false);
        }
      };
      fetchDateTx();
    } else {
      setTodayTransactions([]);
    }
  }, [selectedOutflow, todayStr]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/material-control/cashflow-projection');
      if (Array.isArray(data)) {
        setProjections(data);
      }
    } catch (err) {
      console.error('Failed to load cashflow projections:', err);
      toast.error(t('mc_budget_load_failed'));
      setProjections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const futureProjections = projections.filter(p => p.date >= todayStr);
  const warningDays = futureProjections.filter(p => p.status === 'WARNING').length;
  const navigate = useNavigate();

  return (
    <div className="space-y-6 p-6 pb-24">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{t('mc_budget_title')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('mc_budget_desc')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button 
            onClick={() => navigate('/material-control/projection-accuracy')} 
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
          >
            <Landmark className="h-4 w-4" /> {t('menu_projection_accuracy')}
          </Button>
          <Button onClick={loadData} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> {t('mc_btn_refresh')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">{t('mc_budget_liquidity_status')}</CardDescription>
            <CardTitle className="text-2xl mt-1 font-extrabold flex items-center gap-2">
              {warningDays > 0 ? (
                <>
                  <AlertTriangle className="h-6 w-6 text-amber-500 animate-bounce" />
                  <span className="text-amber-500">{t('mc_budget_critical_days', { count: warningDays })}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                  <span className="text-emerald-500">{t('mc_budget_cash_safe')}</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {warningDays > 0 
                ? t('mc_budget_warning_msg') 
                : t('mc_budget_safe_msg')}
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">{t('mc_budget_lowest_cash')}</CardDescription>
            <CardTitle className="text-2xl mt-1 font-extrabold font-mono text-zinc-950 dark:text-zinc-50">
              {futureProjections.length > 0 
                ? formatRp(Math.min(...futureProjections.map(p => Number(p.ending_cash)))) 
                : formatRp(0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t('mc_budget_lowest_cash_desc')}
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">{t('mc_budget_total_planned_outflow')}</CardDescription>
            <CardTitle className="text-2xl mt-1 font-extrabold font-mono text-zinc-950 dark:text-zinc-50">
              {futureProjections.length > 0 
                ? formatRp(futureProjections.reduce((sum, p) => sum + Number(p.outflow_amount), 0)) 
                : formatRp(0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t('mc_budget_total_planned_outflow_desc')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projection Table */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('mc_budget_table_title')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 border-t">
          <div className="relative w-full overflow-auto">
            <TooltipProvider delayDuration={100}>
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[120px] whitespace-nowrap pl-4">{t('mc_col_date')}</TableHead>
                    <TableHead className="text-right">{t('mc_budget_col_starting_cash')}</TableHead>
                    <TableHead className="text-right text-emerald-600 dark:text-emerald-400">{t('mc_budget_col_inflow')}</TableHead>
                    <TableHead className="text-right text-rose-600 dark:text-rose-400">{t('mc_budget_col_outflow')}</TableHead>
                    <TableHead>{t('mc_budget_col_outflow_desc')}</TableHead>
                    <TableHead className="text-right pr-4">{t('mc_budget_col_ending_cash')}</TableHead>
                    <TableHead className="text-center w-[100px]">{t('mc_col_status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projections.map((p, idx) => {
                    const [year, month, day] = p.date.split('-').map(Number);
                    const dateObj = new Date(year, month - 1, day);
                    const isSunday = dateObj.getDay() === 0;
                    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                    const dayName = daysIndo[dateObj.getDay()];

                    // Determine if this row is past, today, or future
                    const now = new Date();
                    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                    const isPast = p.date < todayStr;
                    const isToday = p.date === todayStr;
                    const isFuture = p.date > todayStr;

                    let rowClass = '';
                    if (isToday) {
                      rowClass = 'bg-indigo-50/60 dark:bg-indigo-950/30 border-l-3 border-l-indigo-500 ring-1 ring-indigo-200/50 dark:ring-indigo-800/50';
                    } else if (isPast) {
                      rowClass = 'bg-zinc-50/40 dark:bg-zinc-900/30 opacity-80';
                    } else if (isSunday) {
                      rowClass = 'bg-rose-50/50 dark:bg-rose-950/25 border-l-2 border-l-rose-500';
                    } else if (p.status === 'WARNING') {
                      rowClass = 'bg-amber-50/30 dark:bg-amber-950/10';
                    }

                    return (
                      <TableRow 
                        key={idx}
                        className={rowClass}
                      >
                        <TableCell className="font-medium text-xs py-3 whitespace-nowrap pl-4">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 rounded">
                                <Calendar className={`w-3.5 h-3.5 shrink-0 ${isToday ? 'text-indigo-500' : isSunday ? 'text-rose-500 dark:text-rose-400' : isPast ? 'text-zinc-400' : 'text-muted-foreground'}`} />
                                <span className={
                                  isToday ? 'text-indigo-600 dark:text-indigo-400 font-bold' 
                                  : isSunday ? 'text-rose-600 dark:text-rose-400 font-bold' 
                                  : isPast ? 'text-zinc-500 dark:text-zinc-400' 
                                  : ''
                                }>
                                  {p.date}
                                </span>
                                {isToday && (
                                  <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border-none text-[9px] px-1.5 py-0 font-bold animate-pulse">
                                    Hari Ini
                                  </Badge>
                                )}
                                {isPast && (
                                  <Badge className="bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 border-none text-[9px] px-1.5 py-0 font-medium">
                                    Aktual
                                  </Badge>
                                )}
                                {isSunday && !isToday && !isPast && (
                                  <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border-none text-[9px] px-1.5 py-0 font-bold">
                                    Minggu
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 text-white border-zinc-800 text-xs px-2.5 py-1.5 shadow-md rounded-md">
                              Hari: <span className="font-bold">{dayName}</span>
                              {isPast && ' (Data Aktual)'}
                              {isToday && ' (Hari Ini)'}
                              {isFuture && ' (Proyeksi)'}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono py-3">{formatNumber(p.starting_cash)}</TableCell>
                        <TableCell className={`text-right text-xs font-mono py-3 ${isPast ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          <div>{formatNumber(p.inflow_amount)}</div>
                          {isPast && p.accuracy_inflow_pct !== undefined && p.accuracy_inflow_pct !== null && (
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans font-normal mt-0.5">
                              acc: {p.accuracy_inflow_pct}%
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono p-0">
                          <div 
                            className="px-4 py-3 cursor-pointer text-rose-600 dark:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 hover:text-rose-700 dark:hover:text-rose-300 font-bold transition-all text-right"
                            onClick={() => setSelectedOutflow({
                              date: p.date,
                              amount: p.outflow_amount,
                              details: p.outflow_details
                            })}
                          >
                            <div>{Number(p.outflow_amount) > 0 ? `-${formatNumber(p.outflow_amount)}` : '0'}</div>
                            {isPast && p.accuracy_outflow_pct !== undefined && p.accuracy_outflow_pct !== null && (
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans font-normal mt-0.5">
                                acc: {p.accuracy_outflow_pct}%
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[250px] p-0">
                          {p.outflow_details && p.outflow_details !== '-' ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="truncate px-4 py-3 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                                  {p.outflow_details}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[320px] bg-zinc-900 text-white dark:bg-zinc-950 border border-zinc-800 p-3 shadow-lg rounded-lg">
                                <div className="space-y-1.5">
                                  <div className="font-bold text-xs border-b border-zinc-700 pb-1 mb-1.5 text-zinc-300">Rincian Kas Keluar</div>
                                  {p.outflow_details.split(',').map((item, idx) => {
                                    const cleanItem = item.trim();
                                    if (!cleanItem) return null;
                                    
                                    const rpMatch = cleanItem.match(/\((Rp\s*[^)]+)\)$/);
                                    let label = cleanItem;
                                    let amountStr = '';
                                    
                                    if (rpMatch) {
                                      amountStr = rpMatch[1];
                                      const rawNum = amountStr.replace(/[^0-9]/g, '');
                                      if (rawNum) {
                                        amountStr = formatNumber(Number(rawNum));
                                      }
                                      label = cleanItem.replace(rpMatch[0], '').trim();
                                    }
                                    
                                    return (
                                      <div key={idx} className="flex justify-between gap-4 text-xs">
                                        <span className="text-zinc-400 font-medium truncate max-w-[200px]">{label}</span>
                                        {amountStr && <span className="font-mono font-bold text-rose-400">{amountStr}</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="px-4 py-3 text-muted-foreground">-</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono font-bold pr-4 py-3">{formatNumber(p.ending_cash)}</TableCell>
                        <TableCell className="text-center py-3">
                          <Badge 
                            variant={p.status === 'WARNING' ? 'destructive' : 'secondary'}
                            className="text-[10px] font-bold py-0.5"
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Detail Proyeksi Keluar */}
      <Dialog open={!!selectedOutflow} onOpenChange={(open) => !open && setSelectedOutflow(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-rose-500" />
              Rincian Proyeksi Kas Keluar
            </DialogTitle>
            <DialogDescription className="text-xs">
              Estimasi rencana pengeluaran kas pada tanggal {selectedOutflow?.date}
            </DialogDescription>
          </DialogHeader>

          {selectedOutflow && (
            <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
              {/* Total Card */}
              <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100/50 dark:border-rose-950/20 text-center">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                  Total Estimasi Keluar
                </span>
                <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 font-mono mt-1">
                  {formatRp(selectedOutflow.amount)}
                </div>
              </div>

              {/* List Detail Proyeksi */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Daftar Transaksi / Rencana Belanja
                </h4>
                
                {selectedOutflow.details && selectedOutflow.details !== '-' ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {selectedOutflow.details.split(',').map((item, idx) => {
                      const cleanItem = item.trim();
                      if (!cleanItem) return null;
                      
                      const rpMatch = cleanItem.match(/(\(Rp\s*[^)]+\))$/);
                      let label = cleanItem;
                      let amountStr = '';
                      
                      if (rpMatch) {
                        amountStr = rpMatch[1].replace(/[()]/g, '');
                        label = cleanItem.replace(rpMatch[0], '').trim();
                      }

                      return (
                        <div key={idx} className="py-2 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <ArrowRight className="h-3 w-3 text-zinc-400 shrink-0 mt-1" />
                            <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-snug break-words">
                              {label}
                            </span>
                          </div>
                          {amountStr && (
                            <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0">
                              {amountStr}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                    Tidak ada rincian proyeksi belanja untuk tanggal ini.
                  </div>
                )}
              </div>

              {/* Rincian Realisasi Belanja (Hari Ini & Tanggal Lampau) */}
              {selectedOutflow.date <= todayStr && (
                <div className="space-y-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Realisasi Belanja Aktual</span>
                    <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded font-bold">
                      Total: {formatRp(todayTransactions.reduce((sum, tx) => sum + Number(tx.total_amount), 0))}
                    </span>
                  </h4>
                  
                  {loadingTransactions ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                      <span className="text-xs">Memuat transaksi aktual...</span>
                    </div>
                  ) : todayTransactions.length > 0 ? (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {todayTransactions.map((tx, idx) => (
                        <div key={tx.id || idx} className="py-2.5 flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 block truncate">
                                {tx.description}
                              </span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {tx.payment_method?.toUpperCase() || 'CASH'} • {tx.contact_name || 'Tanpa Kontak'}
                              </span>
                            </div>
                            <span className="text-sm font-extrabold font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0">
                              -{formatRp(tx.total_amount)}
                            </span>
                          </div>
                          {tx.items && tx.items.length > 0 && (
                            <div className="pl-3 border-l-2 border-zinc-100 dark:border-zinc-800 space-y-0.5">
                              {tx.items.map((item: any, itemIdx: number) => (
                                <div key={itemIdx} className="text-xs text-zinc-500 dark:text-zinc-400 flex justify-between">
                                  <span>• {item.name} ({item.qty} {item.unit || 'pcs'})</span>
                                  <span>{formatRp(item.total || (item.qty * item.price))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-5 text-center text-xs text-zinc-400 border border-dashed rounded-lg">
                      Belum ada transaksi pengeluaran aktual yang tercatat hari ini.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


