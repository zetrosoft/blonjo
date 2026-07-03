import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Sparkles, Wand2, Save, RotateCcw, Info, 
  Calendar, CheckCircle2, AlertCircle, Loader2,
  Trash2, Tag, Percent, Layers, HelpCircle, RefreshCw, Plus, Minus
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
  const [parsedRule, setParsedRule] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [rulesList, setRulesList] = useState<PricingRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

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
      await fetchClient('/inventory/pricing-rules', {
        method: 'POST',
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
        return <Badge className="bg-blue-500 hover:bg-blue-600">{t('pr_tiered_price')}</Badge>;
      case 'bundle_multiple':
        return <Badge className="bg-indigo-500 hover:bg-indigo-600">{t('pr_multiple_promo')}</Badge>;
      case 'formula':
        return <Badge className="bg-purple-500 hover:bg-purple-600">{t('pr_formula')}</Badge>;
      case 'volume':
        return <Badge className="bg-amber-500 hover:bg-amber-600">{t('pr_volume') || 'Volume'}</Badge>;
      default:
        return <Badge className="bg-gray-500 hover:bg-gray-600">{t('pr_custom_logic')}</Badge>;
    }
  };

  const renderPayloadSummary = (rule: PricingRule) => {
    const payload = rule.rule_payload;
    const displayName = payload.product_name || (payload.apply_to_keyword ? `Semua Varian: ${payload.apply_to_keyword}` : '');
    
    if (rule.rule_type === 'tiered' && payload.tiers) {
      return (
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-muted-foreground">{t('pr_tiered_price')} ({displayName}):</p>
          <ul className="list-disc list-inside space-y-0.5">
            {payload.tiers.map((tItem, idx) => (
              <li key={idx}>
                {t('pr_buy')} &ge; {tItem.qty_threshold} {tItem.unit || 'pcs'} &rarr; <span className="font-mono">{formatRp(tItem.unit_price)}</span>
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
        {/* Left: Input Panel (5 cols) */}
        <div className="md:col-span-5 space-y-4">
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
                      placeholder={t('pr_textarea_placeholder')}
                      value={story}
                      onChange={(e) => setStory(e.target.value)}
                      className="min-h-[220px] bg-background border-indigo-500/20 focus-visible:ring-indigo-500/30 pr-14 text-sm leading-relaxed"
                    />
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

        {/* Right: Active Rules List (7 cols) */}
        <div className="md:col-span-7 space-y-4">
          <Card className="shadow-md">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">{t('pr_active_rules_title')}</CardTitle>
                <CardDescription className="text-xs">
                  {t('pr_active_rules_desc')}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto border rounded-md max-h-[500px]">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-[120px]">{t('pr_col_name_type')}</TableHead>
                      <TableHead>{t('pr_col_rules_payload')}</TableHead>
                      <TableHead className="w-[100px] text-center">{t('pr_col_valid')}</TableHead>
                      <TableHead className="w-[70px] text-center">{t('pr_col_action')}</TableHead>
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
                    ) : rulesList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground text-xs italic">
                          {t('pr_empty')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      rulesList.map(rule => (
                        <TableRow key={rule.id} className="hover:bg-muted/20">
                          <TableCell className="align-top py-3">
                            <div className="space-y-1">
                              <span className="font-semibold text-sm block truncate max-w-[120px]" title={rule.name}>
                                {rule.name || t('pr_default_name') || 'Aturan Harga'}
                              </span>
                              {getRuleBadge(rule.rule_type)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-3">
                            {renderPayloadSummary(rule)}
                          </TableCell>
                          <TableCell className="align-top text-center py-3 text-xs font-mono text-muted-foreground">
                            {rule.valid_from}
                          </TableCell>
                          <TableCell className="align-top text-center py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                              onClick={() => handleDelete(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
