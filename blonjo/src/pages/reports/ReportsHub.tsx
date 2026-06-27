import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { 
  FileText, PieChart, Landmark, TrendingUp, ArrowRight,
  Receipt, Wallet, Scale
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ReportsHub() {
  const { t } = useTranslation();

  const reports = [
    {
      title: t('menu_journal_list'),
      description: 'Daftar semua entri jurnal akuntansi secara kronologis.',
      icon: Receipt,
      path: '/reports/journals',
      color: 'text-blue-500',
      bg: 'bg-blue-50'
    },
    {
      title: t('menu_profit_loss'),
      description: 'Laporan pendapatan dan beban untuk mengukur laba bersih perusahaan.',
      icon: TrendingUp,
      path: '/reports/profit-loss',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50'
    },
    {
      title: t('menu_balance_sheet'),
      description: 'Gambaran posisi keuangan (aset, liabilitas, ekuitas) pada tanggal tertentu.',
      icon: Scale,
      path: '/reports/balance-sheet',
      color: 'text-indigo-500',
      bg: 'bg-indigo-50'
    },
    {
      title: t('menu_equity_changes'),
      description: 'Laporan yang menunjukkan perubahan modal pemilik selama periode tertentu.',
      icon: Landmark,
      path: '/reports/equity-changes',
      color: 'text-amber-500',
      bg: 'bg-amber-50'
    },
    {
      title: t('menu_cash_flow'),
      description: 'Laporan arus kas masuk dan keluar dari aktivitas operasi, investasi, dan pendanaan.',
      icon: Wallet,
      path: '/reports/cash-flow',
      color: 'text-violet-500',
      bg: 'bg-violet-50'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
          <PieChart className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('menu_reports')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pilih laporan standar PSAK / SAK EMKM yang ingin Anda tinjau
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Link key={report.path} to={report.path}>
            <Card className="h-full hover:shadow-md transition-all duration-300 border-border/60 hover:border-primary/30 group">
              <CardHeader className="pb-3">
                <div className={`w-12 h-12 rounded-xl ${report.bg} ${report.color} flex items-center justify-center mb-2`}>
                  <report.icon className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">{report.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {report.description}
                </p>
                <div className="flex items-center text-xs font-bold text-primary gap-1">
                  Lihat Laporan <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}