import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Edit2, Plus, RefreshCw, GitBranch, Info, Save, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface MappingLine {
  account_id: number;
  side: 'debit' | 'credit';
  value_type: string;
}

interface JournalMapping {
  id?: number;
  tenant_id?: number;
  transaction_type: string;
  description: string;
  is_active: boolean;
  lines: MappingLine[];
}

export default function JournalMappingPage() {
  const { t } = useTranslation();
  const [mappings, setMappings] = useState<JournalMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentMapping, setCurrentMapping] = useState<JournalMapping | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const TX_TYPES = [
    { value: 'purchase', label: t('tx_type_purchase') || 'Pembelian' },
    { value: 'sales', label: t('tx_type_sales') || 'Penjualan' },
    { value: 'expense', label: t('tx_type_expense') || 'Beban' },
    { value: 'income', label: t('tx_type_income') || 'Pendapatan' },
    { value: 'operational', label: t('tx_type_operational') || 'Operasional' },
    { value: 'cash_count', label: t('tx_type_cash_count') || 'Opname Kas' },
    { value: 'capital', label: t('tx_type_capital') || 'Setoran Modal' },
    { value: 'capital_withdrawal', label: 'Pengembalian Modal (Prive)' },
    { value: 'capital_reclassification', label: 'Koreksi Reklasifikasi Modal' },
    { value: 'customer_deposit', label: 'Penerimaan Uang Muka / Titipan Pelanggan' },
    { value: 'customer_withdrawal', label: 'Pengembalian Titipan Pelanggan' }
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [accData, mapData] = await Promise.all([
        fetchClient('/finance/accounts'),
        fetchClient('/finance/journal-mappings')
      ]);
      setAccounts(accData);
      setMappings(mapData);
    } catch (err: any) {
      toast.error(t('jm_load_failed') || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getAccountName = (id: number) => {
    const acc = accounts.find(a => a.id === id);
    return acc ? `[${acc.code}] ${t(acc.name)}` : `${t('jm_account_id') || 'Akun ID'}: ${id}`;
  };

  const handleOpenAdd = () => {
    setCurrentMapping({
      transaction_type: 'purchase',
      description: '',
      is_active: true,
      lines: [
        { account_id: 0, side: 'debit', value_type: 'total_amount' },
        { account_id: 0, side: 'credit', value_type: 'total_amount' }
      ]
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: JournalMapping) => {
    setCurrentMapping({ ...m, lines: m.lines.map(l => ({...l})) });
    setIsModalOpen(true);
  };

  const addLine = () => {
    if (!currentMapping) return;
    setCurrentMapping({
      ...currentMapping,
      lines: [...currentMapping.lines, { account_id: 0, side: 'debit', value_type: 'total_amount' }]
    });
  };

  const removeLine = (idx: number) => {
    if (!currentMapping) return;
    setCurrentMapping({
      ...currentMapping,
      lines: currentMapping.lines.filter((_, i) => i !== idx)
    });
  };

  const updateLine = (idx: number, field: keyof MappingLine, value: any) => {
    if (!currentMapping) return;
    const newLines = [...currentMapping.lines];
    newLines[idx] = { ...newLines[idx], [field]: value };
    setCurrentMapping({ ...currentMapping, lines: newLines });
  };

  const handleSave = async () => {
    if (!currentMapping) return;
    if (!currentMapping.description) {
      toast.error(t('jm_err_desc_required') || 'Deskripsi wajib diisi');
      return;
    }
    if (currentMapping.lines.some(l => l.account_id === 0)) {
      toast.error(t('jm_err_account_required') || 'Semua baris akun wajib dipilih');
      return;
    }

    setIsSaving(true);
    try {
      const isEdit = !!currentMapping.id;
      const url = isEdit ? `/finance/journal-mappings/${currentMapping.id}` : '/finance/journal-mappings';
      const method = isEdit ? 'PUT' : 'POST';

      await fetchClient(url, {
        method,
        body: JSON.stringify(currentMapping)
      });

      toast.success(isEdit ? (t('jm_save_update_success') || 'Mapping diperbarui') : (t('jm_save_create_success') || 'Mapping berhasil dibuat'));
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(t('jm_save_failed') || 'Gagal menyimpan', { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('jm_delete_confirm') || 'Hapus mapping ini?')) return;
    try {
      await fetchClient(`/finance/journal-mappings/${id}`, { method: 'DELETE' });
      toast.success(t('jm_delete_success') || 'Mapping dihapus');
      loadData();
    } catch (err: any) {
      toast.error(t('jm_delete_failed') || 'Gagal menghapus');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('menu_journal_mapping') || 'Mapping Jurnal Otomatis'}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('jm_subtitle') || 'Kelola template akun untuk setiap tipe transaksi AI secara dinamis.'}
            </p>
          </div>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="w-4 h-4 mr-2" />
          {t('jm_add') || 'Tambah Mapping'}
        </Button>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-10 h-10 animate-spin text-primary opacity-20" />
          </div>
        ) : mappings.length === 0 ? (
          <Card className="border-dashed border-2 py-20 text-center">
            <div className="space-y-2">
              <Info className="w-10 h-10 text-muted-foreground mx-auto opacity-20" />
              <p className="text-muted-foreground">{t('jm_empty') || 'Belum ada mapping jurnal di database.'}</p>
            </div>
          </Card>
        ) : mappings.map((m) => (
          <Card key={m.id} className="border-border/60 overflow-hidden hover:border-emerald-500/30 transition-colors">
            <CardHeader className="bg-muted/30 pb-3 flex flex-row items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase font-mono text-[10px] tracking-widest bg-background">
                    {m.transaction_type}
                  </Badge>
                  <CardTitle className="text-base font-bold">{m.description}</CardTitle>
                  {!m.tenant_id && <Badge className="text-[9px] bg-zinc-500/10 text-zinc-500 border-none">{t('jm_global_template') || 'Global Template'}</Badge>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(m)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                {m.tenant_id && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-500/5" onClick={() => m.id && handleDelete(m.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground">{t('jm_col_account') || 'Akun Transaksi'}</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground text-center w-[100px]">{t('jm_col_side') || 'Posisi'}</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground text-right w-[150px]">{t('jm_col_value_type') || 'Tipe Nilai'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.lines.map((line, idx) => (
                    <TableRow key={idx} className="hover:bg-transparent border-border/40">
                      <TableCell className="py-2 text-sm font-medium">
                        {getAccountName(line.account_id)}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Badge variant="secondary" className={cn(
                          "text-[10px] font-bold px-2 py-0",
                          line.side === 'debit' ? "text-emerald-500 bg-emerald-500/5" : "text-rose-500 bg-rose-500/5"
                        )}>
                          {line.side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right text-xs font-mono text-muted-foreground opacity-60">
                        {line.value_type}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Editor Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{currentMapping?.id ? (t('jm_edit_title') || 'Edit Mapping Jurnal') : (t('jm_new_title') || 'Tambah Mapping Baru')}</DialogTitle>
            <DialogDescription>{t('jm_dialog_desc') || 'Template ini digunakan AI untuk membentuk jurnal otomatis.'}</DialogDescription>
          </DialogHeader>

          {currentMapping && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('jm_label_tx_type') || 'Tipe Transaksi'}</Label>
                  <Select 
                    value={currentMapping.transaction_type} 
                    onValueChange={(v) => setCurrentMapping({...currentMapping, transaction_type: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('jm_placeholder_type') || 'Pilih Tipe'} />
                    </SelectTrigger>
                    <SelectContent>
                      {TX_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('jm_label_desc') || 'Nama Template / Deskripsi'}</Label>
                  <Input 
                    value={currentMapping.description}
                    onChange={(e) => setCurrentMapping({...currentMapping, description: e.target.value})}
                    placeholder={t('jm_placeholder_desc') || 'Contoh: Penjualan Kas Utama'}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase font-bold text-muted-foreground tracking-widest">{t('jm_label_lines') || 'Detail Baris Akun'}</Label>
                  <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-[10px]">
                    <Plus className="w-3 h-3 mr-1" /> {t('jm_add_row') || 'Tambah Baris'}
                  </Button>
                </div>
                
                <div className="space-y-2 overflow-y-auto max-h-[300px] pr-2">
                  {currentMapping.lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-muted/20 p-2 rounded-lg border border-border/40">
                      <div className="flex-1">
                        <Select 
                          value={line.account_id ? line.account_id.toString() : ""} 
                          onValueChange={(v) => updateLine(idx, 'account_id', parseInt(v))}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder={t('jm_placeholder_account') || 'Pilih Akun'} />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id.toString()}>
                                <span className="font-mono">[{acc.code}]</span> {t(acc.name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-[110px]">
                        <Select 
                          value={line.side} 
                          onValueChange={(v) => updateLine(idx, 'side', v)}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debit">DEBIT</SelectItem>
                            <SelectItem value="credit">KREDIT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-rose-500"
                        onClick={() => removeLine(idx)}
                        disabled={currentMapping.lines.length <= 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t('common_cancel')}</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('common_save') || 'Simpan Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-600/80 leading-relaxed">
          <p className="font-bold mb-1 uppercase tracking-wider">{t('jm_info_title') || 'Otomatisasi Aktif:'}</p>
          {t('jm_info_desc') || 'Perubahan pada mapping ini akan langsung berdampak pada hasil inputan AI dan Voice Recorder. Sistem akan menggunakan mapping paling spesifik milik toko Anda jika tersedia.'}
        </div>
      </div>
    </div>
  );
}
