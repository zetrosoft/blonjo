import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Users, Receipt, ShieldCheck, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

interface Supplier {
  id: number;
  code: string;
  name: string;
  phone: string;
  address: string;
  outstanding_balance: number;
}

export default function SupplierPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  // Profile and history states
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [supplierHistory, setSupplierHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleOpenProfile = async (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setProfileDialogOpen(true);
    setLoadingHistory(true);
    try {
      const txs = await fetchClient('/finance/transactions?limit=250');
      if (Array.isArray(txs)) {
        const filtered = txs.filter((tx: any) => {
          const hasContactLog = tx.inventory_logs?.some((log: any) => log.contact?.id === supplier.id);
          const hasNameInDesc = tx.description?.toLowerCase().includes(supplier.name.toLowerCase());
          return hasContactLog || hasNameInDesc;
        });
        setSupplierHistory(filtered);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengambil riwayat transaksi pemasok');
    } finally {
      setLoadingHistory(false);
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    current_balance: '0'
  });

  const toSentenceCase = (str: string) => {
    if (!str) return '-';
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const loadSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient('/inventory/contacts?contact_type=supplier');
      if (Array.isArray(data)) {
        const mappedSuppliers: Supplier[] = data.map((supp: any) => ({
          id: supp.id,
          code: `SPL-${supp.id.toString().padStart(3, '0')}`,
          name: supp.name,
          phone: supp.phone || '',
          address: supp.address || '',
          outstanding_balance: Number(supp.current_balance)
        }));
        setSuppliers(mappedSuppliers);
      } else {
        throw new Error('Format data tidak didukung');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat data pemasok';
      setError(msg);
      toast.error('Error', { description: msg });
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleAdd = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      phone: '',
      address: '',
      current_balance: '0'
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      current_balance: supplier.outstanding_balance.toString()
    });
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Gagal', { description: 'Nama pemasok wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        contact_type: 'supplier',
        phone: formData.phone || null,
        address: formData.address || null,
        current_balance: parseFloat(formData.current_balance) || 0
      };

      if (editingSupplier) {
        await fetchClient(`/inventory/contacts/${editingSupplier.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        toast.success('Berhasil', { description: `Pemasok ${formData.name} berhasil diperbarui.` });
      } else {
        await fetchClient('/inventory/contacts', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast.success('Berhasil', { description: `Pemasok ${formData.name} berhasil ditambahkan.` });
      }
      setIsDialogOpen(false);
      loadSuppliers();
    } catch (err: any) {
      toast.error('Gagal', { description: err.message || 'Gagal menyimpan pemasok' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async (id: number, name: string) => {
    try {
      await fetchClient(`/inventory/contacts/${id}`, { method: 'DELETE' });
      toast.success('Berhasil', { description: `Pemasok ${name} telah dihapus.` });
      loadSuppliers();
    } catch (err: any) {
      toast.error('Gagal', { description: err.message || `Gagal menghapus pemasok ${name}` });
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier => 
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.phone.includes(searchQuery) ||
    supplier.address.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const paginatedItems = filteredSuppliers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);


  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Pemasok</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : suppliers.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Users className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Utang Dagang</p>
              <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-500">
                {loading ? '-' : formatRp(suppliers.reduce((acc, curr) => acc + curr.outstanding_balance, 0))}
              </p>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Cari pemasok berdasarkan nama, alamat, atau kode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadSuppliers} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Pemasok
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat data pemasok...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Gagal Memuat Data</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadSuppliers} className="mt-2">Coba Lagi</Button>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Tidak ada pemasok ditemukan</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">Mulai dengan menambahkan pemasok baru.</p>
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px] py-3 pl-6">Kode</TableHead>
                    <TableHead className="py-3">Nama Pemasok</TableHead>
                    <TableHead className="py-3">Telepon</TableHead>
                    <TableHead className="py-3">Alamat</TableHead>
                    <TableHead className="text-right py-3">Sisa Utang</TableHead>
                    <TableHead className="text-center w-[100px] py-3">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((supplier) => (
                    <TableRow key={supplier.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800">
                      <TableCell className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300 py-3.5 pl-6">{supplier.code}</TableCell>
                      <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100 py-3.5">
                        <button 
                          onClick={() => handleOpenProfile(supplier)} 
                          className="hover:underline hover:text-primary text-left font-bold"
                        >
                          {toSentenceCase(supplier.name)}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs font-mono py-3.5">{supplier.phone || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-zinc-500 py-3.5">{supplier.address || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-rose-600 dark:text-rose-500 py-3.5">
                        {supplier.outstanding_balance > 0 ? formatRp(supplier.outstanding_balance) : '-'}
                      </TableCell>
                      <TableCell className="text-center py-3.5">
                        <div className="flex justify-center items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(supplier)}
                            className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteTarget(supplier)}
                            className="h-8 w-8 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                <PaginationControls totalItems={filteredSuppliers.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingSupplier ? 'Ubah Pemasok' : 'Tambah Pemasok Baru'}</DialogTitle>
              <DialogDescription>
                {editingSupplier ? 'Perbarui informasi detail pemasok.' : 'Masukkan detail pemasok baru ke database.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Pemasok</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Beras lumbung"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telepon</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Nomor telepon aktif..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Alamat</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Alamat lengkap..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="balance">Saldo Awal Utang (Rp)</Label>
                <Input
                  id="balance"
                  type="number"
                  value={formData.current_balance}
                  onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                  placeholder="Saldo utang awal..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : editingSupplier ? 'Simpan Perubahan' : 'Tambahkan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Pemasok "{deleteTarget && toSentenceCase(deleteTarget.name)}" akan dihapus secara permanen dari database master.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteTarget) {
                  confirmDelete(deleteTarget.id, deleteTarget.name);
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supplier Profile & History Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              Profil & Riwayat Pemasok
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informasi lengkap dan histori transaksi pembelian dengan pemasok ini.
            </DialogDescription>
          </DialogHeader>

          {selectedSupplier && (
            <div className="space-y-6 py-4">
              {/* Profile Card */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Nama Pemasok</p>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-200">{selectedSupplier.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Kode Pemasok</p>
                  <p className="text-xs font-mono font-semibold text-zinc-500 dark:text-zinc-400">{selectedSupplier.code}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Nomor Telepon</p>
                  <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{selectedSupplier.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Sisa Utang Dagang</p>
                  <p className="text-sm font-black text-rose-600 dark:text-rose-400">{formatRp(selectedSupplier.outstanding_balance)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Alamat</p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{selectedSupplier.address || '-'}</p>
                </div>
              </div>

              {/* Transaction History */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-300">Histori Pembelian</h4>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : supplierHistory.length > 0 ? (
                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                    {supplierHistory.map((tx: any) => (
                      <div key={tx.id} className="flex justify-between items-center p-2.5 rounded-lg border border-zinc-200 dark:border-border/30 bg-zinc-50 dark:bg-background/50 hover:bg-zinc-100 dark:hover:bg-background transition text-xs">
                        <div>
                          <p className="font-bold text-zinc-800 dark:text-zinc-200">{tx.description}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.transaction_date} | {tx.reference_no}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-zinc-900 dark:text-zinc-100">{formatRp(Number(tx.total_amount))}</p>
                          <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{tx.payment_method}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 text-center py-6">Belum ada riwayat transaksi dengan pemasok ini.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)} className="text-xs">Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
