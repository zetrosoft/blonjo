import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { LayoutGrid, Package, History, Plus, ArrowRight, Boxes, FileText, DollarSign, AlertTriangle, BarChart2 } from 'lucide-react';
import { fetchClient } from '../../api/client';

export default function MaterialControlHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [maintenanceStock, setMaintenanceStock] = useState<boolean>(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetchClient('/settings/maintenance-stock');
        if (res && typeof res.maintenance_stock === 'boolean') {
          setMaintenanceStock(res.maintenance_stock);
        }
      } catch (err) {
        console.error('Failed to load maintenance stock settings in Hub:', err);
      }
    };
    loadSettings();
  }, []);

  const cards = [];

  if (maintenanceStock) {
    cards.push({
      title: t('menu_inventory_control'),
      desc: t('mc_hub_inv_desc'),
      btnText: t('mc_hub_inv_btn'),
      icon: Boxes,
      path: '/material-control/inventory',
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30'
    });
  }

  cards.push(
    {
      title: t('menu_purchasing_history'),
      desc: t('mc_hub_purch_desc'),
      btnText: t('mc_hub_purch_btn'),
      icon: History,
      path: '/material-control/purchases',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30'
    },
    {
      title: t('menu_recommended_purchase'),
      desc: t('mc_hub_recom_desc') || 'Rekomendasi pembelian ulang otomatis berbasis kecepatan konsumsi harian.',
      btnText: t('mc_hub_recom_btn') || 'Buka Rekomendasi',
      icon: Plus,
      path: '/material-control/recommended',
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30'
    },
    {
      title: t('menu_purchase_plan_form') || 'Form Rencana Belanja',
      desc: 'Tulis kebutuhan barang dagang bebas dengan suara atau teks untuk membuat rencana belanja secara akurat.',
      btnText: 'Buka Rencana Belanja',
      icon: FileText,
      path: '/material-control/purchase-plan',
      color: 'text-cyan-500',
      bg: 'bg-cyan-50 dark:bg-cyan-950/30'
    },
    {
      title: t('menu_budgeting') || 'Proyeksi Kas Harian',
      desc: 'Prediksi likuiditas kas toko berdasarkan rata-rata harian omzet masuk, rencana belanja material, dan tagihan jatuh tempo.',
      btnText: 'Buka Proyeksi',
      icon: DollarSign,
      path: '/material-control/budgeting',
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-950/30'
    },
    {
      title: t('menu_waste') || 'Waste Tracking',
      desc: 'Catat dan monitor penyusutan atau pembuangan barang rusak untuk penyesuaian HPP otomatis.',
      btnText: 'Buka Waste Tracking',
      icon: AlertTriangle,
      path: '/material-control/waste',
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-950/30'
    },
    {
      title: t('menu_projection_accuracy') || 'Monitor Akurasi',
      desc: 'Bandingkan proyeksi arus kas masuk/keluar harian dengan transaksi aktual ter-POSTING untuk mengukur tingkat akurasi.',
      btnText: 'Buka Monitor Akurasi',
      icon: BarChart2,
      path: '/material-control/projection-accuracy',
      color: 'text-fuchsia-500',
      bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/30'
    }
  );

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
            {t('mc_hub_welcome_title')}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t('mc_hub_welcome_desc')}
          </p>
        </div>
        {/* Glow ambient background */}
        <div className="absolute right-0 bottom-0 w-64 h-64 bg-primary/10 rounded-full filter blur-3xl pointer-events-none" />
      </div>

      {/* Grid Kolom */}
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
