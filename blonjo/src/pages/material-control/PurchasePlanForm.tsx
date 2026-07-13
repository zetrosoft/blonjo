import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { 
  Sparkles, Save, Plus, Trash2, Send, 
  Pencil, Check, X, ShoppingBag, Wand2
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { parseNoteText } from '../../lib/smartParser';

interface Product {
  id: number;
  sku: string;
  name: string;
  base_unit: string;
  purchase_price?: number;
}

interface PlanItem {
  productId: number;   // 0 jika item baru yang tidak ada di master
  sku: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  supplierId: number | null;
  supplierName: string;
}

// State edit inline per baris
interface EditState {
  qty: number;
  unitPrice: number;
}

export default function PurchasePlanForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [story, setStory] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  
  // Search Autocomplete Mentions Produk
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Search Autocomplete Mentions Supplier
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<any[]>([]);
  const [showSupplierMention, setShowSupplierMention] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierIndex, setSupplierIndex] = useState(-1);

  // The draft plan items list
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [sendViaWa, setSendViaWa] = useState(false);
  const [sendViaEmail, setSendViaEmail] = useState(false);

  // Edit inline state: index → EditState
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ qty: 1, unitPrice: 0 });

  // Load products & suppliers master data on mount
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
        toast.error(t('mc_toast_load_products_failed'));
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

  // Filter products when mention query changes
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

  // Filter suppliers when supplierQuery changes
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



  // Parser tanggal otomatis dari narasi teks cerita
  const parsePlannedDateFromText = (text: string): string => {
    const today = new Date();
    const cleanText = text.toLowerCase().trim();

    // 1. Cek kata kunci besok/lusa
    if (cleanText.includes('besok')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow.toLocaleDateString('sv-SE');
    }
    if (cleanText.includes('lusa')) {
      const lusa = new Date(today);
      lusa.setDate(today.getDate() + 2);
      return lusa.toLocaleDateString('sv-SE');
    }

    // 2. Cek hari (senin s.d minggu)
    const daysOfWeek = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    for (let i = 0; i < daysOfWeek.length; i++) {
      if (cleanText.includes(daysOfWeek[i])) {
        const targetDay = i;
        const currentDay = today.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) {
          diff += 7; // Hari di minggu depan
        }
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + diff);
        return targetDate.toLocaleDateString('sv-SE');
      }
    }

    // 3. Cek format "tanggal X" atau "tgl X"
    const dateMatch = cleanText.match(/(?:tanggal|tgl)\s*(\d{1,2})/);
    if (dateMatch) {
      const dayNum = parseInt(dateMatch[1], 10);
      if (dayNum >= 1 && dayNum <= 31) {
        const targetDate = new Date(today);
        if (today.getDate() > dayNum) {
          targetDate.setMonth(today.getMonth() + 1);
        }
        targetDate.setDate(dayNum);
        return targetDate.toLocaleDateString('sv-SE');
      }
    }

    // 4. Default: hari ini + 1 (besok)
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toLocaleDateString('sv-SE');
  };

  // Logika autocomplete supplier saat diklik
  const handleSupplierSelect = (supplierName: string) => {
    if (!textareaRef.current) return;
    const textBefore = story.slice(0, supplierIndex);
    const textAfter = story.slice(textareaRef.current.selectionStart || story.length);
    
    // Deteksi trigger yang ditulis (toko / supplier) untuk mempertahankan pemisah asli
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

  // Handle typing & detecting "toko" or "supplier" word for supplier autocomplete, and backslash "\" for product autocomplete
  const handleStoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setStory(val);
    
    const cursor = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursor);
    
    // 1. Deteksi trigger product mention dengan backslash "\"
    const productMatch = textBeforeCursor.match(/\\([a-zA-Z0-9 ]*)$/);
    if (productMatch) {
      setShowMention(true);
      setMentionQuery(productMatch[1].toLowerCase());
      setMentionIndex(cursor - productMatch[0].length);
      setShowSupplierMention(false); // Sembunyikan supplier jika sedang ngetik produk
      return;
    } else {
      setShowMention(false);
    }

    // 2. Deteksi "toko" atau "supplier" diikuti pemisah spasi/titik dua dan filter query
    const match = textBeforeCursor.match(/(?:toko|supplier)(?:\s+|:\s*|:)([a-zA-Z0-9 ]*)$/i);
    if (match) {
      setShowSupplierMention(true);
      setSupplierQuery(match[1].toLowerCase());
      setSupplierIndex(cursor - match[0].length);
    } else {
      setShowSupplierMention(false);
    }
  };

  // Select item from autocomplete
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


  // Parse voice notes
  const handleVoiceTranscript = (text: string, isInterim: boolean) => {
    if (isInterim) return;

    setStory(prev => {
      const space = prev.endsWith(' ') || prev === '' ? '' : ' ';
      return prev + space + text;
    });

    const lowercaseText = text.toLowerCase();

    const searchMatch = lowercaseText.match(/(?:cari\s+item|cari|temukan)\s+([a-zA-Z0-9\s]+)/);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      setMentionQuery(query);
      setShowMention(true);
      const filtered = products.filter(p => p.name.toLowerCase().includes(query));
      setFilteredProducts(filtered);
      toast.info(t('mc_toast_searching_item_voice', { query }));
    }

    if (lowercaseText.includes('pilih')) {
      const selectMatch = lowercaseText.match(/pilih\s+(?:item\s+)?([a-zA-Z0-9\s]+)/);
      if (selectMatch) {
        const target = selectMatch[1].trim();
        const matched = products.find(p => p.name.toLowerCase().includes(target));
        if (matched) {
          handleMentionSelect(matched.name, matched.id);
          toast.success(t('mc_toast_selected_item_success', { name: matched.name }));
        } else if (filteredProducts.length > 0) {
          const first = filteredProducts[0];
          handleMentionSelect(first.name, first.id);
          toast.success(t('mc_toast_selected_item_success', { name: first.name }));
        }
      } else if (filteredProducts.length > 0) {
        const first = filteredProducts[0];
        handleMentionSelect(first.name, first.id);
        toast.success(t('mc_toast_selected_item_success', { name: first.name }));
      }
    }
  };

  // Parse free-form text using AI — overwrite existing item jika nama cocok
  const handleParseText = async () => {
    if (!story.trim()) {
      toast.warning(t('mc_toast_plan_text_empty'));
      return;
    }

    setIsParsing(true);
    try {
      const local = await parseNoteText(story);
      let result = local;
      try {
        const res: any = await fetchClient('/finance/transactions/parse', {
          method: 'POST',
          body: JSON.stringify({ text: story }),
        });
        if (res && res.parsed_data) {
          result = {
            ...local,
            ...res.parsed_data,
            items: res.parsed_data.items || local.items
          };
        }
      } catch (err) {
        console.warn('Backend parse failed, falling back to local:', err);
      }

      if (result && result.items.length > 0) {
        setPlanItems(prev => {
          const updated = [...prev];
          let addedCount = 0;
          let updatedCount = 0;

          result.items.forEach((it: any) => {
            const matched = products.find(p => 
              p.name.toLowerCase().includes(it.name.toLowerCase()) || 
              it.name.toLowerCase().includes(p.name.toLowerCase())
            );

            const newItem: PlanItem = {
              productId: matched ? matched.id : 0,
              sku: matched ? matched.sku : 'N/A',
              name: matched ? matched.name : it.name,
              qty: it.qty || 1,
              unit: it.unit || matched?.base_unit || 'pcs',
              unitPrice: it.unit_price || it.price || matched?.purchase_price || 0,
              supplierId: null,
              supplierName: result.contact_name || '-'
            };

            const existingIdx = updated.findIndex(
              p => p.name.toLowerCase() === newItem.name.toLowerCase()
            );

            if (existingIdx >= 0) {
              updated[existingIdx] = newItem;
              updatedCount++;
            } else {
              updated.push(newItem);
              addedCount++;
            }
          });

          if (updatedCount > 0) {
            toast.info(`${updatedCount} item diperbarui, ${addedCount} item ditambahkan.`);
          } else {
            toast.success(t('mc_toast_ai_extract_success', { count: addedCount }));
          }
          return updated;
        });
      } else {
        toast.warning(t('mc_toast_ai_extract_failed'));
      }
    } finally {
      setIsParsing(false);
    }
  };



  // Remove item from draft plan
  const handleRemoveItem = (index: number) => {
    setPlanItems(prev => prev.filter((_, idx) => idx !== index));
    if (editingIdx === index) setEditingIdx(null);
  };

  // Start editing a row
  const handleStartEdit = (index: number) => {
    setEditingIdx(index);
    setEditState({ qty: planItems[index].qty, unitPrice: planItems[index].unitPrice });
  };

  // Confirm edit
  const handleConfirmEdit = (index: number) => {
    setPlanItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qty: editState.qty, unitPrice: editState.unitPrice };
      return updated;
    });
    setEditingIdx(null);
  };

  // Submit purchase plan to the backend
  const handleSubmitPlan = async () => {
    if (planItems.length === 0) {
      toast.warning(t('mc_toast_plan_empty'));
      return;
    }

    try {
      const payload = {
        planned_date: parsePlannedDateFromText(story),
        send_via_wa: sendViaWa,
        send_via_email: sendViaEmail,
        items: planItems.map(item => ({
          // productId=0 artinya item baru yang tidak ada di master → backend tetap proses
          product_id: item.productId || null,
          product_name: item.productId === 0 ? item.name : undefined,
          supplier_contact_id: item.supplierId,
          qty: item.qty,
          unit_price: item.unitPrice
        }))
      };

      await fetchClient('/material-control/purchase-plans', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toast.success(t('mc_toast_plan_saved_draft'));
      navigate('/material-control/recommended');
    } catch (err: any) {
      console.error('Gagal menyimpan rencana belanja:', err);
      toast.error(`${t('mc_toast_plan_save_failed')} ${err.message || err}`);
    }
  };

  const totalEstimate = planItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);

  return (
    <div className="space-y-6 p-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{t('mc_plan_form_title')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('mc_plan_form_desc')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: input text & voice area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-visible">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                  {t('mc_plan_write_title')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t('mc_plan_write_desc')}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 relative">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={story}
                  onChange={handleStoryChange}
                  placeholder={t('mc_plan_textarea_placeholder')}
                  className="min-h-[140px] text-sm leading-relaxed p-4 font-mono"
                />

                {/* Autocomplete Product dropdown */}
                {showMention && (
                  <div className="absolute left-4 z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-popover p-1 shadow-lg backdrop-blur-md">
                    <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground border-b flex items-center justify-between">
                      <span>Pilih Produk</span>
                      <Badge variant="outline" className="text-[9px]">{filteredProducts.length} ditemukan</Badge>
                    </div>
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">Produk tidak ditemukan</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleMentionSelect(p.name, p.id)}
                          className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground text-zinc-900 dark:text-zinc-100"
                        >
                          <span className="font-medium truncate mr-2">{p.name}</span>
                          <span className="text-[10px] text-zinc-400 font-mono shrink-0">{p.sku}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* Autocomplete Supplier/Toko dropdown */}
                {showSupplierMention && (
                  <div className="absolute left-4 z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-popover p-1 shadow-lg backdrop-blur-md">
                    <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground border-b flex items-center justify-between">
                      <span>Pilih Toko / Supplier</span>
                      <Badge variant="outline" className="text-[9px]">{filteredSuppliers.length} ditemukan</Badge>
                    </div>
                    {filteredSuppliers.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">Toko/Supplier tidak ditemukan</div>
                    ) : (
                      filteredSuppliers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSupplierSelect(s.name)}
                          className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="font-medium truncate mr-2">{s.name}</span>
                          <span className="text-[10px] text-zinc-400 font-mono shrink-0">{s.phone || '-'}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Tombol proses teks AI dan Voice Recorder dipindah ke bawah textarea */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-850">
                <VoiceRecorder onTranscript={handleVoiceTranscript} />
                <button
                  type="button"
                  disabled={isParsing}
                  onClick={handleParseText}
                  className="relative group overflow-hidden rounded-lg p-[1.5px] focus:outline-none transition-all disabled:opacity-80"
                >
                  {isParsing ? (
                    <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#22d3ee_0%,#3b82f6_50%,#22d3ee_100%)]" />
                  ) : (
                    <span className="absolute inset-0 bg-indigo-600 group-hover:bg-indigo-700 transition-colors rounded-lg" />
                  )}
                  <span className={`inline-flex h-[34px] w-full items-center justify-center rounded-lg px-4 text-xs font-semibold text-white transition-all gap-1.5 z-10 relative ${
                    isParsing ? 'bg-slate-950 dark:bg-zinc-950' : 'bg-indigo-600 group-hover:bg-indigo-700'
                  }`}>
                    {isParsing ? (
                      <svg className="animate-spin h-3.5 w-3.5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <Wand2 className="w-3.5 h-3.5 text-cyan-200 group-hover:rotate-12 transition-transform" />
                    )}
                    {isParsing ? 'Parsing...' : 'Parse'}
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Draft plan items table */}
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold">{t('mc_plan_list_title')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 border-t">
              {planItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <ShoppingBag className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-500">{t('mc_plan_list_empty')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                      <TableRow>
                        <TableHead className="text-xs">{t('mc_col_product_name')}</TableHead>
                        <TableHead className="text-right text-xs">{t('mc_plan_col_qty')}</TableHead>
                        <TableHead className="text-right text-xs">{t('mc_plan_col_unit_price')}</TableHead>
                        <TableHead className="text-right text-xs">{t('mc_plan_col_subtotal')}</TableHead>
                        <TableHead className="text-center w-[100px] text-xs">{t('mc_col_action')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium text-xs">
                            <div className="flex items-center gap-1.5">
                              {item.name}
                              {item.productId === 0 && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-600">Baru</Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono">{item.sku}</span>
                          </TableCell>

                          {/* Qty — editable inline */}
                          <TableCell className="text-right text-xs font-semibold">
                            {editingIdx === idx ? (
                              <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={editState.qty}
                                onChange={e => setEditState(s => ({ ...s, qty: Number(e.target.value) }))}
                                className="h-7 w-20 text-xs text-right ml-auto"
                              />
                            ) : (
                              <>{item.qty} {item.unit}</>
                            )}
                          </TableCell>

                          {/* Unit price — editable inline */}
                          <TableCell className="text-right text-xs font-mono">
                            {editingIdx === idx ? (
                              <Input
                                type="number"
                                min="0"
                                value={editState.unitPrice}
                                onChange={e => setEditState(s => ({ ...s, unitPrice: Number(e.target.value) }))}
                                className="h-7 w-28 text-xs text-right ml-auto"
                              />
                            ) : (
                              formatRp(item.unitPrice)
                            )}
                          </TableCell>

                          <TableCell className="text-right text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {editingIdx === idx
                              ? formatRp(editState.qty * editState.unitPrice)
                              : formatRp(item.qty * item.unitPrice)
                            }
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {editingIdx === idx ? (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                    onClick={() => handleConfirmEdit(idx)}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-zinc-500 hover:bg-zinc-100"
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
                                    className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                                    onClick={() => handleStartEdit(idx)}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                    onClick={() => handleRemoveItem(idx)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
            </CardContent>
          </Card>
        </div>

        {/* Right column: Action summary panel */}
        <div className="space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm bg-gradient-to-br from-zinc-50/50 via-card to-zinc-500/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t('mc_plan_summary_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border space-y-2">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('mc_plan_total_budget')}</span>
                <div className="text-2xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
                  {formatRp(totalEstimate)}
                </div>
                <div className="text-xs text-muted-foreground">{t('mc_plan_selected_products_count', { count: planItems.length })}</div>
              </div>

              <div className="space-y-4">
                <div className="text-xs font-bold border-b pb-1.5 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> {t('mc_plan_po_channels')}
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="wa" className="text-xs cursor-pointer">{t('mc_plan_send_wa')}</Label>
                  <input
                    id="wa"
                    type="checkbox"
                    checked={sendViaWa}
                    onChange={(e) => setSendViaWa(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-primary focus:ring-primary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="email" className="text-xs cursor-pointer">{t('mc_plan_send_email')}</Label>
                  <input
                    id="email"
                    type="checkbox"
                    checked={sendViaEmail}
                    onChange={(e) => setSendViaEmail(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-primary focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <Button 
                  className="w-full font-bold gap-2" 
                  disabled={planItems.length === 0}
                  onClick={handleSubmitPlan}
                >
                  <Save className="w-4 h-4" /> {t('mc_plan_btn_save_draft')}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-xs"
                  onClick={() => navigate('/material-control/recommended')}
                >
                  {t('mc_plan_btn_back')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
