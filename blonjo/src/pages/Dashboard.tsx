import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
  DollarSign, ReceiptText, Loader2, TrendingUp, ShoppingBag, 
  Package, Users, RefreshCw
} from 'lucide-react';
import { cn, formatRp } from '../lib/utils';
import { fetchClient } from '../api/client';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { TransactionDetailDialog } from './transaction/components/TransactionDetailDialog';

// ─── Chart.js Integration ────────────────────────────────────────
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DashboardSummary {
  total_revenue: number;
  total_expense: number;
  net_profit: number;
  cash_balance: number;
  recent_transactions: any[];
  chart_data: any[];
  upcoming_debts: any[];
  total_inventory_value: number;
  low_stock_count: number;
  top_products: { name: string; qty: number }[];
  supplier_purchases: { name: string; amount: number }[];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Payoff and details states
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  
  const [detailTxId, setDetailTxId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  const [payoffOpen, setPayoffOpen] = useState(false);
  const [payoffAccountId, setPayoffAccountId] = useState('');
  const [payoffDate, setPayoffDate] = useState(new Date().toISOString().split('T')[0]);
  const [processingPayoff, setProcessingPayoff] = useState(false);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const summary = await fetchClient('/finance/dashboard/summary');
      setData(summary);

      // Notify H-1 debts
      if (summary.upcoming_debts) {
        const today = new Date();
        summary.upcoming_debts.forEach((tx: any) => {
          if (!tx.due_date) return;
          const dueDate = new Date(tx.due_date);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            toast.warning(`Pengingat: Tagihan jatuh tempo besok (H-1)`, {
              description: `${tx.description} - ${formatRp(Number(tx.total_amount))}`
            });
          } else if (diffDays === 0) {
            toast.error(`Perhatian: Tagihan jatuh tempo HARI INI`, {
              description: `${tx.description} - ${formatRp(Number(tx.total_amount))}`
            });
          } else if (diffDays < 0) {
            toast.error(`Peringatan: Tagihan TERLAMBAT ${Math.abs(diffDays)} Hari`, {
              description: `${tx.description} - ${formatRp(Number(tx.total_amount))}`
            });
          }
        });
      }
    } catch (err) {
      console.error('Failed to load dashboard summary', err);
      toast.error('Gagal mengambil ringkasan dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const res = await fetchClient('/finance/accounts');
      if (Array.isArray(res)) {
        const cashBankAccs = res.filter((a: any) => a.code.startsWith('1-11'));
        setAccounts(cashBankAccs);
        if (cashBankAccs.length > 0) {
          setPayoffAccountId(cashBankAccs[0].id.toString());
        }
      }
    } catch (err) {
      console.error('Failed to load payment accounts', err);
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadAccounts();
  }, []);

  const handleCardClick = (tx: any) => {
    setSelectedTx(tx);
    setActionMenuOpen(true);
  };

  const handleOpenDetail = () => {
    if (!selectedTx) return;
    setDetailTxId(selectedTx.id);
    setDetailOpen(true);
    setActionMenuOpen(false);
  };

  const handleOpenPayoff = () => {
    setActionMenuOpen(false);
    setPayoffOpen(true);
  };

  const handleConfirmPayoff = async () => {
    if (!selectedTx || !payoffAccountId) return;
    setProcessingPayoff(true);
    try {
      await fetchClient(`/finance/transactions/${selectedTx.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_account_id: parseInt(payoffAccountId),
          payment_date: payoffDate
        })
      });
      toast.success("Pelunasan berhasil diproses!");
      setPayoffOpen(false);
      loadDashboardData();
    } catch (err: any) {
      toast.error(err.message || "Gagal memproses pelunasan");
    } finally {
      setProcessingPayoff(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">{t('loading')}...</p>
      </div>
    );
  }

  const stats = [
    {
      title: t('total_revenue'),
      amount: formatRp(data?.total_revenue || 0),
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      description: t('db_omzet_desc')
    },
    {
      title: t('total_expense'),
      amount: formatRp(data?.total_expense || 0),
      icon: ShoppingBag,
      color: "text-rose-500",
      bgColor: "bg-rose-500/10",
      description: t('db_expense_desc')
    },
    {
      title: t('db_cash_bank'),
      amount: formatRp(data?.cash_balance || 0),
      icon: TrendingUp,
      color: (data?.cash_balance || 0) >= 0 ? "text-sky-500" : "text-rose-500",
      bgColor: (data?.cash_balance || 0) >= 0 ? "bg-sky-500/10" : "bg-rose-500/10",
      description: t('db_cash_bank_desc')
    },
    {
      title: t('db_inventory_assets'),
      amount: formatRp(data?.total_inventory_value || 0),
      icon: Package,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      description: t('db_inventory_assets_desc')
    }
  ];

  const chartLabels = data?.chart_data.map(d => d.name) || [];
  const revenueData = data?.chart_data.map(d => d.revenue) || [];
  const expenseData = data?.chart_data.map(d => d.expense) || [];

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 8,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 10, weight: 'bold' as any },
          color: '#888',
        },
      },
      tooltip: {
        backgroundColor: '#18181b',
        titleColor: '#fff',
        bodyColor: '#ccc',
        borderColor: '#3f3f46',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        callbacks: {
          label: (context: any) => formatRp(context.raw),
        }
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#666', font: { size: 9, weight: 'bold' as any } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        border: { display: false },
        ticks: {
          color: '#666',
          font: { size: 9 },
          callback: (value: any) => value === 0 ? '0' : `${(value/1000).toFixed(0)}k`
        }
      }
    },
    elements: {
      line: { tension: 0.4 },
      point: { radius: 3, hoverRadius: 5, borderWidth: 1.5 }
    }
  };

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: t('type_income'),
        data: revenueData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        fill: true,
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#09090b',
      },
      {
        label: t('type_expense'),
        data: expenseData,
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.05)',
        fill: true,
        borderWidth: 2,
        pointBackgroundColor: '#f43f5e',
        pointBorderColor: '#09090b',
      }
    ],
  };

  const topProductsLabels = data?.top_products?.map(p => p.name) || [];
  const topProductsValues = data?.top_products?.map(p => p.qty) || [];

  const barChartData = {
    labels: topProductsLabels,
    datasets: [
      {
        label: t('db_qty_bought'),
        data: topProductsValues,
        backgroundColor: 'rgba(59, 130, 246, 0.65)',
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 6,
      }
    ]
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#18181b',
        titleColor: '#fff',
        bodyColor: '#ccc',
        borderColor: '#3f3f46',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => ` ${context.dataset.label}: ${formatRp(context.raw)}`,
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { 
          color: '#666', 
          font: { size: 9 },
          callback: (value: any) => value === 0 ? '0' : `${(value/1000).toFixed(0)}k`
        }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#888', font: { size: 9, weight: 'bold' as any } }
      }
    }
  };

  const suppliers = data?.supplier_purchases || [];
  const supplierLabels = suppliers.map(s => s.name);
  const supplierAmounts = suppliers.map(s => s.amount);
  
  const colors = [
    'rgba(99, 102, 241, 0.7)',  // Indigo
    'rgba(168, 85, 247, 0.7)',  // Purple
    'rgba(236, 72, 153, 0.7)',  // Pink
    'rgba(20, 184, 166, 0.7)',  // Teal
    'rgba(234, 179, 8, 0.7)',   // Yellow
  ];
  const borderColors = [
    '#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#eab308'
  ];

  const doughnutData = {
    labels: supplierLabels.length > 0 ? supplierLabels : ['No Data'],
    datasets: [
      {
        data: supplierAmounts.length > 0 ? supplierAmounts : [1],
        backgroundColor: supplierAmounts.length > 0 ? colors.slice(0, supplierAmounts.length) : ['rgba(63, 63, 70, 0.5)'],
        borderColor: supplierAmounts.length > 0 ? borderColors.slice(0, supplierAmounts.length) : ['#3f3f46'],
        borderWidth: 1,
      }
    ]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            if (context.label === 'No Data') return t('db_no_supplier_purchases');
            return ` ${context.label}: ${formatRp(context.raw)}`;
          }
        }
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-zinc-800 to-zinc-500 dark:from-zinc-100 dark:to-zinc-400 bg-clip-text text-transparent">
            {t('dashboard_title')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('dashboard_subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={loadDashboardData} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> {t('refresh_data')}
          </Button>
          <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            {t('db_connection_live')}
          </div>
        </div>
      </div>

      {/* Top Stats Bento Grid (4 Columns) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className="overflow-hidden relative bg-zinc-50 dark:bg-card/30 border border-zinc-200/80 dark:border-border/60 shadow-md hover:border-zinc-300 dark:hover:border-border/100 transition-all duration-300">
            <div className={cn("absolute top-0 left-0 w-1 h-full", stat.color.replace('text', 'bg'))} />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-500 dark:text-muted-foreground/80">
                {stat.title}
              </CardTitle>
              <div className={cn("p-2 rounded-lg", stat.bgColor, stat.color)}>
                <stat.icon className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black tracking-tighter tabular-nums text-zinc-900 dark:text-zinc-100">{stat.amount}</div>
              <p className="text-[9px] font-medium mt-1 text-zinc-500 dark:text-muted-foreground/80 italic">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Charts */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="col-span-full lg:col-span-8 border border-zinc-200/80 dark:border-border/60 bg-white dark:bg-card/20 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black flex items-center gap-2 text-zinc-800 dark:text-zinc-300 uppercase tracking-widest">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              {t('db_financial_trend')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[280px] w-full">
              <Line options={chartOptions} data={lineChartData} />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-full lg:col-span-4 border border-zinc-200/80 dark:border-border/60 bg-white dark:bg-card/20 shadow-md flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black flex items-center gap-2 text-zinc-800 dark:text-zinc-300 uppercase tracking-widest">
              <Users className="w-4 h-4 text-indigo-500" />
              {t('db_purchases_per_supplier')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col justify-center gap-4">
            <div className="flex items-center justify-center gap-4">
              <div className="relative w-28 h-28 flex-shrink-0">
                <Doughnut options={doughnutOptions} data={doughnutData} />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] uppercase font-black text-muted-foreground">{t('db_total')}</span>
                  <span className="text-[10px] font-black text-zinc-850 dark:text-zinc-200">
                    {formatRp(supplierAmounts.reduce((acc, a) => acc + a, 0))}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-zinc-200/80 dark:border-border/30 pt-3 max-h-[140px] overflow-y-auto">
              {suppliers.length > 0 ? (
                suppliers.slice(0, 3).map((sup, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800/40">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: borderColors[idx % borderColors.length] }} />
                      <span className="font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[100px]">{sup.name}</span>
                    </div>
                    <span className="font-black text-zinc-900 dark:text-zinc-100">{formatRp(sup.amount)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-center text-muted-foreground/60">{t('db_no_supplier_purchases')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fast Moving & Upcoming Debts */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="col-span-full lg:col-span-6 border border-zinc-200/80 dark:border-border/60 bg-white dark:bg-card/20 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black flex items-center gap-2 text-zinc-800 dark:text-zinc-300 uppercase tracking-widest">
              <Package className="w-4 h-4 text-violet-500" />
              {t('db_top_purchased_items')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {data?.top_products && data.top_products.length > 0 ? (
              <div className="h-[220px] w-full">
                <Bar options={barChartOptions} data={barChartData} />
              </div>
            ) : (
              <div className="py-20 text-center flex flex-col items-center gap-3">
                <Package className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest">{t('db_no_purchased_items')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tagihan & Hutang */}
        <Card className="col-span-full lg:col-span-6 border border-zinc-200/80 dark:border-border/60 bg-white dark:bg-card/20 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black flex items-center gap-2 text-rose-500 dark:text-rose-400 uppercase tracking-widest">
              <ReceiptText className="w-4 h-4" />
              {t('db_upcoming_debts')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
              {data?.upcoming_debts && data.upcoming_debts.length > 0 ? (
                data.upcoming_debts.map((tx) => {
                  const today = new Date();
                  const dueDate = tx.due_date ? new Date(tx.due_date) : null;
                  
                  let badgeText = "Hutang/Tempo";
                  let badgeColor = "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20";
                  
                  if (dueDate) {
                    const diffTime = dueDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) {
                      badgeText = t('db_late_days', { count: Math.abs(diffDays) });
                      badgeColor = "bg-rose-50/10 text-rose-600 dark:text-rose-500 border-rose-500/20";
                    } else if (diffDays === 0) {
                      badgeText = t('db_due_today');
                      badgeColor = "bg-rose-50/10 text-rose-600 dark:text-rose-500 border-rose-500/20";
                    } else {
                      badgeText = t('db_days_left', { count: diffDays });
                      badgeColor = "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-500 border-sky-500/20";
                    }
                  }

                  return (
                    <div 
                      key={tx.id} 
                      onClick={() => handleCardClick(tx)}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200/50 dark:border-border/30 bg-zinc-50 dark:bg-background/30 hover:bg-zinc-100 dark:hover:bg-background/50 hover:border-zinc-300 dark:hover:border-zinc-400/30 transition-all cursor-pointer gap-4"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={cn("px-2 py-0.5 text-[8px] font-black border rounded uppercase tracking-wider text-center", badgeColor)}>
                          {badgeText}
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-tight text-zinc-800 dark:text-zinc-200 truncate max-w-[150px]">{tx.description}</p>
                          <p className="text-[9px] font-medium text-muted-foreground">{t('db_due')}: {tx.due_date || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black tabular-nums text-rose-600 dark:text-rose-400">
                          {formatRp(Number(tx.total_amount))}
                        </p>
                        <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">
                          {tx.reference_no || 'TX'}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-16 text-center flex flex-col items-center gap-3">
                  <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest">{t('db_no_debts')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aktivitas Transaksi Terbaru */}
      <div className="grid gap-6">
        <Card className="col-span-full border border-zinc-200/80 dark:border-border/60 bg-white dark:bg-card/20 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black flex items-center gap-2 text-sky-600 dark:text-sky-500 uppercase tracking-widest">
              <ReceiptText className="w-4 h-4" />
              {t('db_recent_activity')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {data?.recent_transactions && data.recent_transactions.length > 0 ? (
                data.recent_transactions.map((tx) => (
                  <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-zinc-200/50 dark:border-border/30 bg-zinc-50 dark:bg-background/30 hover:bg-zinc-100 dark:hover:bg-background/50 transition-all gap-4">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-black border-2",
                        tx.transaction_type === 'income' || tx.transaction_type === 'sales' 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-500 border-rose-500/20"
                      )}>
                        {tx.reference_no?.split('-')[0] || 'TX'}
                      </div>
                      <div>
                        <p className="text-xs font-black tracking-tight text-zinc-800 dark:text-zinc-200">{tx.reference_no}</p>
                        <p className="text-[9px] font-bold text-muted-foreground/70 uppercase">{tx.transaction_date}</p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className={cn(
                        "text-xs font-black tabular-nums",
                        tx.transaction_type === 'income' || tx.transaction_type === 'sales' ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      )}>
                        {tx.transaction_type === 'income' || tx.transaction_type === 'sales' ? '+' : '-'} {formatRp(Number(tx.total_amount))}
                      </p>
                      <p className="text-[9px] font-medium text-muted-foreground truncate max-w-[250px] italic">{tx.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center flex flex-col items-center gap-3">
                  <ReceiptText className="w-8 h-8 text-muted-foreground/30" />
                  <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest">{t('no_transactions_yet')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Modals / Dialogs ─── */}
      
      {/* Option menu for a debt */}
      <Dialog open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850">
          <DialogHeader>
            <DialogTitle className="text-md font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">Aksi Tagihan</DialogTitle>
            <DialogDescription className="text-xs">
              Pilih tindakan yang ingin dilakukan untuk tagihan ini:
              <span className="block mt-2 font-bold text-zinc-950 dark:text-zinc-100">{selectedTx?.description} ({formatRp(selectedTx?.total_amount || 0)})</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Button variant="outline" onClick={handleOpenDetail} className="h-20 flex flex-col gap-2 justify-center items-center font-bold border-zinc-200 dark:border-zinc-850 text-zinc-800 dark:text-zinc-200">
              <ReceiptText className="w-5 h-5 text-sky-555 dark:text-sky-400" />
              Lihat Detail
            </Button>
            <Button variant="outline" onClick={handleOpenPayoff} className="h-20 flex flex-col gap-2 justify-center items-center font-bold border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Bayar / Lunasi
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setActionMenuOpen(false)} className="text-xs">{t('btn_close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payoff Confirm Dialog */}
      <Dialog open={payoffOpen} onOpenChange={setPayoffOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850">
          <DialogHeader>
            <DialogTitle className="text-md font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">Proses Pelunasan Hutang</DialogTitle>
            <DialogDescription className="text-xs">
              Buat pencatatan jurnal pelunasan hutang secara otomatis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-border/30 space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Tagihan:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate max-w-[200px]">{selectedTx?.description}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Total Hutang:</span>
                <span className="font-black text-rose-600 dark:text-rose-400">{formatRp(selectedTx?.total_amount || 0)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Bayar Menggunakan</label>
              <select 
                value={payoffAccountId} 
                onChange={(e) => setPayoffAccountId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none text-zinc-900 dark:text-zinc-100"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.code}] {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Tanggal Pembayaran</label>
              <input 
                type="date" 
                value={payoffDate}
                onChange={(e) => setPayoffDate(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayoffOpen(false)} disabled={processingPayoff} className="text-xs">Batal</Button>
            <Button onClick={handleConfirmPayoff} disabled={processingPayoff} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white">
              {processingPayoff ? 'Memproses...' : 'Konfirmasi Pelunasan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared Transaction Detail Dialog */}
      {detailTxId && (
        <TransactionDetailDialog 
          txId={detailTxId}
          isOpen={detailOpen}
          onOpenChange={setDetailOpen}
          onSuccess={loadDashboardData}
        />
      )}
    </div>
  );
}
