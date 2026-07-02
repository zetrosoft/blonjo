import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { LayoutGrid, Package, History, Store, Plus, ArrowRight, Boxes } from 'lucide-react';

export default function MaterialControlHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const cards = [
    {
      title: t('menu_inventory_control'),
      desc: 'Kelola status stok, nilai HPP, total nilai persediaan, serta lakukan penyesuaian stok fisik barang secara real-time.',
      btnText: 'Buka Kontrol Stok',
      icon: Boxes,
      path: '/material-control/inventory',
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30'
    },
    {
      title: t('menu_purchasing_history'),
      desc: 'Pantau riwayat invoice belanja barang dagangan, detail item pembelian, harga modal dari supplier, dan status pembayaran.',
      btnText: 'Buka Riwayat Belanja',
      icon: History,
      path: '/material-control/purchases',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30'
    },
    {
      title: t('menu_stock_level'),
      desc: 'Analisis tingkat kesehatan stok vs Reorder Point (ROP) dengan visual progress bar dinamis untuk mencegah kehabisan stok.',
      btnText: 'Buka Level Stok',
      icon: Store,
      path: '/material-control/stock-level',
      color: 'text-indigo-500',
      bg: 'bg-indigo-50 dark:bg-indigo-950/30'
    },
    {
      title: t('menu_recommended_purchase'),
      desc: 'Rekomendasi pembelian ulang otomatis berbasis kecepatan konsumsi harian (daily velocity) untuk mengoptimalkan perputaran modal.',
      btnText: 'Buka Rekomendasi',
      icon: Plus,
      path: '/material-control/recommended',
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30'
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-zinc-500/5 dark:to-zinc-500/10 p-8 shadow-inner">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            <LayoutGrid className="w-3.5 h-3.5" />
            {t('menu_material_control')}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
            Dashboard Pengendalian Material & Stok
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Kelola efisiensi perputaran stok toko sembako Anda, pantau pengeluaran purchasing, dan cegah kekosongan item terlaris secara otomatis.
          </p>
        </div>
        {/* Glow ambient background */}
        <div className="absolute right-0 bottom-0 w-64 h-64 bg-primary/10 rounded-full filter blur-3xl pointer-events-none" />
      </div>

      {/* Grid 4 Kolom */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, idx) => (
          <Card 
            key={idx}
            onClick={() => navigate(card.path)}
            className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 flex flex-col group cursor-pointer overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <CardHeader className="space-y-3 pb-3">
              <div className={`p-2.5 ${card.bg} ${card.color} w-fit rounded-lg transition-transform duration-300 group-hover:scale-105`}>
                <card.icon className="w-5 h-5" />
              </div>
              <CardTitle className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-6">
                {card.desc}
              </p>
              <Button 
                className="w-full flex items-center justify-between text-[11px] font-bold mt-4 h-9 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                variant="outline"
              >
                <span>{card.btnText}</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
