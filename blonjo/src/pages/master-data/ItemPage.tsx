import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Package, TrendingUp, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { cn, formatRp } from '../../lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface Item {
  id: number;
  sku: string;
  name: string;
  category: string;
  stock: number;
  uom: string;
  purchase_price: number;
  sell_price: number;
  status: 'active' | 'low_stock' | 'out_of_stock';
  has_transactions: boolean;
}

export default function ItemPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    base_unit: 'pcs',
    category_id: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [uoms, setUoms] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient('/inventory/products');
      if (Array.isArray(data)) {
        const mappedItems: Item[] = data.map((prod: any) => {
          const stock = Number(prod.current_stock) || 0;
          const minStock = Number(prod.min_stock_level) || 0;
          let status: Item['status'] = 'active';
          if (stock === 0) {
            status = 'out_of_stock';
          } else if (stock <= minStock) {
            status = 'low_stock';
          }
          return {
            id: prod.id,
            sku: prod.sku,
            name: prod.name,
            category: 'Umum',
            stock,
            uom: prod.base_unit || 'pcs',
            purchase_price: prod.purchase_price || 0,
            sell_price: prod.sell_price || 0,
            status,
            has_transactions: prod.has_transactions || false,
          };
        });
        setItems(mappedItems);
      } else {
        throw new Error('Format data tidak didukung');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat data dari server';
      setError(msg);
      toast.error('Error', { description: msg });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadUoms = async () => {
    try {
      const data = await fetchClient('/inventory/uoms');
      if (Array.isArray(data)) {
        setUoms(data.filter(u => u.status === 'active'));
      }
    } catch (err) {
      console.error('Failed to load UOMs for selection', err);
    }
  };

  useEffect(() => {
    loadItems();
    loadUoms();
  }, []);



  const getStatusBadge = (status: Item['status']) => {
    const configs = {
      active: { label: 'Aktif', class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      low_stock: { label: 'Stok Menipis', class: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      out_of_stock: { label: 'Habis', class: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
    };
    const conf = configs[status];
    return (
      <Badge variant="outline" className={cn("px-2.5 py-0.5 text-xs font-semibold", conf.class)}>
        {conf.label}
      </Badge>
    );
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ sku: '', name: '', base_unit: 'pcs', category_id: '' });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setFormData({
      sku: item.sku,
      name: item.name,
      base_unit: item.uom || 'pcs',
      category_id: '' // Add category ID fetch/mapping logic if needed
    });
    setIsDialogOpen(true);
  };

  const confirmDelete = async (sku: string) => {
    try {
      await fetchClient(`/inventory/products/${sku}`, { method: 'DELETE' });
      toast.success('Berhasil', { description: `Item ${sku} telah dihapus.` });
      loadItems();
    } catch (err: any) {
      toast.error('Gagal', { description: err.message || `Gagal menghapus ${sku}` });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sku || !formData.name) {
      toast.error('Gagal', { description: 'SKU dan Nama Barang wajib diisi.' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await fetchClient(`/inventory/products/${editingItem.sku}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formData.name,
            base_unit: formData.base_unit
          })
        });
        toast.success('Berhasil', { description: `Item ${editingItem.sku} berhasil diperbarui.` });
      } else {
        await fetchClient('/inventory/products', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        toast.success('Berhasil', { description: `Item ${formData.sku} berhasil ditambahkan.` });
      }
      setIsDialogOpen(false);
      loadItems();
    } catch (err: any) {
      toast.error('Gagal', { description: err.message || 'Gagal menyimpan item' });
    } finally {
      setIsSubmitting(false);
    }
  };
  const paginatedItems = filteredItems.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);


  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Item Unik</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : items.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Package className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Stok Menipis / Habis</p>
              <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-500">
                {loading ? '-' : items.filter(i => i.status !== 'active').length}
              </p>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Estimasi Nilai Aset</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-500">
                {loading ? '-' : formatRp(items.reduce((acc, curr) => acc + (curr.purchase_price * curr.stock), 0))}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Item Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Cari SKU, nama barang, atau kategori..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadItems} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat data produk...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Gagal Memuat Data</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadItems} className="mt-2">Coba Lagi</Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Package className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Tidak ada produk ditemukan</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">Mulai dengan menambahkan produk baru.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">SKU</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Harga Beli</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                      <TableCell className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{item.sku}</TableCell>
                      <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.name}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{item.category}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">{item.stock}</TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-400 capitalize">{item.uom}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatRp(item.purchase_price)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-primary">{formatRp(item.sell_price)}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(item)}
                            title="Ubah Item"
                            className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => toast.info('Info', { description: 'Pengaturan Harga (Pricing) sedang dalam pengembangan.' })}
                            title="Set Harga"
                            className="h-8 w-8 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/5"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteTarget(item.sku)}
                            disabled={item.has_transactions}
                            title={item.has_transactions ? "Item tidak dapat dihapus karena sudah memiliki transaksi" : "Hapus Item"}
                            className="h-8 w-8 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/5 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
<PaginationControls totalItems={filteredItems.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />

            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Ubah Item' : 'Tambah Item Baru'}</DialogTitle>
              <DialogDescription>
                {editingItem ? `Perbarui informasi untuk SKU ${editingItem.sku}.` : 'Masukkan detail item baru ke dalam master data.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU / Kode Barang</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  disabled={!!editingItem}
                  placeholder="CTH-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nama Barang</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Kopi Arabica 100g"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="base_unit">Satuan Dasar (UOM)</Label>
                <Select
                  value={formData.base_unit}
                  onValueChange={(val) => setFormData({ ...formData, base_unit: val })}
                >
                  <SelectTrigger id="base_unit">
                    <SelectValue placeholder="Pilih satuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {uoms.length === 0 ? (
                      <>
                        <SelectItem value="pcs">Pcs</SelectItem>
                        <SelectItem value="kg">Kg</SelectItem>
                        <SelectItem value="gr">Gram</SelectItem>
                        <SelectItem value="ltr">Liter</SelectItem>
                        <SelectItem value="box">Box</SelectItem>
                        <SelectItem value="lusin">Lusin</SelectItem>
                      </>
                    ) : (
                      uoms.map((u) => (
                        <SelectItem key={u.id} value={u.code}>
                          {u.name} ({u.code.toUpperCase()})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? 'Simpan Perubahan' : 'Tambahkan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Produk dengan SKU {deleteTarget} akan dihapus secara permanen dari database master.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteTarget) {
                  confirmDelete(deleteTarget);
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
