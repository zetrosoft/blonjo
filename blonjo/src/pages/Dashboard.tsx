import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowDownRight, ArrowUpRight, DollarSign, Wallet, ReceiptText } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const { t } = useTranslation();

  // Dummy data for visual representation
  const stats = [
    {
      title: t('total_revenue'),
      amount: "Rp 15.450.000",
      icon: DollarSign,
      trend: "+12.5%",
      isPositive: true,
    },
    {
      title: t('total_expense'),
      amount: "Rp 8.200.000",
      icon: Wallet,
      trend: "-2.4%",
      isPositive: false,
    },
    {
      title: t('net_profit'),
      amount: "Rp 7.250.000",
      icon: ArrowUpRight,
      trend: "+18.2%",
      isPositive: true,
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('dashboard_title')}</h2>
        <p className="text-muted-foreground mt-1">{t('dashboard_subtitle')}</p>
      </div>

      {/* Top Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map((stat, index) => (
          <Card key={index} className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <stat.icon className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.amount}</div>
              <p className={cn(
                "text-xs font-medium mt-1 flex items-center",
                stat.isPositive ? "text-emerald-500" : "text-rose-500"
              )}>
                {stat.isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                {stat.trend} {t('from_last_month')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Transactions Placeholder */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-border/60">
          <CardHeader>
            <CardTitle>{t('recent_transactions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-semibold">
                      INV
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Invoice #2026-00{i}</p>
                      <p className="text-xs text-muted-foreground">Hari ini, 14:30</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-500">+ Rp {(i * 150000).toLocaleString('id-ID')}</p>
                    <p className="text-xs text-muted-foreground">Penjualan</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions / OCR Scan Placeholder */}
        <Card className="col-span-3 border-border/60 bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary">{t('quick_actions')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <ReceiptText className="w-10 h-10" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('scan_receipt')}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-[250px] mx-auto">
                {t('scan_receipt_desc')}
              </p>
            </div>
            <button className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm">
              {t('upload_button')}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
