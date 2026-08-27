import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Ruler, ClipboardList, Info, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
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
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

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
      const msg = err.message || t('uom_load_failed') || 'Gagal memuat data satuan';
      setError(msg);
      toast.error(t('common_error') || 'Error', { description: msg });
      setUoms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUoms();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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
      toast.error(t('common_error') || 'Gagal', { description: t('uom_required_fields') || 'Kode dan Nama Satuan wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUom) {
        await fetchClient(`/inventory/uoms/${editingUom.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        toast.success(t('common_success') || 'Berhasil', { description: t('uom_save_success') || 'Satuan berhasil diperbarui.' });
      } else {
        await fetchClient('/inventory/uoms', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        toast.success(t('common_success') || 'Berhasil', { description: t('uom_add_success') || 'Satuan berhasil ditambahkan.' });
      }
      setIsDialogOpen(false);
      loadUoms();
    } catch (err: any) {
      toast.error(t('common_error') || 'Gagal', { description: err.message || t('uom_save_failed') || 'Gagal menyimpan satuan' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async (id: number, code: string) => {
    try {
      await fetchClient(`/inventory/uoms/${id}`, { method: 'DELETE' });
      toast.success(t('common_success') || 'Berhasil', { description: t('uom_delete_success') || 'Satuan telah dihapus.' });
      loadUoms();
    } catch (err: any) {
      toast.error(t('common_error') || 'Gagal', { description: err.message || t('uom_delete_failed') || 'Gagal menghapus satuan' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const getCategoryBadge = (category: Uom['category']) => {
    const configs = {
      weight: { label: t('uom_cat_weight') || 'Berat', class: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      volume: { label: t('uom_cat_volume') || 'Volume', class: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
      count: { label: t('uom_cat_count') || 'Jumlah / Kuantitas', class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      length: { label: t('uom_cat_length') || 'Panjang', class: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
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
  const paginatedItems = filteredUoms.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);


  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t('uom_total_title') || 'Total Satuan (UoM)'}</p>
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
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t('uom_categories_title') || 'Kategori Satuan'}</p>
              <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-500">
                {loading ? '-' : `${new Set(uoms.map(u => u.category)).size} ${t('uom_categories_count') || 'Kategori'}`}
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
              placeholder={t('uom_search') || 'Cari kode satuan, nama, atau deskripsi...'}
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
              {t('uom_add') || 'Tambah Satuan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('uom_loading') || 'Memuat data satuan...'}</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">{t('common_error_occurred')}</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadUoms} className="mt-2">{t('common_retry')}</Button>
            </div>
          ) : filteredUoms.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Ruler className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">{t('uom_empty') || 'Tidak ada satuan ditemukan'}</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{t('uom_empty_desc') || 'Klik \'Tambah Satuan\' untuk membuat satuan baru.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">{t('uom_col_code') || 'Kode'}</TableHead>
                    <TableHead>{t('uom_col_name') || 'Nama Satuan'}</TableHead>
                    <TableHead>{t('uom_col_category') || 'Kategori'}</TableHead>
                    <TableHead>{t('uom_col_desc') || 'Deskripsi'}</TableHead>
                    <TableHead>{t('uom_col_status') || 'Status'}</TableHead>
                    <TableHead className="text-center w-[100px]">{t('uom_col_action') || 'Aksi'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((uom) => (
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
                          {uom.status === 'active' ? t('common_active') : t('common_inactive')}
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
<PaginationControls totalItems={filteredUoms.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />

            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingUom ? t('uom_edit_title') || 'Ubah Satuan' : t('uom_new_title') || 'Tambah Satuan Baru'}</DialogTitle>
              <DialogDescription>
                {editingUom ? `${t('uom_edit_desc') || 'Perbarui informasi satuan'} ${editingUom.code.toUpperCase()}.` : t('uom_new_desc') || 'Masukkan detail satuan baru ke database.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('uom_label_code') || 'Kode Satuan'}</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  disabled={!!editingUom}
                  placeholder="pcs, kg, ltr, box, dll"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t('uom_label_name') || 'Nama Satuan'}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Pieces, Kilogram, Liter, Box, dll"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('uom_label_category') || 'Kategori'}</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val as Uom['category'] })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={t('uom_placeholder_category') || 'Pilih kategori'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">{t('uom_cat_count') || 'Kuantitas / Jumlah'}</SelectItem>
                    <SelectItem value="weight">{t('uom_cat_weight') || 'Berat / Massa'}</SelectItem>
                    <SelectItem value="volume">{t('uom_cat_volume') || 'Volume / Zat Cair'}</SelectItem>
                    <SelectItem value="length">{t('uom_cat_length') || 'Panjang'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('uom_label_desc') || 'Deskripsi'}</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Keterangan singkat..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">{t('uom_label_status') || 'Status'}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val as Uom['status'] })}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder={t('uom_placeholder_status') || 'Pilih status'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('common_active')}</SelectItem>
                    <SelectItem value="inactive">{t('common_inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t('common_cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingUom ? t('common_save_changes') : t('common_add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('uom_delete_confirm_title') || 'Apakah Anda yakin?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('uom_delete_confirm_desc') || 'Tindakan ini tidak dapat dibatalkan. Satuan akan dihapus secara permanen dari database master.'} {deleteTarget && `(${deleteTarget.code.toUpperCase()})`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common_cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteTarget) {
                  confirmDelete(deleteTarget.id, deleteTarget.code);
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {t('common_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
