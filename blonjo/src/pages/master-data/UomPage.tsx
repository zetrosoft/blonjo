import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Ruler, ClipboardList, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

interface Uom {
  id: number;
  code: string;
  name: string;
  category: 'weight' | 'volume' | 'count' | 'length';
  description: string;
  status: 'active' | 'inactive';
}

export default function UomPage() {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<Uom | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, code: string } | null>(null);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'count' as Uom['category'],
    description: '',
    status: 'active' as Uom['status']
  });

  const loadUoms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient('/inventory/uoms');
      if (Array.isArray(data)) {
        setUoms(data);
      } else {
        throw new Error('Format data tidak didukung');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat data satuan';
      setError(msg);
      toast.error('Error', { description: msg });
      setUoms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUoms();
  }, []);

  const handleAdd = () => {
    setEditingUom(null);
    setFormData({
      code: '',
      name: '',
      category: 'count',
      description: '',
      status: 'active'
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (uom: Uom) => {
    setEditingUom(uom);
    setFormData({
      code: uom.code,
      name: uom.name,
      category: uom.category,
      description: uom.description || '',
      status: uom.status
    });
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      toast.error('Gagal', { description: 'Kode dan Nama Satuan wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUom) {
        await fetchClient(`/inventory/uoms/${editingUom.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        toast.success('Berhasil', { description: `Satuan ${formData.code.toUpperCase()} berhasil diperbarui.` });
      } else {
        await fetchClient('/inventory/uoms', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        toast.success('Berhasil', { description: `Satuan ${formData.code.toUpperCase()} berhasil ditambahkan.` });
      }
      setIsDialogOpen(false);
      loadUoms();
    } catch (err: any) {
      toast.error('Gagal', { description: err.message || 'Gagal menyimpan satuan' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async (id: number, code: string) => {
    try {
      await fetchClient(`/inventory/uoms/${id}`, { method: 'DELETE' });
      toast.success('Berhasil', { description: `Satuan ${code.toUpperCase()} telah dihapus.` });
      loadUoms();
    } catch (err: any) {
      toast.error('Gagal', { description: err.message || `Gagal menghapus satuan ${code.toUpperCase()}` });
    } finally {
      setDeleteTarget(null);
    }
  };

  const getCategoryBadge = (category: Uom['category']) => {
    const configs = {
      weight: { label: 'Berat', class: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      volume: { label: 'Volume', class: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
      count: { label: 'Jumlah / Kuantitas', class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      length: { label: 'Panjang', class: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
    };
    const conf = configs[category] || configs['count'];
    return (
      <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-semibold", conf.class)}>
        {conf.label}
      </Badge>
    );
  };

  const filteredUoms = uoms.filter(uom => 
    uom.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    uom.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (uom.description && uom.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Satuan (UoM)</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : uoms.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Ruler className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Kategori Satuan</p>
              <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-500">
                {loading ? '-' : `${new Set(uoms.map(u => u.category)).size} Kategori`}
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <ClipboardList className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* UoM Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Cari kode satuan, nama, atau deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadUoms} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Satuan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat data satuan...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Gagal Memuat Data</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadUoms} className="mt-2">Coba Lagi</Button>
            </div>
          ) : filteredUoms.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Ruler className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Tidak ada satuan ditemukan</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">Klik 'Tambah Satuan' untuk membuat satuan baru.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">Kode</TableHead>
                    <TableHead>Nama Satuan</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUoms.map((uom) => (
                    <TableRow key={uom.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                      <TableCell className="font-mono text-xs font-bold text-primary">{uom.code.toUpperCase()}</TableCell>
                      <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{uom.name}</TableCell>
                      <TableCell>{getCategoryBadge(uom.category)}</TableCell>
                      <TableCell className="text-xs text-zinc-500 max-w-xs truncate">{uom.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "px-2.5 py-0.5 text-xs font-semibold",
                          uom.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                            : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                        )}>
                          {uom.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(uom)}
                            className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteTarget({ id: uom.id, code: uom.code })}
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
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingUom ? 'Ubah Satuan' : 'Tambah Satuan Baru'}</DialogTitle>
              <DialogDescription>
                {editingUom ? `Perbarui informasi satuan ${editingUom.code.toUpperCase()}.` : 'Masukkan detail satuan baru ke database.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Kode Satuan</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  disabled={!!editingUom}
                  placeholder="pcs, kg, ltr, box, dll"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nama Satuan</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Pieces, Kilogram, Liter, Box, dll"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Kategori</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val as Uom['category'] })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Kuantitas / Jumlah</SelectItem>
                    <SelectItem value="weight">Berat / Massa</SelectItem>
                    <SelectItem value="volume">Volume / Zat Cair</SelectItem>
                    <SelectItem value="length">Panjang</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Deskripsi</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Keterangan singkat..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val as Uom['status'] })}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : editingUom ? 'Simpan Perubahan' : 'Tambahkan'}
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
              Tindakan ini tidak dapat dibatalkan. Satuan {deleteTarget?.code.toUpperCase()} akan dihapus secara permanen dari database master.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteTarget) {
                  confirmDelete(deleteTarget.id, deleteTarget.code);
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
