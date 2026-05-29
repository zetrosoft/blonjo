import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { fetchClient } from '../api/client';
import { formatRp } from '../lib/smartParser';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import {
  PieChart, BookOpen, Eye, Calendar, DollarSign, Search,
  FileText, RefreshCw, ArrowUpRight, ArrowDownRight, Layers,
  ChevronRight, CalendarDays, Receipt, Clock, User2, ArrowRight,
  TrendingUp, BarChart3, ShieldAlert
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

interface JournalEntry {
  id: number;
  transaction_id: number;
  account_id: number;
  debit: string | number;
  credit: string | number;
  account?: Account;
}

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface InventoryLog {
  id: number;
  product_id: number;
  quantity: string | number;
  price_per_unit: string | number;
  log_type: 'in' | 'out';
  product?: Product;
  contact?: {
    id: number;
    name: string;
    contact_type: string;
  };
}

interface Transaction {
  id: number;
  transaction_date: string;
  reference_no: string | null;
  description: string;
  transaction_type: string;
  total_amount: string | number;
  status: 'draft' | 'posted';
  created_by_id: number | null;
  created_at: string;
  entries: JournalEntry[];
  inventory_logs: InventoryLog[];
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const isJournalView = location.pathname === '/reports/journals';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected Transaction for Detail Modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/finance/transactions');
      setTransactions(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_transactions', { error: err.message || err }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleViewDetail = async (txId: number) => {
    setLoadingDetail(true);
    setDetailOpen(true);
    try {
      const data = await fetchClient(`/finance/transactions/${txId}`);
      setSelectedTx(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_journal_detail', { error: err.message || err }));
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePostJournal = async (tx: Transaction) => {
    try {
      await fetchClient(`/finance/transactions/${tx.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'posted' })
      });
      toast.success('Jurnal berhasil diposting!');
      loadTransactions(); // Reload list
    } catch (err: any) {
      toast.error(err.message || 'Gagal memposting jurnal');
    }
  };

  // Filtered transactions for search
  const filteredTransactions = transactions.filter(tx => {
    const query = searchQuery.toLowerCase();
    const refNo = tx.reference_no?.toLowerCase() || '';
    const desc = tx.description.toLowerCase();
    const type = tx.transaction_type.toLowerCase();
    return refNo.includes(query) || desc.includes(query) || type.includes(query);
  });

  // Calculate Overview Metrics
  const totalRevenue = transactions
    .filter(tx => tx.transaction_type === 'income' || tx.transaction_type === 'sales')
    .reduce((sum, tx) => sum + Number(tx.total_amount), 0);

  const totalExpense = transactions
    .filter(tx => tx.transaction_type === 'expense' || tx.transaction_type === 'purchase' || tx.transaction_type === 'operational')
    .reduce((sum, tx) => sum + Number(tx.total_amount), 0);

  const netProfit = totalRevenue - totalExpense;

  const getTxTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      purchase: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      sales: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      expense: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      income: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
      operational: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      manual: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    };
    
    return (
      <Badge variant="outline" className={cn("capitalize px-2 py-0.5", styles[type] || 'bg-muted text-muted-foreground')}>
        {type.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
      posted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    
    return (
      <Badge variant="outline" className={cn("capitalize px-2 py-0.5 font-bold text-[10px]", styles[status] || 'bg-muted text-muted-foreground')}>
        {t(`status_${status}`)}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {isJournalView ? t('reports_journals_title') : t('menu_reports')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            {isJournalView 
              ? t('reports_journals_subtitle')
              : t('reports_intro_subtitle')
            }
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadTransactions} 
          className="flex items-center gap-2 border-zinc-200 dark:border-zinc-800 bg-background/50 backdrop-blur-sm shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          {t('refresh_data')}
        </Button>
      </div>

      {/* VIEW 1: INTRODUCTION PAGE (If on `/reports`) */}
      {!isJournalView && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Welcome/Hero Section */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-zinc-500/5 dark:to-zinc-500/10 p-8 shadow-inner">
            <div className="max-w-2xl space-y-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                {t('reports_intro_tag')}
              </span>
              <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {t('reports_intro_title')}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {t('reports_intro_desc')}
              </p>
            </div>
            {/* Ambient Background Glow */}
            <div className="absolute right-0 bottom-0 w-48 h-48 bg-primary/10 rounded-full filter blur-3xl pointer-events-none" />
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t('total_revenue')}</p>
                    <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-500">
                      {formatRp(totalRevenue)}
                    </p>
                  </div>
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-lg">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t('total_expense')}</p>
                    <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-500">
                      {formatRp(totalExpense)}
                    </p>
                  </div>
                  <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-lg">
                    <ArrowDownRight className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t('net_profit_store')}</p>
                    <p className={cn(
                      "text-2xl font-extrabold",
                      netProfit >= 0 ? "text-sky-600 dark:text-sky-500" : "text-rose-600 dark:text-rose-500"
                    )}>
                      {formatRp(netProfit)}
                    </p>
                  </div>
                  <div className={cn(
                    "p-2.5 rounded-lg",
                    netProfit >= 0 ? "bg-sky-500/10 text-sky-500" : "bg-rose-500/10 text-rose-500"
                  )}>
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Submenu Features Presentation */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              {t('explore_reports_title')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: List Jurnal (Active Submenu) */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 flex flex-col group">
                <CardHeader className="space-y-2.5 pb-4">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-lg font-bold">{t('reports_hub_journals_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {t('reports_hub_journals_desc')}
                  </p>
                  <Button 
                    onClick={() => navigate('/reports/journals')} 
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-all mt-4"
                  >
                    {t('journal_list_card_btn')}
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>

              {/* Card 2: Laba Rugi (Placeholder) */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card opacity-90 flex flex-col relative overflow-hidden">
                <CardHeader className="space-y-2.5 pb-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 w-fit rounded-xl">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg font-bold">{t('reports_hub_pl_title')}</CardTitle>
                    <span className="bg-zinc-150 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-350 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      {t('coming_soon')}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
                    {t('reports_hub_pl_desc')}
                  </p>
                  <Button 
                    disabled
                    variant="secondary"
                    className="w-full text-xs font-bold mt-4"
                  >
                    {t('coming_soon_btn')}
                  </Button>
                </CardContent>
              </Card>

              {/* Card 3: Neraca (Placeholder) */}
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card opacity-90 flex flex-col relative overflow-hidden">
                <CardHeader className="space-y-2.5 pb-4">
                  <div className="p-3 bg-sky-500/10 text-sky-500 w-fit rounded-xl">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg font-bold">{t('reports_hub_bs_title')}</CardTitle>
                    <span className="bg-zinc-150 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-350 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      {t('coming_soon')}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
                    {t('reports_hub_bs_desc')}
                  </p>
                  <Button 
                    disabled
                    variant="secondary"
                    className="w-full text-xs font-bold mt-4"
                  >
                    {t('coming_soon_btn')}
                  </Button>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: LIST JURNAL TABLE (If on `/reports/journals`) */}
      {isJournalView && (
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-md animate-in fade-in duration-300">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  {t('general_ledger')}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('journal_table_instruction')}
                </p>
              </div>
              <div className="relative max-w-sm flex-1 md:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  placeholder={t('search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('loading_transactions')}</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
                <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">{t('no_transactions_found')}</p>
                <p className="text-sm text-zinc-500 max-w-xs">
                  {t('no_transactions_found_desc')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                <Table>
                  <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60">
                    <TableRow>
                      <TableHead className="w-[100px]">{t('table_date')}</TableHead>
                      <TableHead className="w-[120px]">{t('table_ref_no')}</TableHead>
                      <TableHead className="w-[100px]">{t('table_type')}</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>{t('table_desc')}</TableHead>
                      <TableHead className="text-right w-[150px]">{t('table_total_amount')}</TableHead>
                      <TableHead className="w-[120px] text-center">{t('table_actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow 
                        key={tx.id}
                        className="cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
                        onClick={() => handleViewDetail(tx.id)}
                      >
                        <TableCell className="font-medium text-xs font-mono">
                          {tx.transaction_date}
                        </TableCell>
                        <TableCell className="font-semibold text-xs text-primary font-mono">
                          {tx.reference_no || '-'}
                        </TableCell>
                        <TableCell>
                          {getTxTypeBadge(tx.transaction_type)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(tx.status)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm font-medium">
                          {tx.description}
                        </TableCell>
                        <TableCell className="text-right font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                          {formatRp(Number(tx.total_amount))}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {tx.status === 'draft' && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handlePostJournal(tx)}
                                className="h-8 text-xs font-semibold px-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all shadow-sm rounded-md flex items-center gap-1.5"
                              >
                                <Send className="w-3 h-3" />
                                {t('tx_btn_post_journal')}
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleViewDetail(tx.id)}
                              title={t('view_journal_detail')}
                              className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transaction Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto border-zinc-200 dark:border-zinc-800 p-6 animate-in fade-in-50 duration-200">
          <DialogHeader className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <DialogTitle className="text-xl font-bold flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span>{t('dialog_detail_title')}</span>
                {selectedTx && getStatusBadge(selectedTx.status)}
              </div>
              {selectedTx && getTxTypeBadge(selectedTx.transaction_type)}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail || !selectedTx ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('dialog_loading')}</p>
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-150 dark:border-zinc-800">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <CalendarDays className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_date')}:</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{selectedTx.transaction_date}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <Receipt className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_ref_no')}:</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold">{selectedTx.reference_no || '-'}</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <Clock className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_created')}:</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{new Date(selectedTx.created_at).toLocaleString(i18n.language.startsWith('id') ? 'id-ID' : 'en-US')}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <User2 className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_total_amount')}:</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-extrabold text-sm">{formatRp(Number(selectedTx.total_amount))}</span>
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('label_description')}:</p>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-1 bg-background p-2.5 rounded border border-zinc-100 dark:border-zinc-850">
                    {selectedTx.description}
                  </p>
                </div>
              </div>

              {/* 1. Double Entry Journal Entries Table */}
              <div className="space-y-3">
                <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  {t('journal_flow_title')}
                </h3>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <Table>
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs">{t('column_account_code')}</th>
                        <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs">{t('column_account_name')}</th>
                        <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">{t('column_debit')}</th>
                        <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">{t('column_credit')}</th>
                      </tr>
                    </thead>
                    <TableBody>
                      {selectedTx.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-xs font-semibold">{entry.account?.code || '-'}</TableCell>
                          <TableCell className="text-sm font-medium">{entry.account?.name || `Account ID ${entry.account_id}`}</TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", Number(entry.debit) > 0 ? "font-bold text-emerald-600 dark:text-emerald-500" : "text-muted-foreground")}>
                            {Number(entry.debit) > 0 ? formatRp(Number(entry.debit)) : '-'}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", Number(entry.credit) > 0 ? "font-bold text-rose-600 dark:text-rose-500" : "text-muted-foreground")}>
                            {Number(entry.credit) > 0 ? formatRp(Number(entry.credit)) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total Baris Jurnal */}
                      <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/30 font-bold border-t-2 border-zinc-200 dark:border-zinc-800">
                        <TableCell colSpan={2} className="text-sm font-bold">{t('column_total')}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-500">
                          {formatRp(selectedTx.entries.reduce((sum, entry) => sum + Number(entry.debit), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-rose-600 dark:text-rose-500">
                          {formatRp(selectedTx.entries.reduce((sum, entry) => sum + Number(entry.credit), 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* 2. Inventory Logs (Detail Barang Belanja) */}
              {selectedTx.inventory_logs && selectedTx.inventory_logs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary" />
                    {t('inventory_detail_title')}
                  </h3>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <Table>
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
                          <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs">{t('column_item_name')}</th>
                          <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground text-xs">{t('column_quantity')}</th>
                          <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">{t('column_unit_price')}</th>
                          <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground text-xs">{t('column_subtotal')}</th>
                        </tr>
                      </thead>
                      <TableBody>
                        {selectedTx.inventory_logs.map((log) => {
                          const quantity = Number(log.quantity);
                          const price = Number(log.price_per_unit);
                          const subtotal = quantity * price;
                          return (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm font-semibold">{log.product?.name || `Product ID ${log.product_id}`}</TableCell>
                              <TableCell className="text-center text-sm font-medium font-mono">
                                {quantity} {log.product?.unit || 'pcs'}
                              </TableCell>
                              <TableCell className="text-right text-sm font-mono">{formatRp(price)}</TableCell>
                              <TableCell className="text-right text-sm font-bold font-mono">{formatRp(subtotal)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-6">
            <Button onClick={() => setDetailOpen(false)} variant="secondary" className="px-5">
              {t('btn_close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
