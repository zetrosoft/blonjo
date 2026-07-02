import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import {
  Receipt, CalendarDays, Clock, User2, Users,
  Edit2, Trash2, Save, BookOpen, RefreshCw, Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchClient } from '../../../api/client';
import { cn, formatRp, formatDateTime } from '../../../lib/utils';
import { toast } from 'sonner';
import type { Transaction } from '../types';

interface TransactionDetailDialogProps {
  txId: number | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TransactionDetailDialog({
  txId,
  isOpen,
  onOpenChange,
  onSuccess,
}: TransactionDetailDialogProps) {
  const { t } = useTranslation();

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setIsEditing(false);
    try {
      const data = await fetchClient(`/finance/transactions/${id}`);
      setSelectedTx(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_journal_detail', { error: err.message || err }));
      onOpenChange(false);
    } finally {
      setLoadingDetail(false);
    }
  }, [t, onOpenChange]);

  useEffect(() => {
    if (isOpen && txId) {
      loadDetail(txId);
    } else {
      setSelectedTx(null);
      setIsEditing(false);
    }
  }, [isOpen, txId, loadDetail]);

  const handleDelete = useCallback(async () => {
    if (!txId) return;
    try {
      await fetchClient(`/finance/transactions/${txId}`, { method: 'DELETE' });
      toast.success('Jurnal berhasil dihapus');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus jurnal');
    }
  }, [txId, onOpenChange, onSuccess]);

  const handlePost = useCallback(async () => {
    if (!txId) return;
    try {
      await fetchClient(`/finance/transactions/${txId}/post`, { method: 'POST' });
      toast.success('Jurnal berhasil diposting');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memposting jurnal');
    }
  }, [txId, onOpenChange, onSuccess]);

  const handleUnpost = useCallback(async () => {
    if (!txId) return;
    try {
      await fetchClient(`/finance/transactions/${txId}/unpost`, { method: 'POST' });
      toast.success('Posting jurnal berhasil dibatalkan (kembali ke Draft)');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membatalkan posting jurnal');
    }
  }, [txId, onOpenChange, onSuccess]);

  const startEditing = useCallback(() => {
    if (!selectedTx) return;
    setEditItems(
      selectedTx.inventory_logs?.map((log: any) => ({
        name: log.product?.name || '',
        qty: Number(log.quantity),
        unit: log.product?.unit || 'pcs',
        unit_price: Number(log.price_per_unit),
        total: Number(log.quantity) * Number(log.price_per_unit),
        contact_name: log.contact?.name || '',
      })) || []
    );
    setIsEditing(true);
  }, [selectedTx]);

  const updateEditItem = useCallback((index: number, field: string, value: any) => {
    setEditItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'qty' || field === 'unit_price') {
        next[index].total = Number(next[index].qty) * Number(next[index].unit_price);
      }
      return next;
    });
  }, []);

  const saveEditItems = useCallback(async () => {
    if (!selectedTx) return;
    setLoadingDetail(true);
    try {
      const newTotal = editItems.reduce((acc, item) => acc + Number(item.total), 0);
      await fetchClient(`/finance/transactions/${selectedTx.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: selectedTx.description,
          total_amount: newTotal,
          items: editItems,
        }),
      });
      toast.success(t('toast_success_save_store'));
      setIsEditing(false);
      onSuccess();
      loadDetail(selectedTx.id);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan perubahan');
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedTx, editItems, t, onSuccess, loadDetail]);

  const getTxTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      purchase: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      sales: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      expense: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      income: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
      operational: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      manual: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    };
    return (
      <Badge
        variant="outline"
        className={cn('capitalize px-2 py-0.5', styles[type] || 'bg-muted text-muted-foreground')}
      >
        {type.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
      posted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return (
      <Badge
        variant="outline"
        className={cn(
          'capitalize px-2 py-0.5 font-bold text-[10px]',
          styles[status] || 'bg-muted text-muted-foreground'
        )}
      >
        {t(`status_${status}`)}
      </Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto border-zinc-200 dark:border-zinc-800 p-6">
        <DialogHeader className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <DialogTitle className="text-xl font-bold flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span>{t('dialog_detail_title')}</span>
              {selectedTx && getStatusBadge(selectedTx.status)}
            </div>
            <div className="flex items-center gap-2">
              {selectedTx && selectedTx.status === 'draft' && !isEditing && (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('btn_delete_journal')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirm_title_delete_journal')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('confirm_desc_delete_journal')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-rose-600 hover:bg-rose-700"
                        >
                          {t('btn_delete_journal')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-2 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {t('btn_post_now')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirm_title_post_journal')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('confirm_desc_post_journal')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handlePost}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {t('btn_post_now')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button size="sm" variant="outline" onClick={startEditing} className="h-8 gap-2">
                    <Edit2 className="w-3.5 h-3.5" />
                    {t('btn_edit_items')}
                  </Button>
                </>
              )}
              {selectedTx && selectedTx.status === 'posted' && !isEditing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                      {t('btn_unpost_journal')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('confirm_title_unpost_journal')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('confirm_desc_unpost_journal')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleUnpost}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        {t('btn_unpost_journal')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {selectedTx && getTxTypeBadge(selectedTx.transaction_type)}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loadingDetail || !selectedTx ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('dialog_loading')}</p>
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* Header Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-150 dark:border-zinc-800">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                  <CalendarDays className="w-4 h-4 text-primary/70" />
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {t('label_date')}:
                  </span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {selectedTx.transaction_date}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Receipt className="w-4 h-4 text-primary/70" />
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {t('label_ref_no')}:
                  </span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold">
                    {selectedTx.reference_no || '-'}
                  </span>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Clock className="w-4 h-4 text-primary/70" />
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {t('label_created')}:
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {formatDateTime(selectedTx.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                  <User2 className="w-4 h-4 text-primary/70" />
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {t('label_total_amount')}:
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100 font-extrabold text-sm">
                    {formatRp(Number(selectedTx.total_amount))}
                  </span>
                </div>
              </div>
              {/* Menampilkan Supplier jika ada inventory_logs */}
              {(() => {
                const contactLog = selectedTx.inventory_logs?.find((l: any) => l.contact);
                if (!contactLog?.contact) return null;
                return (
                  <div className="col-span-1 md:col-span-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <div className="flex items-center gap-2.5 text-xs">
                      <Users className="w-4 h-4 text-primary/70" />
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {t('label_supplier_customer')}:
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-bold">
                        {contactLog.contact.name}
                      </span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 uppercase">
                        {contactLog.contact.contact_type}
                      </Badge>
                    </div>
                  </div>
                );
              })()}
              <div className="col-span-1 md:col-span-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {t('label_description')}:
                </p>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-1 bg-background p-2.5 rounded border border-zinc-100 dark:border-zinc-850">
                  {selectedTx.description}
                </p>
              </div>
            </div>

            {/* Inventory Logs Table */}
            {selectedTx.inventory_logs && selectedTx.inventory_logs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary" />
                    {t('inventory_detail_title')}
                  </h3>
                  {isEditing && (
                    <Button
                      size="sm"
                      onClick={saveEditItems}
                      disabled={loadingDetail}
                      className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {t('btn_save_changes')}
                    </Button>
                  )}
                </div>
                <div className="overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-lg">
                  <Table>
                    <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                      <TableRow>
                        <TableHead>{t('column_item_name')}</TableHead>
                        <TableHead className="text-right w-[100px]">{t('column_quantity')}</TableHead>
                        <TableHead className="text-right w-[150px]">
                          {t('column_unit_price')}
                        </TableHead>
                        <TableHead className="text-right w-[150px]">{t('column_subtotal')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!isEditing
                        ? selectedTx.inventory_logs.map((log: any, index: number) => (
                            <TableRow key={index} className="hover:bg-zinc-50/20 dark:hover:bg-zinc-900/10">
                              <TableCell className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                {log.product?.name || 'Unknown Product'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {log.quantity} {log.product?.unit}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {formatRp(Number(log.price_per_unit))}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">
                                {formatRp(Number(log.quantity) * Number(log.price_per_unit))}
                              </TableCell>
                            </TableRow>
                          ))
                        : editItems.map((item: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Input
                                  value={item.name}
                                  onChange={(e) => updateEditItem(index, 'name', e.target.value)}
                                  className="h-8 text-xs bg-background border-zinc-200"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.qty}
                                  onChange={(e) => updateEditItem(index, 'qty', e.target.value)}
                                  className="h-8 text-xs text-right bg-background border-zinc-200 font-mono"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.unit_price}
                                  onChange={(e) => updateEditItem(index, 'unit_price', e.target.value)}
                                  className="h-8 text-xs text-right bg-background border-zinc-200 font-mono"
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">
                                {formatRp(item.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Raw Journal Logs */}
            {selectedTx.entries && selectedTx.entries.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  {t('raw_journal_logs_title')}
                </h3>
                <div className="space-y-2 bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {selectedTx.entries.map((entry: any, index: number) => {
                    const account = entry.account;
                    const type = account?.account_type;
                    const isDebit = Number(entry.debit) > 0;
                    const amount = isDebit ? entry.debit : entry.credit;

                    let isIncrease = false;
                    if (['asset', 'expense'].includes(type)) {
                      isIncrease = isDebit;
                    } else {
                      isIncrease = !isDebit;
                    }

                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span>{isIncrease ? '🟢' : '🔴'}</span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            [{account?.name || 'Unknown Account'}]
                          </span>
                          <span className="text-zinc-500">
                            {isIncrease ? 'bertambah' : 'berkurang'}
                          </span>
                        </div>
                        <div className="font-mono text-xs flex items-center gap-2">
                          <span
                            className={cn(
                              'font-bold',
                              isIncrease
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            )}
                          >
                            {isIncrease ? '+' : '-'}
                            {formatRp(Number(amount))}
                          </span>
                          <span className="text-zinc-400 italic">
                            ({isDebit ? 'Debit' : 'Kredit'})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
