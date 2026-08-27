import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Tag, ClipboardList, RefreshCw, AlertTriangle, Loader2, ChevronDown, ChevronRight, PackageOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

interface Category {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  base_unit: string;
  current_stock: number;
}

export default function CategoryPage() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catsData, prodsData] = await Promise.all([
        fetchClient('/inventory/categories'),
        fetchClient('/inventory/products')
      ]);

      if (Array.isArray(catsData)) {
        setCategories(catsData);
      } else {
        throw new Error('Format data kategori tidak didukung');
      }

      if (Array.isArray(prodsData)) {
        setProducts(prodsData);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      const msg = err.message || t('cat_toast_load_failed') || 'Gagal memuat data';
      setError(msg);
      toast.error(t('common_error') || 'Error', { description: msg });
      setCategories([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const toggleCategoryExpand = (catId: number) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const handleAdd = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      is_active: true
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      is_active: category.is_active
    });
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error(t('common_error') || 'Gagal', { description: t('cat_name_required') || 'Nama kategori wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await fetchClient(`/inventory/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        toast.success(t('common_success') || 'Berhasil', { description: t('cat_toast_save_success') });
      } else {
        await fetchClient('/inventory/categories', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        toast.success(t('common_success') || 'Berhasil', { description: t('cat_toast_save_success') });
      }
      setIsDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(t('common_error') || 'Gagal', { description: err.message || t('cat_toast_save_failed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async (id: number, name: string) => {
    try {
      await fetchClient(`/inventory/categories/${id}`, { method: 'DELETE' });
      toast.success(t('common_success') || 'Berhasil', { description: t('cat_toast_delete_success') });
      loadData();
    } catch (err: any) {
      toast.error(t('common_error') || 'Gagal', { description: err.message || t('cat_toast_delete_failed') });
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (cat.description && cat.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const paginatedItems = filteredCategories.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t('cat_total')}</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : categories.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Tag className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t('cat_active')}</p>
              <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-500">
                {loading ? '-' : categories.filter(c => c.is_active).length}
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <ClipboardList className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder={t('cat_search') || 'Cari kategori...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadData} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('cat_add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('cat_loading')}</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">{t('common_error_occurred') || 'Terjadi Kesalahan'}</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadData} className="mt-2">{t('common_retry') || 'Coba Lagi'}</Button>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Tag className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">{t('cat_empty')}</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{t('cat_empty_desc')}</p>
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-10 py-3 pl-6"></TableHead>
                    <TableHead className="py-3">{t('cat_col_name')}</TableHead>
                    <TableHead className="py-3">{t('cat_col_desc')}</TableHead>
                    <TableHead className="py-3">{t('cat_col_status')}</TableHead>
                    <TableHead className="text-center w-[100px] py-3 pr-6">{t('cat_col_action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((cat) => {
                    const catProducts = products.filter(p => p.category_id === cat.id);
                    const isExpanded = !!expandedCategories[cat.id];
                    return (
                      <React.Fragment key={cat.id}>
                        <TableRow className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800 transition-colors">
                          <TableCell className="py-3.5 pl-6">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => toggleCategoryExpand(cat.id)}
                              className="h-8 w-8 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 py-3.5">
                            <div className="flex items-center gap-2">
                              <span>{cat.name}</span>
                              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-bold bg-primary/5 text-primary border border-primary/10">
                                {catProducts.length} {t('cat_items_count') || 'item'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-zinc-500 py-3.5">{cat.description || '-'}</TableCell>
                          <TableCell className="py-3.5">
                            <Badge variant="outline" className={cn(
                              "px-2 py-0.5 text-xs font-semibold",
                              cat.is_active
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                            )}>
                              {cat.is_active ? t('common_active') || 'Aktif' : t('common_inactive') || 'Nonaktif'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center py-3.5 pr-6">
                            <div className="flex justify-center items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(cat)}
                                title={t('cat_edit') || 'Ubah Kategori'}
                                className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
                                title={t('common_delete') || 'Hapus Kategori'}
                                className="h-8 w-8 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Collapsible Nested Item List (Default collapse) */}
                        {isExpanded && (
                          <TableRow className="bg-zinc-50/20 dark:bg-zinc-950/20 border-b border-zinc-100 dark:border-zinc-800">
                            <TableCell colSpan={5} className="py-4 pl-12 pr-6">
                              <div className="space-y-3">
                                <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
                                  <PackageOpen className="w-4 h-4 text-primary/70" />
                                  <span className="text-[11px] font-bold uppercase tracking-wider">
                                    {t('cat_nested_items_title') || 'Daftar Barang Terkait'}
                                  </span>
                                </div>
                                
                                {catProducts.length === 0 ? (
                                  <p className="text-xs text-zinc-400 italic py-1 pl-1">
                                    {t('cat_nested_empty') || 'Belum ada barang terdaftar di kategori ini.'}
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {catProducts.map(prod => (
                                      <div 
                                        key={prod.id} 
                                        className="flex flex-col justify-between p-3 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 bg-background/50 hover:border-primary/20 hover:bg-background/80 transition-all duration-200"
                                      >
                                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{prod.name}</span>
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-900">
                                          <span className="font-mono text-[10px] text-zinc-400">{prod.sku}</span>
                                          <span className="text-[10px] font-semibold text-zinc-500">
                                            Stok: {prod.current_stock} {prod.base_unit}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                <PaginationControls totalItems={filteredCategories.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingCategory ? t('cat_edit') : t('cat_new')}</DialogTitle>
              <DialogDescription>
                {editingCategory ? t('cat_dialog_desc_edit') : t('cat_dialog_desc_new')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('cat_label_name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="EG: Bahan Makanan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('cat_label_desc')}</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detail kategori..."
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-primary cursor-pointer"
                />
                <Label htmlFor="is_active" className="cursor-pointer font-medium text-sm">{t('cat_label_active')}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t('common_cancel') || 'Batal'}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCategory ? t('common_save_changes') || 'Simpan Perubahan' : t('common_add') || 'Tambahkan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cat_delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cat_delete_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common_cancel') || 'Batal'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  confirmDelete(deleteTarget.id, deleteTarget.name);
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {t('common_delete') || 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
