import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ShoppingCart, Sparkles, History, ArrowRight } from 'lucide-react';

export default function TransactionHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-zinc-500/5 dark:to-zinc-500/10 p-8 md:p-10 shadow-inner">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            <ShoppingCart className="w-3.5 h-3.5" />
            {t('menu_transactions')}
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
            {t('tx_hub_title')}
          </h1>
          <p className="text-sm md:text-base text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
            {t('tx_hub_subtitle')}
          </p>
        </div>
        {/* Glow ambient background */}
        <div className="absolute right-0 bottom-0 w-64 h-64 bg-primary/10 rounded-full filter blur-3xl pointer-events-none" />
      </div>

      {/* Bento Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Input Transaksi Pintar */}
        <Card 
          onClick={() => navigate('/transactions/input-transaksi')}
          className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 flex flex-col group cursor-pointer overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <CardHeader className="space-y-4 pb-4">
            <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t('tx_hub_smart_note_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {t('tx_hub_smart_note_desc')}
            </p>
            <Button 
              className="w-full flex items-center justify-between text-xs font-bold mt-6 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
              variant="outline"
            >
              <span>{t('tx_hub_smart_note_btn')}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </CardContent>
        </Card>

        {/* Card 2: Riwayat Log Transaksi */}
        <Card 
          onClick={() => navigate('/transactions/daftar-input')}
          className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 flex flex-col group cursor-pointer overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <CardHeader className="space-y-4 pb-4">
            <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl transition-transform duration-300 group-hover:scale-105">
              <History className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t('tx_hub_history_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {t('tx_hub_history_desc')}
            </p>
            <Button 
              className="w-full flex items-center justify-between text-xs font-bold mt-6 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
              variant="outline"
            >
              <span>{t('tx_hub_history_btn')}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
