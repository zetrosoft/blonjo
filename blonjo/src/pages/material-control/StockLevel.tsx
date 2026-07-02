import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Package, AlertTriangle, ArrowUpRight, CheckCircle2, AlertOctagon, RefreshCw } from 'lucide-react';
import { fetchClient } from '../../api/client';

interface StockStat {
  id: number;
  sku: string;
  name: string;
  stock: number;
  min: number;
  max: number; // Target capacity
  uom: string;
}

export default function StockLevel() {
  const [items, setItems] = useState<StockStat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/inventory/products');
      if (Array.isArray(data)) {
        const mapped: StockStat[] = data.map((p: any) => {
          const stock = Number(p.current_stock) || 0;
          const min = Number(p.min_stock_level) || 5;
          // Set a logical max/target capacity based on min level (e.g. 5x min level or default 50)
          const max = min * 5 || 50;
          return {
            id: p.id,
            sku: p.sku || 'N/A',
            name: p.name,
            stock,
            min,
            max,
            uom: p.base_unit || 'pcs',
          };
        });
        setItems(mapped);
      }
    } catch (err) {
      console.error('Failed to load stock levels', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const outOfStockItems = items.filter(item => item.stock === 0);
  const lowStockItems = items.filter(item => item.stock > 0 && item.stock <= item.min);
  const healthyStockItems = items.filter(item => item.stock > item.min);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stock Level & Reorder Points</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Analisis level stok fisik saat ini terhadap batas minimum aman (safety stock).
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Aktualkan Data
        </Button>
      </div>

      {/* Critical Warnings */}
      {outOfStockItems.length > 0 && (
        <div className="relative w-full rounded-lg border p-4 bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertOctagon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h5 className="font-bold tracking-tight mb-1">Kehabisan Stok Kritis!</h5>
            <p className="text-sm opacity-90">
              Ada {outOfStockItems.length} produk yang kehabisan stok fisik. Pembelian re-order harus segera diajukan untuk menghindari hilangnya potensi penjualan.
            </p>
          </div>
        </div>
      )}

      {/* Overview Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-red-800 dark:text-red-300">Kosong (Out of Stock)</CardTitle>
            <AlertOctagon className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfStockItems.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Item dengan jumlah 0 unit</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Di Bawah Batas Aman (Low Stock)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lowStockItems.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Item butuh pemesanan ulang segera</p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-green-800 dark:text-green-300">Stok Aman (Healthy)</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{healthyStockItems.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Item dalam level persediaan ideal</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Level Bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Visualisasi Kapasitas & Batas Stok</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {loading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" /> Memproses visualisasi level...
              </div>
            ) : items.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Tidak ada data stok.
              </div>
            ) : (
              items.map(item => {
                const percentage = Math.min(100, Math.round((item.stock / item.max) * 100));
                const minPercentage = Math.round((item.min / item.max) * 100);
                
                // Color mapping
                let progressColor = "bg-green-500";
                let statusLabel = "Aman";
                let statusBadgeVariant = "success";
                let statusBadgeClass = "bg-green-500/10 text-green-600 dark:text-green-400";
                
                if (item.stock === 0) {
                  progressColor = "bg-red-500";
                  statusLabel = "Kosong";
                  statusBadgeVariant = "destructive";
                  statusBadgeClass = "bg-red-500/10 text-red-600 dark:text-red-400";
                } else if (item.stock <= item.min) {
                  progressColor = "bg-yellow-500";
                  statusLabel = "Rendah";
                  statusBadgeVariant = "warning";
                  statusBadgeClass = "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
                }

                return (
                  <div key={item.id} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {item.name}
                        <span className="text-xs text-muted-foreground font-mono">({item.sku})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono">
                          Stok: <strong className="text-foreground">{item.stock}</strong> / {item.max} {item.uom} (Min: {item.min})
                        </span>
                        <Badge variant={statusBadgeVariant as any} className={statusBadgeClass}>
                          {statusLabel}
                        </Badge>
                      </div>
                    </div>

                    {/* Custom progress bar with safety marker */}
                    <div className="relative h-4 w-full bg-muted rounded-full overflow-hidden">
                      {/* Safety Min Line Marker */}
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-500/60 z-10" 
                        style={{ left: `${minPercentage}%` }}
                        title={`Batas Aman Minimum: ${item.min} ${item.uom}`}
                      />
                      {/* Current Stock Level Bar */}
                      <div 
                        className={`h-full ${progressColor} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0%</span>
                      <span className="text-rose-500 font-semibold" style={{ marginLeft: `${minPercentage - 5}%` }}>
                        Reorder Point ({item.min})
                      </span>
                      <span>Target ({item.max} {item.uom})</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
