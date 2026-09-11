import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, Wallet, PiggyBank, ArrowUpRight } from 'lucide-react';
import { fetchClient } from '../api/client';
import { formatRp } from '../lib/utils';

interface DepositLiquidityMetrics {
  total_customer_deposits: number;
  cash_reserve: number;
  total_accounts_payable?: number;
  reserve_ratio: number;
  liquidity_status: 'healthy' | 'warning' | 'critical';
  recommended_allocations: {
    reserve_standby_20: number;
    lock_price_supplier_50: number;
    fast_moving_goods_30: number;
  };
}

export function DepositLiquidityCard() {
  const [metrics, setMetrics] = useState<DepositLiquidityMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClient('/finance/deposit-liquidity-metrics')
      .then((data) => setMetrics(data))
      .catch((err) => console.error('Failed to load deposit liquidity metrics:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-5 rounded-2xl bg-card border border-border animate-pulse h-48 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Memuat data likuiditas...</span>
      </div>
    );
  }

  if (!metrics) return null;

  const getStatusBadge = () => {
    switch (metrics.liquidity_status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Cadangan Kas Aman ({metrics.reserve_ratio}%)
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Waspada Likuiditas ({metrics.reserve_ratio}%)
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/20">
            <AlertOctagon className="w-3.5 h-3.5" />
            Bahaya Kas Rendah ({metrics.reserve_ratio}%)
          </span>
        );
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
            <PiggyBank className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Pemantau Likuiditas & Dana Titipan</h3>
            <p className="text-xs text-muted-foreground">Uang Muka & Simpanan Pelanggan</p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Main Metrics Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-1">
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Total Titipan Pelanggan
          </span>
          <p className="text-lg font-bold text-foreground mt-1">
            {formatRp(metrics.total_customer_deposits)}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Cadangan Kas Standby
          </span>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatRp(metrics.cash_reserve)}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Total Utang Usaha
          </span>
          <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
            {formatRp(metrics.total_accounts_payable || 0)}
          </p>
        </div>
      </div>

      {/* Recommended 20-50-30 Allocation Bar */}
      <div className="space-y-2 pt-2 border-t border-border/40">
        <span className="text-xs font-semibold text-foreground flex items-center justify-between">
          <span>Rekomendasi Alokasi Pengelolaan Dana Aman</span>
          <span className="text-[11px] text-muted-foreground font-normal">Formula 20-50-30</span>
        </span>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold block">20% Standby</span>
            <span className="text-muted-foreground text-[10px]">{formatRp(metrics.recommended_allocations.reserve_standby_20)}</span>
          </div>
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <span className="text-sky-600 dark:text-sky-400 font-bold block">50% Supplier</span>
            <span className="text-muted-foreground text-[10px]">{formatRp(metrics.recommended_allocations.lock_price_supplier_50)}</span>
          </div>
          <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <span className="text-violet-600 dark:text-violet-400 font-bold block">30% Fast Restock</span>
            <span className="text-muted-foreground text-[10px]">{formatRp(metrics.recommended_allocations.fast_moving_goods_30)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
