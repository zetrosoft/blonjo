import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { 
  Plus, Settings2, Package, TrendingUp, RefreshCw, 
  Store, Calculator, ExternalLink 
} from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface MyCatalogItem {
  id: number;
  sku: string;
  name: string;
  base_unit: string;
  stock?: number;
  hpp?: number;
  sell_price?: number;
}

export default function MyCatalogPage() {
  const [items, setItems] = useState<MyCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStockMaintenance, setIsStockMaintenance] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      // Get My Catalog (subscribed products)
      const data = await fetchClient('/inventory/my-catalog');
      setItems(data);
      
      // Get Stock Maintenance setting
      const settings = await fetchClient('/settings/app');
      const sm = settings.find((s: any) => s.key === 'stock_maintenance');
      setIsStockMaintenance(sm?.value === 'true');
    } catch (err: any) {
      toast.error('Gagal memuat katalog saya', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const toggleStockMaintenance = async (checked: boolean) => {
    try {
      await fetchClient('/settings/app/stock_maintenance', {
        method: 'PUT',
        body: JSON.stringify({ value: checked ? 'true' : 'false' })
      });
      setIsStockMaintenance(checked);
      toast.success('Pengaturan disimpan', { 
        description: `Mode Stock Maintenance: ${checked ? 'Aktif (Statis)' : 'Non-aktif (Dinamis)'}` 
      });
    } catch (err: any) {
      toast.error('Gagal menyimpan pengaturan');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Katalog Saya</h2>
          <p className="text-muted-foreground text-sm">
            Daftar barang yang Anda jual dan kelola (Tenant Specific).
          </p>
        </div>
        <div className="flex items-center gap-3 bg-muted/40 p-2 rounded-lg border border-border/50">
          <Store className="w-4 h-4 text-primary" />
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="stock-mt" 
              checked={isStockMaintenance} 
              onCheckedChange={(c: boolean) => toggleStockMaintenance(!!c)} 
            />
            <Label htmlFor="stock-mt" className="text-xs font-medium cursor-pointer">
              Stock Maintenance
            </Label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Jualan</p>
                <p className="text-2xl font-bold mt-1">{items.length}</p>
              </div>
              <Package className="w-5 h-5 text-primary opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Daftar Barang Saya</CardTitle>
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="w-3.5 h-3.5" /> Ambil dari Global
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead className="text-right">Stok Fisik</TableHead>
                  <TableHead className="text-right">HPP (Avg)</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10">Memuat...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-muted-foreground">Katalog Anda kosong.</p>
                      <Button variant="link" className="text-primary mt-2">Pilih dari Katalog Global <ExternalLink className="w-3 h-3 ml-1" /></Button>
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">{item.sku}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {item.stock || 0} <span className="text-[10px] text-muted-foreground uppercase">{item.base_unit}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatRp(item.hpp || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-primary">
                      {formatRp(item.sell_price || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <Settings2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
