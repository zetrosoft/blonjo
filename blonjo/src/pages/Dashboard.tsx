import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
  DollarSign, ReceiptText, Loader2, TrendingUp, ShoppingBag 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchClient } from '../api/client';
import { formatRp } from '../lib/smartParser';

// ─── Chart.js Integration ────────────────────────────────────────
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DashboardSummary {
  total_revenue: number;
  total_expense: number;
  net_profit: number;
  recent_transactions: any[];
  chart_data: any[];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const summary = await fetchClient('/finance/dashboard/summary');
        console.log('Dashboard Data:', summary);
        setData(summary);
      } catch (err) {
        console.error('Failed to load dashboard summary', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      amount: `Rp ${formatRp(data?.total_revenue || 0)}`,
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    },
    {
      title: t('total_expense'),
      amount: `Rp ${formatRp(data?.total_expense || 0)}`,
      icon: ShoppingBag,
      color: "text-rose-500",
      bgColor: "bg-rose-500/10"
    },
    {
      title: t('net_profit'),
      amount: `Rp ${formatRp(data?.net_profit || 0)}`,
      icon: TrendingUp,
      color: (data?.net_profit || 0) >= 0 ? "text-sky-500" : "text-rose-500",
      bgColor: (data?.net_profit || 0) >= 0 ? "bg-sky-500/10" : "bg-rose-500/10"
    }
  ];

  // Prepare Chart Data
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
          boxWidth: 10,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 11, weight: 'bold' as any },
          color: '#888',
        },
      },
      tooltip: {
        backgroundColor: '#18181b',
        titleColor: '#fff',
        bodyColor: '#ccc',
        borderColor: '#3f3f46',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: (context: any) => `Rp ${formatRp(context.raw)}`,
        }
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#666', font: { size: 10, weight: 'bold' as any } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        border: { display: false },
        ticks: {
          color: '#666',
          font: { size: 10 },
          callback: (value: any) => value === 0 ? '0' : `${(value/1000).toFixed(0)}k`
        }
      }
    },
    elements: {
      line: { tension: 0.4 },
      point: { radius: 4, hoverRadius: 6, borderWidth: 2 }
    }
  };

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Penerimaan',
        data: revenueData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        borderWidth: 3,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#09090b',
      },
      {
        label: 'Pengeluaran',
        data: expenseData,
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        fill: true,
        borderWidth: 3,
        pointBackgroundColor: '#f43f5e',
        pointBorderColor: '#09090b',
      }
    ],
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('dashboard_title')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('dashboard_subtitle')}</p>
        </div>
        <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[10px] font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-widest">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live Database Connection
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map((stat, index) => (
          <Card key={index} className="border-border/60 overflow-hidden relative bg-card/40 backdrop-blur-sm">
            <div className={cn("absolute top-0 left-0 w-1 h-full", stat.color.replace('text', 'bg'))} />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/80">
                {stat.title}
              </CardTitle>
              <div className={cn("p-2 rounded-lg", stat.bgColor, stat.color)}>
                <stat.icon className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black tracking-tighter tabular-nums">{stat.amount}</div>
              <p className="text-[9px] font-bold mt-1 flex items-center opacity-60 uppercase tracking-tight">
                Live Updates from DB
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Chart: Chart.js Line Chart - Jauh lebih stabil (Canvas based) */}
        <Card className="col-span-full lg:col-span-4 border-border/60 bg-card/20">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-300 uppercase tracking-wider">
              <TrendingUp className="w-4 h-4 text-primary" />
              Performa 7 Hari Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[320px] w-full">
              <Line options={chartOptions} data={lineChartData} />
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="col-span-full lg:col-span-3 border-border/60 bg-card/20">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-300 uppercase tracking-wider">
              <ReceiptText className="w-4 h-4 text-primary" />
              Transaksi Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              {data?.recent_transactions && data.recent_transactions.length > 0 ? (
                data.recent_transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-background/30 hover:bg-background/50 transition-all">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black border-2",
                        tx.transaction_type === 'income' || tx.transaction_type === 'sales' 
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      )}>
                        {tx.reference_no?.split('-')[0] || 'TX'}
                      </div>
                      <div>
                        <p className="text-xs font-black tracking-tight text-zinc-200">{tx.reference_no}</p>
                        <p className="text-[10px] font-bold text-muted-foreground/70 uppercase">{tx.transaction_date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-xs font-black tabular-nums",
                        tx.transaction_type === 'income' || tx.transaction_type === 'sales' ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {tx.transaction_type === 'income' || tx.transaction_type === 'sales' ? '+' : '-'} Rp {formatRp(Number(tx.total_amount))}
                      </p>
                      <p className="text-[10px] font-medium text-muted-foreground truncate max-w-[120px] italic">{tx.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center flex flex-col items-center gap-3">
                  <div className="p-4 bg-muted/20 rounded-2xl">
                    <ReceiptText className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest">{t('no_transactions_yet')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
