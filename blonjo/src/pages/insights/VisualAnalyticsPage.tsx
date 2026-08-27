import React, { useState, useEffect } from 'react';
import { 
  BarChart2, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  RefreshCw, 
  ShoppingBag, 
  Layers
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import api from '../../api/client';
import { toast } from 'sonner';

interface MonthData {
  qty: number;
  value: number;
}

interface MatrixItem {
  item_name: string;
  months: Record<string, MonthData>;
  total_qty: number;
  total_value: number;
}

interface CategoryData {
  category_name: string;
  is_ai_category: boolean;
  items: MatrixItem[];
  totals: Record<string, MonthData>;
  grand_total: MonthData;
}

interface MonthColumn {
  key: string;
  label: string;
}

export default function VisualAnalyticsPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [columns, setColumns] = useState<MonthColumn[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [availableYears, setAvailableYears] = useState<number[]>([2026]);

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const res: any = await api.get(`/insights/purchase-matrix?year=${selectedYear}`);
      setColumns(res.columns || []);
      setCategories(res.categories || []);
      if (res.available_years && Array.isArray(res.available_years) && res.available_years.length > 0) {
        setAvailableYears(res.available_years);
      }

      // Default state: Collapsed (tertutup) per kategori untuk tampilan yang ringkas
      const initialExpanded: Record<string, boolean> = {};
      (res.categories || []).forEach((c: CategoryData) => {
        initialExpanded[c.category_name] = false;
      });
      setExpandedCategories(initialExpanded);
    } catch (err) {
      console.error('Gagal mengambil data matriks analitik:', err);
      toast.error('Gagal memuat data matriks pembelian.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [selectedYear]);

  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  const expandAllCategories = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    categories.forEach(c => {
      updated[c.category_name] = expand;
    });
    setExpandedCategories(updated);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 2
    }).format(val);
  };

  // Grand Overall Totals across all categories
  const overallTotalValue = categories.reduce((sum, cat) => sum + cat.grand_total.value, 0);
  const overallTotalQty = categories.reduce((sum, cat) => sum + cat.grand_total.qty, 0);

  // Current Month Key (bulan now, misal: '2026-08')
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Urutkan data kategori & item berdasarkan nilai pembelian terbesar di bulan aktif (now)
  const sortedCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return [];

    return [...categories].map(cat => {
      // Sort items di dalam kategori berdasarkan value bulan now desc
      const sortedItems = [...cat.items].sort((a, b) => {
        const valA = a.months[currentMonthKey]?.value || 0;
        const valB = b.months[currentMonthKey]?.value || 0;
        if (valB !== valA) return valB - valA;
        return b.total_value - a.total_value;
      });

      return {
        ...cat,
        items: sortedItems
      };
    }).sort((a, b) => {
      const catValA = a.totals[currentMonthKey]?.value || 0;
      const catValB = b.totals[currentMonthKey]?.value || 0;
      if (catValB !== catValA) return catValB - catValA;
      return b.grand_total.value - a.grand_total.value;
    });
  }, [categories, currentMonthKey]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 p-6 md:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold tracking-wide mb-3 border border-emerald-500/30">
              <Sparkles className="h-3.5 w-3.5" />
              Bisnis Insight • Analitik Visual
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Matriks Pembelian Produk Bulanan</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Visualisasi kuantitas &amp; nilai pembelian per bulan diurutkan berdasarkan grup bernilai terbesar pada bulan berjalan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-slate-800/80 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {availableYears.map(yr => (
                <option key={yr} value={yr}>Tahun {yr}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => expandAllCategories(true)}
                className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-slate-700/50 px-2 py-1 h-7"
              >
                Buka Semua
              </Button>
              <span className="text-slate-600">|</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => expandAllCategories(false)}
                className="text-xs text-slate-300 hover:text-white hover:bg-slate-700/50 px-2 py-1 h-7"
              >
                Tutup Semua
              </Button>
            </div>
            <Button
              onClick={fetchMatrix}
              variant="outline"
              size="sm"
              className="bg-slate-800/80 hover:bg-slate-700 text-slate-100 border-slate-700 gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Nilai Pembelian</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{formatCurrency(overallTotalValue)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Volume (Qty)</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{formatNumber(overallTotalQty)} Unit</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Kategori Aktif</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{categories.length} Kategori</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matrix Table */}
      <Card className="border-border/60 shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50 py-4 px-6 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-base font-semibold">Tabel Matriks Pembelian Bulanan</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Master Kategori
            </span>
            <span className="flex items-center gap-1 ml-2">
              <Sparkles className="h-3 w-3 text-purple-500" /> Auto AI Categorization
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm font-medium">Memuat dan menganalisa data matriks pembelian...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-medium">Belum ada log pembelian tercatat</p>
              <p className="text-xs text-muted-foreground mt-1">Data akan muncul otomatis ketika transaksi penyetokan barang dibuat.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              {/* Table Header */}
              <thead>
                {/* Row 1: Month Names & Grand Total */}
                <tr className="bg-slate-900 text-slate-100 font-medium">
                  <th rowSpan={2} className="py-3 px-4 min-w-[220px] md:min-w-[280px] border-b border-r border-slate-700">
                    Item / Kategori
                  </th>
                  {columns.map((col) => (
                    <th key={col.key} colSpan={2} className="py-2.5 px-3 text-center border-b border-r border-slate-700 font-semibold">
                      {col.label}
                    </th>
                  ))}
                  <th colSpan={2} className="py-2.5 px-3 text-center border-b border-slate-700 bg-emerald-950/80 font-bold text-emerald-300">
                    Total Kategori
                  </th>
                </tr>
                {/* Row 2: Qty / Value Headers */}
                <tr className="bg-slate-800 text-slate-300 text-xs font-semibold">
                  {columns.map((col) => (
                    <React.Fragment key={col.key}>
                      <th className="py-1.5 px-2 text-right border-b border-r border-slate-700 w-20 md:w-24">Qty</th>
                      <th className="py-1.5 px-3 text-right border-b border-r border-slate-700 w-28 md:w-36">Value (Rp)</th>
                    </React.Fragment>
                  ))}
                  <th className="py-1.5 px-2 text-right border-b border-r border-slate-700 bg-emerald-950/40 text-emerald-400 w-20 md:w-24">Qty</th>
                  <th className="py-1.5 px-3 text-right border-b border-slate-700 bg-emerald-950/40 text-emerald-400 w-28 md:w-36">Value (Rp)</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-border/60">
                {sortedCategories.map((cat) => {
                  const isExpanded = !!expandedCategories[cat.category_name];
                  return (
                    <React.Fragment key={cat.category_name}>
                      {/* Category Parent Row */}
                      <tr 
                        onClick={() => toggleCategory(cat.category_name)}
                        className="bg-muted/40 hover:bg-muted/70 cursor-pointer font-semibold transition-colors"
                      >
                        <td className="py-3 px-4 flex items-center gap-2 border-r border-border/50">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-foreground tracking-tight">{cat.category_name}</span>
                          <span className="text-xs text-muted-foreground font-normal">({cat.items.length} item)</span>
                          {cat.is_ai_category && (
                            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20 gap-1">
                              <Sparkles className="h-2.5 w-2.5" /> AI Class
                            </Badge>
                          )}
                        </td>

                        {/* Category Totals per Month */}
                        {columns.map((col) => {
                          const mData = cat.totals[col.key] || { qty: 0, value: 0 };
                          return (
                            <React.Fragment key={col.key}>
                              <td className="py-3 px-2 text-right border-r border-border/50 font-medium text-foreground">
                                {mData.qty > 0 ? formatNumber(mData.qty) : '-'}
                              </td>
                              <td className="py-3 px-3 text-right border-r border-border/50 font-medium text-foreground">
                                {mData.value > 0 ? formatCurrency(mData.value) : '-'}
                              </td>
                            </React.Fragment>
                          );
                        })}

                        {/* Category Grand Total */}
                        <td className="py-3 px-2 text-right border-r border-border/50 font-bold bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
                          {formatNumber(cat.grand_total.qty)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(cat.grand_total.value)}
                        </td>
                      </tr>

                      {/* Item Rows (Child Items) */}
                      {isExpanded && cat.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/20 transition-colors text-xs">
                          <td className="py-2.5 pl-10 pr-4 border-r border-border/40 text-muted-foreground font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                            {item.item_name}
                          </td>
                          {columns.map((col) => {
                            const mData = item.months[col.key] || { qty: 0, value: 0 };
                            return (
                              <React.Fragment key={col.key}>
                                <td className="py-2.5 px-2 text-right border-r border-border/40 text-foreground">
                                  {mData.qty > 0 ? formatNumber(mData.qty) : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right border-r border-border/40 text-foreground">
                                  {mData.value > 0 ? formatCurrency(mData.value) : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          <td className="py-2.5 px-2 text-right border-r border-border/40 font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                            {formatNumber(item.total_qty)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                            {formatCurrency(item.total_value)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Table Footer: Overall Grand Total */}
              <tfoot>
                <tr className="bg-slate-900 text-slate-100 font-bold text-sm">
                  <td className="py-3 px-4 border-r border-slate-700 uppercase tracking-wider">
                    GRAND TOTAL PEMBELIAN
                  </td>
                  {columns.map((col) => {
                    const colQty = categories.reduce((sum, cat) => sum + (cat.totals[col.key]?.qty || 0), 0);
                    const colVal = categories.reduce((sum, cat) => sum + (cat.totals[col.key]?.value || 0), 0);
                    return (
                      <React.Fragment key={col.key}>
                        <td className="py-3 px-2 text-right border-r border-slate-700 text-emerald-300">
                          {formatNumber(colQty)}
                        </td>
                        <td className="py-3 px-3 text-right border-r border-slate-700 text-emerald-300">
                          {formatCurrency(colVal)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="py-3 px-2 text-right border-r border-slate-700 bg-emerald-950 text-emerald-300 font-extrabold">
                    {formatNumber(overallTotalQty)}
                  </td>
                  <td className="py-3 px-3 text-right bg-emerald-950 text-emerald-300 font-extrabold">
                    {formatCurrency(overallTotalValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
