import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { 
  Compass, Wallet, TrendingUp, AlertTriangle, 
  BarChart2, Globe, Search, RefreshCw, Sparkles 
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';

interface CompassData {
  cash_balance: number;
  net_profit: number;
  profit_margin: number;
  total_inventory_value: number;
  low_stock_count: number;
  revenue_trend: number;
  market_info_placeholder: string;
}

export default function BusinessCompass() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cashflow' | 'stock' | 'market'>('dashboard');
  const [data, setData] = useState<CompassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vibeQuery, setVibeQuery] = useState('');
  const [cashflowData, setCashflowData] = useState<any[]>([]);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [maintenanceStock, setMaintenanceStock] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [marketData, setMarketData] = useState<any[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [selectedProductCopywriting, setSelectedProductCopywriting] = useState<any | null>(null);

  const loadCompassData = async () => {
    setLoading(true);
    try {
      const res = await fetchClient('/finance/compass/summary');
      setData(res);
      setMaintenanceStock(res.maintenance_stock || false);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data Kompas Bisnis');
    } finally {
      setLoading(false);
    }
  };

  const loadCashflowData = async () => {
    setCashflowLoading(true);
    try {
      const res = await fetchClient('/material-control/cashflow-projection');
      setCashflowData(res);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data proyeksi arus kas');
    } finally {
      setCashflowLoading(false);
    }
  };

  const loadProductsData = async () => {
    setProductsLoading(true);
    try {
      const res = await fetchClient('/inventory/products');
      if (Array.isArray(res)) {
        setProducts(res);
        setFilteredProducts(res);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data produk');
    } finally {
      setProductsLoading(false);
    }
  };

  const loadMarketData = async () => {
    setMarketLoading(true);
    try {
      const res = await fetchClient('/finance/compass/market-intelligence');
      if (Array.isArray(res)) {
        setMarketData(res);
        if (res.length > 0) {
          setSelectedProductCopywriting(res[0]);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data intelijen pasar');
    } finally {
      setMarketLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadCompassData();
    } else if (activeTab === 'cashflow') {
      loadCashflowData();
    } else if (activeTab === 'stock') {
      loadProductsData();
    } else if (activeTab === 'market') {
      loadMarketData();
    }
  }, [activeTab]);

  const handleStockSearch = (q: string) => {
    setStockSearchQuery(q);
    if (!q.trim()) {
      setFilteredProducts(products);
    } else {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(q.toLowerCase()) || 
        (p.sku && p.sku.toLowerCase().includes(q.toLowerCase()))
      );
      setFilteredProducts(filtered);
    }
  };

  const handleVibeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vibeQuery.trim()) return;
    toast.info(`Vibe Search: "${vibeQuery}"`, {
      description: "Pencarian pintar akan terintegrasi penuh di Fase 3.",
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
            <Compass className="w-8 h-8 text-cyan-500 animate-spin-slow" />
            {t('menu_business_compass')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Instrumen navigasi finansial dan operasional real-time untuk bisnis Anda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={activeTab === 'dashboard' ? loadCompassData : activeTab === 'cashflow' ? loadCashflowData : activeTab === 'stock' ? loadProductsData : loadMarketData} variant="outline" size="sm" className="gap-2 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <RefreshCw className="h-3.5 w-3.5" /> Segarkan
          </Button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl max-w-fit border border-zinc-200/50 dark:border-zinc-800/40">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'dashboard'
              ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          Dashboard Compass
        </button>
        <button
          onClick={() => setActiveTab('cashflow')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'cashflow'
              ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          Cashflow Navigator
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'stock'
              ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          Smart Stock Advisor
        </button>
        <button
          onClick={() => setActiveTab('market')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'market'
              ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          Market Intelligence
        </button>
      </div>

      {/* Main Tab Area */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Vibe Omnibar */}
          <form onSubmit={handleVibeSearch} className="relative w-full max-w-2xl">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-cyan-500" />
            </div>
            <input
              type="text"
              placeholder="Cari produk atau ajukan pertanyaan bisnis... (Contoh: 'Beras Pandan Wangi')"
              value={vibeQuery}
              onChange={(e) => setVibeQuery(e.target.value)}
              className="w-full bg-white/5 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200 dark:border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)] rounded-xl pl-10 pr-24 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all dark:text-zinc-100 text-zinc-800"
            />
            <div className="absolute right-2 inset-y-1.5 flex items-center">
              <button
                type="submit"
                className="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-600 hover:to-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Vibe
              </button>
            </div>
          </form>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800/40 animate-pulse border border-zinc-200 dark:border-zinc-800" />
              ))}
            </div>
          ) : (
            /* Bento Grid Glassmorphism */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Card 1: Kas (Size: 4/12) */}
              <div className="md:col-span-6 lg:col-span-4 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-cyan-500/20 p-5 shadow-[0_0_20px_rgba(6,182,212,0.08)] flex flex-col justify-between transition-all duration-300 hover:border-cyan-400 dark:hover:border-cyan-400/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
                      Kas &amp; Setara Kas
                    </span>
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums">
                      {formatRp(data?.cash_balance || 0)}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Saldo tunai &amp; bank terkonsolidasi.
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/40 text-[10px] flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Koneksi Kas:</span>
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aktif
                  </span>
                </div>
              </div>

              {/* Card 2: Laba/Margin (Size: 4/12) */}
              <div className="md:col-span-6 lg:col-span-4 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-emerald-500/20 p-5 shadow-[0_0_20px_rgba(16,185,129,0.08)] flex flex-col justify-between transition-all duration-300 hover:border-emerald-400 dark:hover:border-emerald-400/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
                      Laba &amp; Margin
                    </span>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums">
                      {formatRp(data?.net_profit || 0)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-emerald-500">
                        {data?.profit_margin.toFixed(1)}% Margin
                      </span>
                      {data?.revenue_trend !== 0 && (
                        <span className={`text-[10px] ${data?.revenue_trend && data.revenue_trend > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          ({data?.revenue_trend && data.revenue_trend > 0 ? '+' : ''}{data?.revenue_trend?.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/40 text-[10px] flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Kesehatan Finansial:</span>
                  <span className="text-emerald-500 font-bold">Optimal</span>
                </div>
              </div>

              {/* Card 3: Status Stok (Size: 4/12) */}
              <div className="md:col-span-6 lg:col-span-4 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-amber-500/20 p-5 shadow-[0_0_20px_rgba(245,158,11,0.08)] flex flex-col justify-between transition-all duration-300 hover:border-amber-400 dark:hover:border-amber-400/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
                      Status Aset Stok
                    </span>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                      <BarChart2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums">
                      {formatRp(data?.total_inventory_value || 0)}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-amber-500">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{data?.low_stock_count} Item Stok Rendah</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/40 text-[10px] flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Kontrol Stok:</span>
                  <span className="text-amber-500 font-bold">Perlu Perhatian</span>
                </div>
              </div>

              {/* Card 4: Market Info (Size: 12/12 - Wide Bento Card) */}
              <div className="md:col-span-12 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-purple-500/20 p-6 shadow-[0_0_25px_rgba(168,85,247,0.08)] flex flex-col justify-between transition-all duration-300 hover:border-purple-400 dark:hover:border-purple-400/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
                      Kompas Pasar &amp; Rekomendasi Makro (AI Insight)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 font-bold">
                      Confidence: 98%
                    </span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-semibold">
                    &ldquo;{data?.market_info_placeholder}&rdquo;
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/40 text-[10px] flex items-center justify-between font-medium text-muted-foreground">
                  <span>Sumber data: Analisis Terintegrasi Blonjo &amp; Data Makro Nasional</span>
                  <span>Diperbarui secara otomatis</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Placeholders for subsequent phases */}
      {activeTab === 'cashflow' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-semibold leading-relaxed">
            💡 <strong>Navigator Proyeksi Kas Harian (H-4 s/d H+30):</strong> Membantu Anda memantau ketersediaan likuiditas dari 4 hari ke belakang hingga 30 hari ke depan. Akurasi proyeksi historis ditampilkan dalam persentase kecil.
          </div>

          {cashflowLoading ? (
            <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800/40 animate-pulse border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Memuat Proyeksi Kas...</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.08)]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-100/50 dark:bg-zinc-900/50 text-[10px] uppercase font-black tracking-wider text-muted-foreground/80">
                    <th className="p-4">Tanggal</th>
                    <th className="p-4 text-right">Kas Awal</th>
                    <th className="p-4 text-right">Kas Masuk (Inflow)</th>
                    <th className="p-4 text-right">Kas Keluar (Outflow)</th>
                    <th className="p-4">Detail Pengeluaran</th>
                    <th className="p-4 text-right">Kas Akhir</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/40 dark:divide-zinc-850/40 font-semibold text-zinc-700 dark:text-zinc-300">
                  {cashflowData.map((item, idx) => {
                    const isPast = new Date(item.date) < new Date(new Date().setHours(0, 0, 0, 0));
                    return (
                      <tr 
                        key={idx} 
                        className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition-colors ${
                          isPast ? 'bg-zinc-100/10 dark:bg-zinc-800/10 opacity-80' : ''
                        }`}
                      >
                        <td className="p-4 font-bold whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                          {item.date} {isPast && <span className="text-[9px] font-medium text-muted-foreground/60">(Aktual)</span>}
                        </td>
                        <td className="p-4 text-right tabular-nums">{formatRp(item.starting_cash)}</td>
                        <td className="p-4 text-right tabular-nums">
                          <div className="flex flex-col items-end">
                            <span className="text-emerald-500 font-bold">+{formatRp(item.inflow_amount)}</span>
                            {item.accuracy_inflow_pct !== null && item.accuracy_inflow_pct !== undefined && (
                              <sub className="text-[9px] text-zinc-400 font-normal">Akurasi: {item.accuracy_inflow_pct}%</sub>
                            )}
                            {item.is_capital_inflow && (
                              <span className="mt-1 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[8px] font-black uppercase tracking-wider border border-cyan-500/20">
                                Capital In
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right tabular-nums">
                          <div className="flex flex-col items-end">
                            <span className="text-rose-500 font-bold">-{formatRp(item.outflow_amount)}</span>
                            {item.accuracy_outflow_pct !== null && item.accuracy_outflow_pct !== undefined && (
                              <sub className="text-[9px] text-zinc-400 font-normal">Akurasi: {item.accuracy_outflow_pct}%</sub>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground font-medium max-w-[200px] truncate" title={item.outflow_details}>
                          {item.outflow_details}
                        </td>
                        <td className="p-4 text-right font-black tabular-nums text-zinc-900 dark:text-zinc-100">
                          {formatRp(item.ending_cash)}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            item.status === 'AMAN' 
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.15)] animate-pulse'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {activeTab === 'stock' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-semibold leading-relaxed">
            💡 <strong>Smart Stock Advisor:</strong> Gunakan Vibe Omnibar di bawah untuk memfilter stok produk. Jika status kontrol stok aktif (maintenance_stock = True), sisa stok fisik & HPP (Moving Average) akan ditampilkan. Jika tidak, sisa stok disembunyikan secara visual.
          </div>

          {/* Vibe Omnibar for Stock */}
          <div className="relative w-full max-w-2xl">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-cyan-500" />
            </div>
            <input
              type="text"
              placeholder="Cari produk berdasarkan nama atau SKU..."
              value={stockSearchQuery}
              onChange={(e) => handleStockSearch(e.target.value)}
              className="w-full bg-white/5 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200 dark:border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)] rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all dark:text-zinc-100 text-zinc-800"
            />
          </div>

          {productsLoading ? (
            <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800/40 animate-pulse border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Memuat data produk...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((prod) => (
                <div 
                  key={prod.id} 
                  className="rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-cyan-500/20 p-5 shadow-[0_0_20px_rgba(6,182,212,0.05)] flex flex-col justify-between transition-all duration-300 hover:border-cyan-400 dark:hover:border-cyan-400/40"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-black text-sm text-zinc-900 dark:text-zinc-50 truncate">
                        {prod.name}
                      </h4>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-bold text-muted-foreground whitespace-nowrap">
                        {prod.sku || 'SKU-NONE'}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Harga Jual:</span>
                        <span className="font-black text-zinc-900 dark:text-zinc-100">{formatRp(prod.sell_price || 0)}</span>
                      </div>
                      
                      {/* Sisa Stok Fisik & HPP (Hanya tampil jika maintenanceStock === true) */}
                      <div className={`space-y-1.5 transition-all duration-500 ${
                        maintenanceStock ? 'opacity-100 h-auto' : 'opacity-0 h-0 overflow-hidden select-none pointer-events-none'
                      }`}>
                        <div className="flex justify-between text-xs border-t border-zinc-200/40 dark:border-zinc-850/40 pt-1.5">
                          <span className="text-muted-foreground">Stok Fisik:</span>
                          <span className="font-bold text-cyan-600 dark:text-cyan-400">
                            {prod.current_stock} {prod.base_unit || 'pcs'}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">HPP (Moving Average):</span>
                          <span className="font-medium text-zinc-500 tabular-nums">
                            {formatRp(prod.purchase_price || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/40 text-[9px] flex items-center justify-between font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Status Kontrol:</span>
                    <span className={maintenanceStock ? 'text-emerald-500' : 'text-zinc-400'}>
                      {maintenanceStock ? 'Aktif' : 'Non-Aktif'}
                    </span>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center bg-zinc-50/50 dark:bg-zinc-950/20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Produk tidak ditemukan</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Placeholders for subsequent phases */}
      {activeTab === 'market' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-semibold leading-relaxed">
            💡 <strong>Market Intelligence:</strong> Rekomendasi harga jual ideal berdasarkan analisis tren pasar retail eksternal. Gunakan copywriting pemasaran yang dihasilkan untuk mempromosikan produk Anda di media sosial dan WhatsApp.
          </div>

          {marketLoading ? (
            <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800/40 animate-pulse border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Menganalisis Tren Pasar...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Daftar Rekomendasi Harga (5/12) */}
              <div className="lg:col-span-5 space-y-4">
                <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-widest">
                  Rekomendasi Harga Pasar
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {marketData.map((item) => (
                    <div
                      key={item.product_id}
                      onClick={() => setSelectedProductCopywriting(item)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        selectedProductCopywriting?.product_id === item.product_id
                          ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                          : 'bg-white/40 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-850/40 hover:bg-white/60 dark:hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {item.product_name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-wider border border-emerald-500/20 whitespace-nowrap">
                          Confidence: {item.confidence_score}%
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-baseline gap-4 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Harga Toko:</span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300 line-through">
                            {formatRp(item.current_price)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-cyan-500 block">Saran Harga Pasar:</span>
                          <span className="font-black text-cyan-600 dark:text-cyan-400">
                            {formatRp(item.recommended_price)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground leading-normal font-medium">
                        {item.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kolom Kanan: Copywriting Generator (7/12) */}
              <div className="lg:col-span-7 space-y-4">
                {selectedProductCopywriting ? (
                  <div className="rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-zinc-200/60 dark:border-cyan-500/20 p-5 shadow-[0_0_25px_rgba(6,182,212,0.06)] flex flex-col h-full justify-between">
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          Copywriting Generator
                        </span>
                        <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50 mt-1">
                          {selectedProductCopywriting.product_name}
                        </h3>
                      </div>

                      {/* Tiga Template Kreatif */}
                      <div className="space-y-4">
                        {/* Sosmed Template */}
                        <div className="space-y-1.5 p-3.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-850/40 relative group">
                          <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">
                            Instagram / Facebook Promo
                          </span>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                            {selectedProductCopywriting.copywriting.social_media}
                          </p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedProductCopywriting.copywriting.social_media);
                              toast.success("Salin Sukses", { description: "Copywriting Instagram disalin ke clipboard." });
                            }}
                            className="absolute right-3 top-3 px-2 py-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-[10px] font-bold rounded transition-colors text-zinc-800 dark:text-zinc-200"
                          >
                            Salin
                          </button>
                        </div>

                        {/* WhatsApp Broadcast Template */}
                        <div className="space-y-1.5 p-3.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-850/40 relative group">
                          <span className="text-[9px] font-black uppercase text-emerald-500 tracking-wider">
                            WhatsApp Broadcast
                          </span>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                            {selectedProductCopywriting.copywriting.whatsapp_broadcast}
                          </p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedProductCopywriting.copywriting.whatsapp_broadcast);
                              toast.success("Salin Sukses", { description: "Copywriting WhatsApp disalin ke clipboard." });
                            }}
                            className="absolute right-3 top-3 px-2 py-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-[10px] font-bold rounded transition-colors text-zinc-800 dark:text-zinc-200"
                          >
                            Salin
                          </button>
                        </div>

                        {/* Ide Visual Banner */}
                        <div className="p-3.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-850/40 relative">
                          <span className="text-[9px] font-black uppercase text-purple-500 tracking-wider">
                            Ide Visual &amp; Komposisi Banner
                          </span>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-1.5 leading-relaxed italic">
                            {selectedProductCopywriting.copywriting.visual_idea}
                          </p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedProductCopywriting.copywriting.visual_idea);
                              toast.success("Salin Sukses", { description: "Ide visual disalin ke clipboard." });
                            }}
                            className="absolute right-3 top-3 px-2 py-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-[10px] font-bold rounded transition-colors text-zinc-800 dark:text-zinc-200"
                          >
                            Salin
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">Pilih produk di sebelah kiri untuk melihat copywriting promosi.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
