import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { 
  Sparkles, Save, Plus, Trash2, Send, 
  Pencil, Check, X, ShoppingBag, Wand2, Calendar,
  ArrowLeft, RefreshCw, Store, CheckCircle2
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { VoiceRecorder } from '../../components/VoiceRecorder';

interface Product {
  id: number;
  sku: string;
  name: string;
  base_unit: string;
  purchase_price?: number;
}

interface PlanItem {
  productId: number;
  sku: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  supplierId: number | null;
  supplierName: string;
  lastPurchaseDate?: string | null;
  avgIntervalDays?: number;
  estimatedStock?: number;
  depletionStatus?: 'CRITICAL' | 'LOW' | 'NORMAL' | 'NEW';
}

interface EditState {
  qty: number;
  unitPrice: number;
}

export default function PurchasePlanForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [story, setStory] = useState('');
  const [plannedDate, setPlannedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [isParsing, setIsParsing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<any[]>([]);
  const [showSupplierMention, setShowSupplierMention] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierIndex, setSupplierIndex] = useState(-1);

  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [sendViaWa, setSendViaWa] = useState(false);
  const [sendViaEmail, setSendViaEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ qty: 1, unitPrice: 0 });

  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState<number>(1);
  const [customUnit, setCustomUnit] = useState('pcs');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [customSupplierId, setCustomSupplierId] = useState<number | null>(null);

  useEffect(() => {
    fetchClient('/inventory/products')
      .then((data: any) => {
        if (Array.isArray(data)) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            sku: p.sku || 'N/A',
            name: p.name,
            base_unit: p.base_unit || 'pcs',
            purchase_price: Number(p.purchase_price) || 0
          }));
          setProducts(mapped);
        }
      })
      .catch((err) => {
        console.error('Gagal mengambil daftar produk', err);
      });

    fetchClient('/inventory/contacts?contact_type=supplier&limit=200')
      .then((data: any) => {
        if (Array.isArray(data)) {
          setSuppliers(data);
        }
      })
      .catch((err) => {
        console.error('Gagal mengambil daftar supplier', err);
      });
  }, []);

  useEffect(() => {
    if (mentionQuery.trim() === '') {
      setFilteredProducts(products.slice(0, 10));
    } else {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(mentionQuery) || 
        p.sku.toLowerCase().includes(mentionQuery)
      );
      setFilteredProducts(filtered);
    }
  }, [mentionQuery, products]);

  useEffect(() => {
    if (supplierQuery.trim() === '') {
      setFilteredSuppliers(suppliers.slice(0, 10));
    } else {
      const filtered = suppliers.filter(s => 
        s.name.toLowerCase().includes(supplierQuery)
      );
      setFilteredSuppliers(filtered);
    }
  }, [supplierQuery, suppliers]);

  const handleStoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setStory(val);
    
    const cursor = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursor);
    
    const productMatch = textBeforeCursor.match(/[\\@]([a-zA-Z0-9 ]*)$/);
    if (productMatch) {
      setShowMention(true);
      setMentionQuery(productMatch[1].toLowerCase());
      setMentionIndex(cursor - productMatch[0].length);
      setShowSupplierMention(false);
      return;
    } else {
      setShowMention(false);
    }

    const suppMatch = textBeforeCursor.match(/(?:toko|supplier)(?:\s+|:\s*|:)([a-zA-Z0-9 ]*)$/i);
    if (suppMatch) {
      setShowSupplierMention(true);
      setSupplierQuery(suppMatch[1].toLowerCase());
      setSupplierIndex(cursor - suppMatch[0].length);
    } else {
      setShowSupplierMention(false);
    }
  };

  const handleMentionSelect = (productName: string, productId: number) => {
    if (!textareaRef.current) return;
    const textBefore = story.slice(0, mentionIndex);
    const textAfter = story.slice(textareaRef.current.selectionStart || story.length);

    const newStory = `${textBefore}${productName} ${textAfter}`;
    setStory(newStory);
    setShowMention(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = textBefore.length + productName.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleSupplierSelect = (supplierName: string) => {
    if (!textareaRef.current) return;
    const textBefore = story.slice(0, supplierIndex);
    const textAfter = story.slice(textareaRef.current.selectionStart || story.length);
    
    const triggerMatch = story.slice(supplierIndex).match(/^(?:toko|supplier)(?:\s+|:\s*|:)/i);
    const triggerText = triggerMatch ? triggerMatch[0] : 'toko ';

    const newStory = `${textBefore}${triggerText}${supplierName} ${textAfter}`;
    setStory(newStory);
    setShowSupplierMention(false);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = textBefore.length + triggerText.length + supplierName.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleVoiceTranscript = (text: string, isInterim: boolean) => {
    if (isInterim) return;
    setStory(prev => {
      const space = prev.endsWith(' ') || prev === '' ? '' : ' ';
      return prev + space + text;
    });
  };

  const handleSmartNoteParse = async () => {
    if (!story.trim()) {
      toast.warning(t('mc_toast_plan_text_empty'));
      return;
    }

    setIsParsing(true);
    try {
      const res: any = await fetchClient('/material-control/smart-plan-parse', {
        method: 'POST',
        body: JSON.stringify({ text: story }),
      });

      if (res && res.items && res.items.length > 0) {
        if (res.planned_date) {
          setPlannedDate(res.planned_date);
        }

        const mappedItems: PlanItem[] = res.items.map((it: any) => ({
          productId: it.product_id || 0,
          sku: it.sku || 'N/A',
          name: it.product_name || it.custom_product_name,
          qty: it.qty || 1,
          unit: it.unit || 'pcs',
          unitPrice: it.unit_price || 0,
          supplierId: it.supplier_contact_id || null,
          supplierName: it.supplier_name || '-',
          lastPurchaseDate: it.last_purchase_date,
          avgIntervalDays: it.avg_interval_days,
          estimatedStock: it.estimated_stock,
          depletionStatus: it.depletion_status || 'NORMAL'
        }));

        setPlanItems(mappedItems);
        toast.success(t('mc_plan_toast_extracted', { count: mappedItems.length }));
      } else {
        toast.warning(t('mc_toast_ai_extract_failed'));
      }
    } catch (err: any) {
      console.error('SmartNote parsing failed:', err);
      toast.error(`Gagal menganalisis: ${err.message || err}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleRemoveItem = (index: number) => {
    setPlanItems(prev => prev.filter((_, idx) => idx !== index));
    if (editingIdx === index) setEditingIdx(null);
  };

  const handleStartEdit = (index: number) => {
    setEditingIdx(index);
    setEditState({ qty: planItems[index].qty, unitPrice: planItems[index].unitPrice });
  };

  const handleConfirmEdit = (index: number) => {
    setPlanItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qty: editState.qty, unitPrice: editState.unitPrice };
      return updated;
    });
    setEditingIdx(null);
  };

  const handleAddCustomItem = () => {
    if (!customName.trim()) {
      toast.warning('Nama item tidak boleh kosong');
      return;
    }
    const matchedSupplier = suppliers.find(s => s.id === customSupplierId);
    const newItem: PlanItem = {
      productId: 0,
      sku: 'CUSTOM',
      name: customName.trim(),
      qty: customQty,
      unit: customUnit,
      unitPrice: customPrice,
      supplierId: customSupplierId,
      supplierName: matchedSupplier ? matchedSupplier.name : '-',
      depletionStatus: 'NEW'
    };
    setPlanItems(prev => [...prev, newItem]);
    setCustomName('');
    setCustomQty(1);
    setCustomPrice(0);
    setShowAddCustom(false);
    toast.success(`${newItem.name} ditambahkan`);
  };

  const handleSubmitPlan = async () => {
    if (planItems.length === 0) {
      toast.warning(t('mc_plan_toast_empty'));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        planned_date: plannedDate,
        send_via_wa: sendViaWa,
        send_via_email: sendViaEmail,
        items: planItems.map(item => ({
          product_id: item.productId > 0 ? item.productId : null,
          custom_product_name: item.productId === 0 ? item.name : undefined,
          supplier_contact_id: item.supplierId,
          qty: item.qty,
          unit_price: item.unitPrice
        }))
      };

      await fetchClient('/material-control/purchase-plans', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toast.success(t('mc_plan_toast_saved'));
      navigate('/material-control/recommended');
    } catch (err: any) {
      console.error('Gagal menyimpan rencana belanja:', err);
      toast.error(`${t('mc_toast_plan_save_failed')} ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalEstimate = planItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-6xl mx-auto pb-20">
      {/* Clean Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/material-control/recommended')}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-indigo-500" />
            {t('mc_plan_form_title')}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border/60 px-3 py-1 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('mc_plan_target_date_label')}:</span>
            <input 
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="text-xs font-semibold bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="h-8 text-xs rounded-lg"
            onClick={() => navigate('/material-control/recommended')}
          >
            {t('mc_plan_btn_back')}
          </Button>
        </div>
      </div>

      {/* Sleek SmartNote Input Box */}
      <div className="relative rounded-xl border border-border/80 bg-card p-3 shadow-sm">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={story}
            onChange={handleStoryChange}
            placeholder={t('mc_plan_textarea_placeholder')}
            className="min-h-[85px] text-sm leading-relaxed p-2.5 border-none shadow-none focus-visible:ring-0 resize-none font-mono bg-transparent"
          />

          {isParsing && (
            <div className="absolute inset-0 z-10 bg-indigo-500/5 rounded-lg overflow-hidden border border-indigo-500/30 pointer-events-none">
              <div className="absolute left-0 w-full h-[2px] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,1)] animate-scan" />
            </div>
          )}

          {/* Autocomplete Product dropdown */}
          {showMention && (
            <div className="absolute left-2 z-50 mt-1 max-h-52 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg backdrop-blur-md">
              <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground border-b flex justify-between">
                <span>Pilih Produk</span>
                <span>{filteredProducts.length} item</span>
              </div>
              {filteredProducts.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground text-center">Tidak ditemukan</div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleMentionSelect(p.name, p.id)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent text-foreground"
                  >
                    <span className="font-medium truncate mr-2">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{p.sku}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Autocomplete Supplier dropdown */}
          {showSupplierMention && (
            <div className="absolute left-2 z-50 mt-1 max-h-52 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg backdrop-blur-md">
              <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground border-b flex justify-between">
                <span>Pilih Supplier</span>
                <span>{filteredSuppliers.length} toko</span>
              </div>
              {filteredSuppliers.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground text-center">Tidak ditemukan</div>
              ) : (
                filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSupplierSelect(s.name)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent text-foreground"
                  >
                    <span className="font-medium truncate mr-2">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{s.phone || '-'}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Action Row inside Input Box */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-1">
          <div className="flex items-center gap-2">
            <VoiceRecorder onTranscript={handleVoiceTranscript} />
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Contoh:</span>
              <button
                type="button"
                onClick={() => setStory(t('mc_plan_prompt_example_1'))}
                className="hover:underline text-indigo-600 dark:text-indigo-400 truncate max-w-[320px]"
              >
                "{t('mc_plan_prompt_example_1')}"
              </button>
            </div>
          </div>

          <Button
            type="button"
            disabled={isParsing}
            onClick={handleSmartNoteParse}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5 rounded-lg h-8 px-3.5 shadow-sm"
          >
            {isParsing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {t('mc_plan_btn_parsing')}
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                {t('mc_plan_btn_parse')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">{t('mc_plan_list_title')}</span>
            {planItems.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold">
                {planItems.length} item
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            onClick={() => setShowAddCustom(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('mc_plan_add_custom_item')}
          </Button>
        </div>

        {/* Custom Item Form */}
        {showAddCustom && (
          <div className="p-3 bg-muted/30 border-b border-border/60 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-[11px]">Nama Item</Label>
              <Input 
                placeholder="Nama barang..." 
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Qty & Satuan</Label>
              <div className="flex gap-1">
                <Input 
                  type="number"
                  min="1"
                  value={customQty}
                  onChange={(e) => setCustomQty(Number(e.target.value))}
                  className="h-7 text-xs w-14 text-right"
                />
                <Input 
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="h-7 text-xs w-14"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Harga (Rp)</Label>
              <Input 
                type="number"
                min="0"
                value={customPrice}
                onChange={(e) => setCustomPrice(Number(e.target.value))}
                className="h-7 text-xs text-right font-mono"
              />
            </div>
            <div className="flex gap-1">
              <Button size="sm" onClick={handleAddCustomItem} className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex-1">
                Tambah
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddCustom(false)} className="h-7 w-7 p-0">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {planItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingBag className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                {t('mc_plan_list_empty')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="h-8">
                    <TableHead className="text-xs font-bold pl-4 py-2">{t('mc_plan_col_product')}</TableHead>
                    <TableHead className="text-xs font-bold py-2">{t('mc_plan_col_supplier')}</TableHead>
                    <TableHead className="text-center text-xs font-bold py-2">{t('mc_plan_col_stock_est')}</TableHead>
                    <TableHead className="text-right text-xs font-bold py-2">{t('mc_plan_col_qty')}</TableHead>
                    <TableHead className="text-right text-xs font-bold py-2">{t('mc_plan_col_unit_price')}</TableHead>
                    <TableHead className="text-right text-xs font-bold py-2">{t('mc_plan_col_subtotal')}</TableHead>
                    <TableHead className="text-center w-[70px] text-xs font-bold pr-4 py-2">{t('mc_plan_col_action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planItems.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20 transition-colors h-11">
                      {/* Product */}
                      <TableCell className="font-medium text-xs pl-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-foreground">{item.name}</span>
                          {item.productId === 0 && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-600">
                              {t('mc_plan_badge_new')}
                            </Badge>
                          )}
                          {item.depletionStatus === 'CRITICAL' && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0 font-normal">
                              {t('mc_plan_badge_critical')}
                            </Badge>
                          )}
                          {item.depletionStatus === 'LOW' && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal border-amber-500 text-amber-600">
                              {t('mc_plan_badge_low')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {item.sku !== 'N/A' && item.sku !== 'CUSTOM' ? item.sku : ''}
                        </div>
                      </TableCell>

                      {/* Supplier */}
                      <TableCell className="text-xs text-muted-foreground py-2">
                        <span className="truncate max-w-[140px] block">{item.supplierName}</span>
                      </TableCell>

                      {/* Estimated Stock */}
                      <TableCell className="text-center text-xs py-2">
                        {item.estimatedStock !== undefined ? (
                          <span className="font-semibold text-foreground text-xs">{item.estimatedStock} {item.unit}</span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">-</span>
                        )}
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-right text-xs font-semibold py-2">
                        {editingIdx === idx ? (
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editState.qty}
                            onChange={e => setEditState(s => ({ ...s, qty: Number(e.target.value) }))}
                            className="h-6 w-16 text-xs text-right ml-auto font-mono"
                          />
                        ) : (
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                            {item.qty} <span className="text-muted-foreground font-normal text-[10px]">{item.unit}</span>
                          </span>
                        )}
                      </TableCell>

                      {/* Unit price */}
                      <TableCell className="text-right text-xs font-mono py-2">
                        {editingIdx === idx ? (
                          <Input
                            type="number"
                            min="0"
                            value={editState.unitPrice}
                            onChange={e => setEditState(s => ({ ...s, unitPrice: Number(e.target.value) }))}
                            className="h-6 w-24 text-xs text-right ml-auto font-mono"
                          />
                        ) : (
                          formatRp(item.unitPrice)
                        )}
                      </TableCell>

                      {/* Subtotal */}
                      <TableCell className="text-right text-xs font-mono font-bold text-foreground py-2">
                        {editingIdx === idx
                          ? formatRp(editState.qty * editState.unitPrice)
                          : formatRp(item.qty * item.unitPrice)
                        }
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-center pr-4 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          {editingIdx === idx ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-green-600 hover:bg-green-50"
                                onClick={() => handleConfirmEdit(idx)}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground"
                                onClick={() => setEditingIdx(null)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-blue-500 hover:bg-blue-50"
                                onClick={() => handleStartEdit(idx)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-500 hover:bg-red-50"
                                onClick={() => handleRemoveItem(idx)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Integrated Summary & Action Footer */}
          {planItems.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-t border-border/50">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mr-2">
                    {t('mc_plan_total_budget')}:
                  </span>
                  <span className="text-base sm:text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {formatRp(totalEstimate)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={sendViaWa}
                      onChange={(e) => setSendViaWa(e.target.checked)}
                      className="rounded border-border text-indigo-600 w-3.5 h-3.5"
                    />
                    WA
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={sendViaEmail}
                      onChange={(e) => setSendViaEmail(e.target.checked)}
                      className="rounded border-border text-indigo-600 w-3.5 h-3.5"
                    />
                    Email
                  </label>
                </div>

                <Button 
                  disabled={isSubmitting}
                  onClick={handleSubmitPlan}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5 rounded-lg h-8 px-4 shadow-sm"
                >
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {t('mc_plan_btn_save_draft')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
