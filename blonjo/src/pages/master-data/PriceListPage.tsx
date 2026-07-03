import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { 
  Loader2, Sparkles, AlertTriangle, Edit2, Save, 
  HelpCircle, RefreshCw, Layers, Tag, Percent
} from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface ProductPriceInfo {
  id: number;
  name: string;
  sku: string;
  base_unit: string;
  purchase_price: number; // HPP / Moving Average
  sell_price: number;     // Harga Jual Dasar
  current_stock: number;
  auto_adjusted?: boolean; // Flag auto-adjust margin
  pricing_rule?: {
    id: number;
    rule_type: string;
    rule_payload: any;
  } | null;
}

export default function PriceListPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ProductPriceInfo[]>([]);
  const [search, setSearch] = useState('');
  
  // Modal Edit State
  const [editingItem, setEditingItem] = useState<ProductPriceInfo | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editHpp, setEditHpp] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const loadPriceList = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/inventory/my-catalog');
      if (Array.isArray(data)) {
        setItems(data);
      }
    } catch (err) {
      toast.error('Gagal memuat daftar harga');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriceList();
  }, []);

  const handleOpenEdit = (item: ProductPriceInfo) => {
    setEditingItem(item);
    setEditPrice(item.sell_price);
    setEditHpp(item.purchase_price);
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      await fetchClient(`/inventory/my-catalog/${editingItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          sell_price: editPrice,
          hpp: editHpp
        })
      });
      toast.success('Harga berhasil diperbarui');
      setEditingItem(null);
      loadPriceList();
    } catch (err) {
      toast.error('Gagal memperbarui harga');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.sku.toLowerCase().includes(search.toLowerCase())
  );
  const paginatedItems = filteredItems.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);


  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Price List</h1>
          <p className="text-muted-foreground">Manajemen harga jual dasar, HPP, dan Pricing Rules produk</p>
        </div>
        <Button onClick={loadPriceList} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input 
          placeholder="Cari produk berdasarkan nama atau SKU..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex justify-center items-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>HPP (Moving Avg)</TableHead>
                  <TableHead>Harga Jual Dasar</TableHead>
                  <TableHead>Aturan Aktif</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Tidak ada produk ditemukan
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.sku}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatRp(item.purchase_price)}</TableCell>
                      <TableCell>{formatRp(item.sell_price)}</TableCell>
                      <TableCell>
                        {item.pricing_rule ? (
                          <Badge variant="secondary" className="flex w-fit items-center gap-1">
                            {item.pricing_rule.rule_type === 'tiered' && <Layers className="h-3 w-3" />}
                            {item.pricing_rule.rule_type === 'discount' && <Percent className="h-3 w-3" />}
                            {item.pricing_rule.rule_type === 'bundle_multiple' && <Tag className="h-3 w-3" />}
                            {item.pricing_rule.rule_type}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.auto_adjusted ? (
                          <Badge variant="warning" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 flex w-fit items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Auto-Adjusted
                          </Badge>
                        ) : (
                          <Badge variant="success" className="bg-green-500/10 text-green-500 border-green-500/20">Normal</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleOpenEdit(item)}>
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
<PaginationControls totalItems={filteredItems.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
            </>

          )}
        </CardContent>
      </Card>

      {/* Modal Edit Simple */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 animate-in fade-in duration-200">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Edit Harga - {editingItem.name}</CardTitle>
              <CardDescription>Ubah harga jual dasar atau estimasi harga pokok pembelian (HPP)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hpp">HPP (Moving Average Cost)</Label>
                <Input 
                  id="hpp" 
                  type="number" 
                  value={editHpp} 
                  onChange={(e) => setEditHpp(Number(e.target.value))} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Harga Jual Dasar</Label>
                <Input 
                  id="price" 
                  type="number" 
                  value={editPrice} 
                  onChange={(e) => setEditPrice(Number(e.target.value))} 
                />
                {editingItem.auto_adjusted && (
                  <p className="text-xs text-yellow-500 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Harga ini otomatis disesuaikan karena HPP naik. Menyimpan secara manual akan mereset status penyesuaian otomatis ini.
                  </p>
                )}
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="ghost" onClick={() => setEditingItem(null)}>Batal</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Simpan
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
