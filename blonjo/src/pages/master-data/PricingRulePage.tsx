import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

import { Textarea } from '../../components/ui/textarea';

import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Sparkles, Wand2, Save, RotateCcw, Info, 
  Calendar, CheckCircle2, AlertCircle, Loader2,
  Trash2, Tag, Percent, Layers, HelpCircle, RefreshCw, Plus, Minus,
  Eye, Pen, Search
} from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';
import { mcpClient } from '../../api/mcpClient';
import { VoiceRecorder } from '../../components/VoiceRecorder';

interface PricingRule {
  id: number;
  product_id?: number;
  name?: string;
  rule_type: 'discount' | 'volume' | 'bundle' | 'formula' | 'tiered' | 'bundle_multiple' | 'general';
  valid_from: string;
  valid_to?: string;
  is_active: boolean;
  rule_payload: {
    product_name?: string;
    apply_to_keyword?: string;
    tiers?: Array<{
      qty_threshold: number;
      unit?: string;
      unit_price: number;
    }>;
    bundle_rules?: {
      bundle_qty: number;
      bundle_price: number;
      base_price: number;
    };
    multiplier?: number;
    custom_formula?: string;
  };
}

export default function PricingRulePage({ hideHeader = false }: { hideHeader?: boolean }) {
  const { t } = useTranslation();
  const [story, setStory] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // State for @ mention autocomplete
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const handleStoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setStory(val);
    
    // Check for @ mention
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9 ]*)$/);
    
    if (match) {
      setShowMention(true);
      setMentionQuery(match[1].toLowerCase());
      setMentionIndex(cursor - match[0].length);
    } else {
      setShowMention(false);
    }
  };
  
  const handleMentionSelect = (productName: string, productId: number) => {
    setSelectedProductId(productId.toString());
    const textBefore = story.slice(0, mentionIndex);
    const textAfter = story.slice(textareaRef.current?.selectionStart || story.length);
    const newStory = `${textBefore}${productName} ${textAfter}`;
    setStory(newStory);
    setShowMention(false);
    
    // Focus and move cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = textBefore.length + productName.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const [parsedRule, setParsedRule] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [rulesList, setRulesList] = useState<PricingRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Edit Dialog states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  // Tab & Manual Mode states
  const [inputMode, setInputMode] = useState<'ai' | 'manual'>('ai');
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [manualRuleType, setManualRuleType] = useState<'tiered' | 'bundle_multiple' | 'formula'>('tiered');
  
  // Tiered states
  const [manualTiers, setManualTiers] = useState<Array<{ qty_threshold: number; unit_price: number }>>([
    { qty_threshold: 5, unit_price: 0 }
  ]);
  
  // Bundle multiple states
  const [manualBasePrice, setManualBasePrice] = useState<number>(0);
  const [manualBundleQty, setManualBundleQty] = useState<number>(2);
  const [manualBundlePrice, setManualBundlePrice] = useState<number>(0);
  
  // Formula states
  const [manualMultiplier, setManualMultiplier] = useState<number>(1.2);

  // Load active pricing rules from database
  const loadRules = async () => {
    setLoadingRules(true);
    try {
      const data = await fetchClient('/inventory/pricing-rules');
      if (Array.isArray(data)) {
        setRulesList(data);
      } else {
        setRulesList([]);
      }
    } catch (err) {
      console.error('Failed to load pricing rules', err);
      setRulesList([]);
    } finally {
      setLoadingRules(false);
    }
  };

  // Load products for dropdown
  const loadProducts = async () => {
    try {
      const data = await fetchClient('/inventory/my-catalog');
      if (Array.isArray(data)) {
        setProducts(data);
      }
    } catch (err) {
      console.error("Failed to load products for manual rules", err);
    }
  };

  useEffect(() => {
    loadRules();
    loadProducts();
  }, []);

  // Parse helper function
  const performParse = async (textToParse: string) => {
    if (!textToParse.trim()) return;
    setIsParsing(true);
    setParsedRule(null);
    try {
      const res = await fetchClient('/inventory/pricing-rules/parse', {
        method: 'POST',
        body: JSON.stringify({ text: textToParse })
      });
      
      // Smart injection of product_id to avoid backend strict string match failures
      if (selectedProductId) {
        const prod = products.find(p => p.id.toString() === selectedProductId);
        if (prod && textToParse.includes(prod.name)) {
          res.product_id = prod.id;
          if (res.rule_payload) {
            res.rule_payload.product_name = prod.name;
          }
        }
      } else if (res.rule_payload && res.rule_payload.product_name) {
        const nameFromAI = res.rule_payload.product_name.toLowerCase();
        const matched = products.find(p => p.name.toLowerCase() === nameFromAI || nameFromAI.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(nameFromAI));
        if (matched) {
          res.product_id = matched.id;
          res.rule_payload.product_name = matched.name;
        }
      }

      setParsedRule(res);
      toast.success(t('pr_toast_backend_success_title'), { description: t('pr_toast_backend_success_desc') });
    } catch (backendErr: any) {
      console.error('Local backend parsing failed', backendErr);
      toast.error(t('pr_toast_parse_failed'), { description: backendErr.message });
    } finally {
      setIsParsing(false);
    }
  };

  const handleParse = () => {
    performParse(story);
  };

  const handleVoiceTranscript = useCallback((text: string, isInterim: boolean) => {
    setStory(text);
    if (!isInterim && text.trim()) {
      performParse(text);
    }
  }, [t]);

  const handleGenerateManualRule = () => {
    const prod = products.find(p => p.id === Number(selectedProductId));
    if (!prod) {
      toast.error(t('pr_toast_speech_not_supported') ? "Please select a product first" : "Silakan pilih produk terlebih dahulu");
      return;
    }
    
    let payload: any = {
      product_name: prod.name
    };
    
    if (manualRuleType === 'tiered') {
      payload.tiers = manualTiers.map(t => ({
        qty_threshold: Number(t.qty_threshold),
        unit: prod.base_unit,
        unit_price: Number(t.unit_price)
      }));
    } else if (manualRuleType === 'bundle_multiple') {
      payload.bundle_rules = {
        base_price: Number(manualBasePrice || prod.sell_price || 0),
        bundle_qty: Number(manualBundleQty),
        bundle_price: Number(manualBundlePrice)
      };
    } else if (manualRuleType === 'formula') {
      payload.multiplier = Number(manualMultiplier);
    }
    
    setParsedRule({
      id: parsedRule?.id, // preserve ID if editing
      name: `Aturan ${manualRuleType === 'tiered' ? 'Harga Bertingkat' : manualRuleType === 'bundle_multiple' ? 'Promo Kelipatan' : 'Formula'} ${prod.name}`,
      rule_type: manualRuleType,
      product_id: prod.id,
      valid_from: new Date().toISOString().split('T')[0],
      rule_payload: payload
    });
    
    toast.success(t('pr_toast_speech_not_supported') ? "Preview rule generated successfully!" : "Pratinjau aturan berhasil dibuat!");
  };

  const handleSave = async () => {
    if (!parsedRule) return;
    setSaving(true);
    try {
      const isUpdate = !!parsedRule.id;
      await fetchClient(isUpdate ? `/inventory/pricing-rules/${parsedRule.id}` : '/inventory/pricing-rules', {
        method: isUpdate ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: parsedRule.name,
          rule_type: parsedRule.rule_type,
          product_id: parsedRule.product_id || null,
          valid_from: parsedRule.valid_from || new Date().toISOString().split('T')[0],
          valid_to: parsedRule.valid_to || null,
          is_active: true,
          rule_payload: parsedRule.rule_payload
        })
      });
      toast.success(t('pr_toast_save_success'));
      setStory('');
      setParsedRule(null);
      loadRules();
    } catch (err: any) {
      toast.error(t('pr_toast_save_failed'), { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleEditRule = (rule: PricingRule) => {
    setEditingRuleId(rule.id);
    if (rule.product_id) setSelectedProductId(rule.product_id.toString());
    
    const ruleType = (rule.rule_type || '').toLowerCase();
    setManualRuleType(ruleType as any);
    
    let payload = rule.rule_payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        console.error('Failed to parse rule payload', e);
        payload = {};
      }
    }
    
    if (ruleType === 'tiered' && payload?.tiers) {
      setManualTiers(payload.tiers.map((t: any) => ({ qty_threshold: t.qty_threshold, unit_price: t.unit_price })));
    } else if (ruleType === 'bundle_multiple' && payload?.bundle_rules) {
      setManualBasePrice(payload.bundle_rules.base_price || 0);
      setManualBundleQty(payload.bundle_rules.bundle_qty || 2);
      setManualBundlePrice(payload.bundle_rules.bundle_price || 0);
    } else if (ruleType === 'formula' && payload?.multiplier) {
      setManualMultiplier(payload.multiplier || 1.2);
    }
    
    setIsEditDialogOpen(true);
  };

  const handleSaveEditFromDialog = async () => {
    const prod = products.find(p => p.id.toString() === selectedProductId);
    if (!prod) {
      toast.error("Pilih produk terlebih dahulu");
      return;
    }
    
    let payload: any = {
      product_name: prod.name
    };
    
    if (manualRuleType === 'tiered') {
      payload.tiers = manualTiers.map(t => ({
        qty_threshold: Number(t.qty_threshold),
        unit: prod.base_unit,
        unit_price: Number(t.unit_price)
      }));
    } else if (manualRuleType === 'bundle_multiple') {
      payload.bundle_rules = {
        base_price: Number(manualBasePrice || prod.sell_price || 0),
        bundle_qty: Number(manualBundleQty),
        bundle_price: Number(manualBundlePrice)
      };
    } else if (manualRuleType === 'formula') {
      payload.multiplier = Number(manualMultiplier);
    }
    
    setSaving(true);
    try {
      await fetchClient(`/inventory/pricing-rules/${editingRuleId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: `Aturan ${manualRuleType === 'tiered' ? 'Harga Bertingkat' : manualRuleType === 'bundle_multiple' ? 'Promo Kelipatan' : 'Formula'} ${prod.name}`,
          rule_type: manualRuleType,
          product_id: prod.id,
          valid_from: new Date().toISOString().split('T')[0],
          valid_to: null,
          is_active: true,
          rule_payload: payload
        })
      });
      toast.success(t('pr_toast_save_success') || 'Berhasil menyimpan');
      setIsEditDialogOpen(false);
      loadRules();
    } catch (err: any) {
      toast.error(t('pr_toast_save_failed') || 'Gagal menyimpan', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetchClient(`/inventory/pricing-rules/${id}`, {
        method: 'DELETE'
      });
      toast.success(t('pr_toast_delete_success'));
      loadRules();
    } catch (err: any) {
      toast.error('Failed to delete rule');
    }
  };

  const getRuleBadge = (type: PricingRule['rule_type']) => {
    switch (type) {
      case 'tiered':
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide border-0 shadow-none">{t('pr_tiered_price')}</Badge>;
      case 'bundle_multiple':
        return <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide border-0 shadow-none">{t('pr_multiple_promo')}</Badge>;
      case 'formula':
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide border-0 shadow-none">{t('pr_formula')}</Badge>;
      case 'volume':
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide border-0 shadow-none">{t('pr_volume') || 'Volume'}</Badge>;
      default:
        return <Badge className="bg-gray-600 hover:bg-gray-700 text-white rounded-full px-3 py-0.5 text-[11px] font-semibold tracking-wide border-0 shadow-none">{t('pr_custom_logic')}</Badge>;
    }
  };

  const renderPayloadSummary = (rule: PricingRule) => {
    const payload = rule.rule_payload;
    const displayName = payload.product_name || (payload.apply_to_keyword ? `Semua Varian: ${payload.apply_to_keyword}` : '');
    
    if (rule.rule_type === 'tiered' && payload.tiers) {
      return (
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-muted-foreground">{t('pr_tiered_price')} ({displayName}):</p>
          <ul className="list-disc pl-4 space-y-0.5 text-foreground">
            {payload.tiers.map((tItem, idx) => (
              <li key={idx}>
                {t('pr_buy')} &ge; {tItem.qty_threshold} {tItem.unit || 'pcs'} {" -> "} <span className="font-mono">{formatRp(tItem.unit_price)}</span>
                {tItem.qty_threshold < 1 && ` (${t('pr_fraction')})`}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (rule.rule_type === 'bundle_multiple' && payload.bundle_rules) {
      const br = payload.bundle_rules;
      return (
        <div className="text-xs">
          <p className="font-semibold text-muted-foreground">{t('pr_multiple_promo')} ({displayName}):</p>
          <p>
            {t('pr_buy')} 1 @ <span className="font-mono">{formatRp(br.base_price)}</span>, 
            {t('pr_buy')} {br.bundle_qty} @ <span className="font-mono">{formatRp(br.bundle_price)}</span> ({t('pr_multiples_apply')})
          </p>
        </div>
      );
    }

    if (rule.rule_type === 'formula' && payload.multiplier) {
      return (
        <div className="text-xs">
          <p className="font-semibold text-muted-foreground">{t('pr_formula')} ({displayName}):</p>
          <p>{t('pr_multiplier_factor')}: <span className="font-mono">{payload.multiplier}x</span> {t('pr_base_price')}</p>
        </div>
      );
    }

    return <span className="text-xs text-muted-foreground">{t('pr_custom_logic')}</span>;
  };

  const [searchQuery, setSearchQuery] = useState('');

  const addTier = () => {
    setManualTiers([...manualTiers, { qty_threshold: 0, unit_price: 0 }]);
  };

  const removeTier = (index: number) => {
    if (manualTiers.length > 1) {
      setManualTiers(manualTiers.filter((_, idx) => idx !== index));
    }
  };

  const updateTier = (index: number, key: 'qty_threshold' | 'unit_price', val: number) => {
    const updated = [...manualTiers];
    updated[index][key] = val;
    setManualTiers(updated);
  };

  const handleOpenInfo = () => {};

  // Filter rules based on search query
  const filteredRules = rulesList.filter(rule => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    
    const nameMatch = (rule.name || '').toLowerCase().includes(q);
    const typeMatch = (rule.rule_type || '').toLowerCase().includes(q);
    
    // Check inside rule payload product name
    let payloadProductMatch = false;
    const payload = rule.rule_payload;
    if (payload) {
      const pName = payload.product_name || payload.apply_to_keyword || '';
      payloadProductMatch = pName.toLowerCase().includes(q);
    }
    
    return nameMatch || typeMatch || payloadProductMatch;
  });

  const paginatedRules = filteredRules.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className={cn("space-y-6", !hideHeader && "p-6 max-w-6xl mx-auto")}>
      {!hideHeader && (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{t('pr_title')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('pr_subtitle')}
            </p>
          </div>
          <Button onClick={loadRules} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> {t('pr_refresh_btn')}
          </Button>
        </div>
      )}
      {hideHeader && (
        <div className="flex justify-end">
          <Button onClick={loadRules} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> {t('pr_refresh_btn')}
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left: Input Panel (6 cols) */}
        <div className="md:col-span-6 space-y-4">
          <Card className="border-indigo-500/20 shadow-md">
            <CardHeader className="pb-3 bg-muted/30">
              <div className="flex bg-muted p-1 rounded-lg">
                <button 
                  onClick={() => setInputMode('ai')} 
                  className={cn("flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5", 
                    inputMode === 'ai' ? "bg-background text-indigo-700 shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI & Voice
                </button>
                <button 
                  onClick={() => setInputMode('manual')} 
                  className={cn("flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5", 
                    inputMode === 'manual' ? "bg-background text-indigo-700 shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Tag className="w-3.5 h-3.5" /> Form Manual
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {inputMode === 'ai' ? (
                <>

                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      placeholder={t('pr_textarea_placeholder')}
                      value={story}
                      onChange={handleStoryChange}
                      className="min-h-[220px] bg-background border-indigo-500/20 focus-visible:ring-indigo-500/30 pr-14 text-sm leading-relaxed"
                    />
                    
                    {showMention && (
                      <div className="absolute z-30 bg-background border rounded-md shadow-lg w-64 max-h-48 overflow-y-auto" style={{ top: 'auto', bottom: '100%', left: '0' }}>
                        <div className="p-1">
                          <div className="text-xs text-muted-foreground px-2 py-1 font-semibold bg-muted/30">Pilih Produk:</div>
                          {products.filter(p => p.name.toLowerCase().includes(mentionQuery)).slice(0, 10).map(p => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950 transition-colors"
                              onClick={() => handleMentionSelect(p.name, p.id)}
                            >
                              <div className="font-medium">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{p.sku}</div>
                            </button>
                          ))}
                          {products.filter(p => p.name.toLowerCase().includes(mentionQuery)).length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground italic">Tidak ada produk cocok</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="absolute right-3 bottom-3 z-20">
                      <VoiceRecorder 
                        onTranscript={handleVoiceTranscript} 
                        disabled={isParsing || saving} 
                        initialText={story} 
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={handleParse} 
                      disabled={isParsing || !story.trim()} 
                      className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-semibold"
                    >
                      {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {isParsing ? t('pr_btn_parsing') : t('pr_btn_parse')}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => { setStory(''); setParsedRule(null); }}
                      className="border-indigo-500/20"
                    >
                      <RotateCcw className="w-4 h-4 text-indigo-500" />
                    </Button>
                  </div>
                  
                  <div className="p-3 bg-muted/60 rounded-lg text-[10px] text-muted-foreground flex gap-2 border border-muted/80">
                    <Info className="w-4 h-4 shrink-0 text-indigo-500" />
                    <p>{t('pr_rag_context')}</p>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Select Product */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Pilih Produk</Label>
                    <select 
                      value={selectedProductId} 
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">-- Pilih Produk --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>

                  {/* Rule Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Tipe Aturan</Label>
                    <select 
                      value={manualRuleType} 
                      onChange={(e) => setManualRuleType(e.target.value as any)}
                      className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="tiered">Harga Bertingkat (Tiered)</option>
                      <option value="bundle_multiple">Promo Kelipatan (Bundle)</option>
                      <option value="formula">Formula (Markup/Multiplier)</option>
                    </select>
                  </div>

                  {/* Dynamic Form Fields based on Type */}
                  {manualRuleType === 'tiered' && (
                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs font-bold">Matriks Kuantitas & Harga</Label>
                        <Button size="sm" variant="outline" onClick={addTier} className="h-7 text-xs gap-1">
                          <Plus className="w-3.5 h-3.5" /> Tambah
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {manualTiers.map((tier, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <div className="flex-1">
                              <Input 
                                type="number" 
                                placeholder="Min Qty"
                                value={tier.qty_threshold} 
                                onChange={(e) => updateTier(idx, 'qty_threshold', Number(e.target.value))}
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                            <div className="flex-[1.5]">
                              <Input 
                                type="number" 
                                placeholder="Harga Satuan" 
                                value={tier.unit_price} 
                                onChange={(e) => updateTier(idx, 'unit_price', Number(e.target.value))}
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => removeTier(idx)} disabled={manualTiers.length <= 1}>
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {manualRuleType === 'bundle_multiple' && (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Harga Dasar (Opsional)</Label>
                        <Input 
                          type="number" 
                          placeholder="Default dari sistem jika kosong" 
                          value={manualBasePrice || ''} 
                          onChange={(e) => setManualBasePrice(Number(e.target.value))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Beli Qty</Label>
                          <Input 
                            type="number" 
                            value={manualBundleQty} 
                            onChange={(e) => setManualBundleQty(Number(e.target.value))}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Harga Paket</Label>
                          <Input 
                            type="number" 
                            value={manualBundlePrice} 
                            onChange={(e) => setManualBundlePrice(Number(e.target.value))}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {manualRuleType === 'formula' && (
                    <div className="space-y-1.5 pt-2">
                      <Label className="text-xs">Faktor Pengali (Multiplier)</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={manualMultiplier} 
                        onChange={(e) => setManualMultiplier(Number(e.target.value))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  )}

                  <Button 
                    onClick={handleGenerateManualRule}
                    disabled={!selectedProductId}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 text-xs h-9 mt-4"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Buat Aturan & Pratinjau
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Parsed Preview Panel (6 cols) */}
        <div className="md:col-span-6 space-y-4">
          {/* Parsed Preview Panel */}
          {parsedRule && (
            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  {getRuleBadge(parsedRule.rule_type)}
                  <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {parsedRule.valid_from}
                  </div>
                </div>
                <CardTitle className="text-base mt-2 text-emerald-800 dark:text-emerald-300">{parsedRule.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-background/80 rounded-lg p-3 border border-emerald-500/10">
                  {renderPayloadSummary({ ...parsedRule, id: 0, is_active: true })}
                </div>

                <Button 
                  onClick={handleSave} 
                  disabled={saving} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm font-semibold"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? t('pr_saving_btn') : t('pr_save_btn')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom: Active Rules List (Full Width) */}
      <div className="space-y-4 mt-6">
          <Card className="shadow-md">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 gap-4">
              <div>
                <CardTitle className="text-lg">{t('pr_active_rules_title')}</CardTitle>
                <CardDescription className="text-xs">
                  {t('pr_active_rules_desc')}
                </CardDescription>
              </div>
              <div className="flex items-center w-full max-w-xs relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t('pr_search_placeholder') || "Cari aturan..."}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1); // Reset page on query change
                  }}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-1/4 py-3 pl-6">{t('pr_col_name_type')}</TableHead>
                      <TableHead className="w-1/2 py-3">{t('pr_col_rules_payload')}</TableHead>
                      <TableHead className="w-[15%] text-center py-3">{t('pr_col_valid')}</TableHead>
                      <TableHead className="w-[10%] text-center py-3">{t('pr_col_action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingRules ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-muted-foreground text-xs">{t('pr_loading')}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground text-xs italic pl-6">
                          {t('pr_empty')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRules.map(rule => (
                        <TableRow key={rule.id} className="hover:bg-muted/20 border-b border-border">
                          <TableCell className="align-middle py-4 pl-6">
                            <div className="space-y-1">
                              <span className="font-bold text-[15px] block text-foreground" title={rule.name}>
                                {rule.name || t('pr_default_name') || 'Aturan Harga'}
                              </span>
                              {getRuleBadge(rule.rule_type)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4">
                            {renderPayloadSummary(rule)}
                          </TableCell>
                          <TableCell className="align-top text-center py-4 text-xs font-mono text-muted-foreground">
                            {rule.valid_from}
                          </TableCell>
                          <TableCell className="align-top text-center py-4">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
                                onClick={() => handleEditRule(rule)}
                                title="Edit"
                              >
                                <Pen className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                                onClick={() => handleDelete(rule.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="px-6 py-3 border-t">
                  <PaginationControls totalItems={filteredRules.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
    
      {/* Edit Rule Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Aturan Harga</DialogTitle>
            <DialogDescription>
              Ubah aturan harga secara manual di sini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
                  {/* Select Product */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Pilih Produk</Label>
                    <select 
                      value={selectedProductId} 
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">-- Pilih Produk --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>

                  {/* Rule Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Tipe Aturan</Label>
                    <select 
                      value={manualRuleType} 
                      onChange={(e) => setManualRuleType(e.target.value as any)}
                      className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="tiered">Harga Bertingkat (Tiered)</option>
                      <option value="bundle_multiple">Promo Kelipatan (Bundle)</option>
                      <option value="formula">Formula (Markup/Multiplier)</option>
                    </select>
                  </div>

                  {/* Dynamic Form Fields based on Type */}
                  {manualRuleType === 'tiered' && (
                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs font-bold">Matriks Kuantitas & Harga</Label>
                        <Button size="sm" variant="outline" onClick={addTier} className="h-7 text-xs gap-1">
                          <Plus className="w-3.5 h-3.5" /> Tambah
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {manualTiers.map((tier, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <div className="flex-1">
                              <Input 
                                type="number" 
                                placeholder="Min Qty"
                                value={tier.qty_threshold} 
                                onChange={(e) => updateTier(idx, 'qty_threshold', Number(e.target.value))}
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                            <div className="flex-[1.5]">
                              <Input 
                                type="number" 
                                placeholder="Harga Satuan" 
                                value={tier.unit_price} 
                                onChange={(e) => updateTier(idx, 'unit_price', Number(e.target.value))}
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => removeTier(idx)} disabled={manualTiers.length <= 1}>
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {manualRuleType === 'bundle_multiple' && (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Harga Dasar (Opsional)</Label>
                        <Input 
                          type="number" 
                          placeholder="Default dari sistem jika kosong" 
                          value={manualBasePrice || ''} 
                          onChange={(e) => setManualBasePrice(Number(e.target.value))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Beli Qty</Label>
                          <Input 
                            type="number" 
                            value={manualBundleQty} 
                            onChange={(e) => setManualBundleQty(Number(e.target.value))}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Harga Paket</Label>
                          <Input 
                            type="number" 
                            value={manualBundlePrice} 
                            onChange={(e) => setManualBundlePrice(Number(e.target.value))}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {manualRuleType === 'formula' && (
                    <div className="space-y-1.5 pt-2">
                      <Label className="text-xs">Faktor Pengali (Multiplier)</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={manualMultiplier} 
                        onChange={(e) => setManualMultiplier(Number(e.target.value))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSaveEditFromDialog} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
