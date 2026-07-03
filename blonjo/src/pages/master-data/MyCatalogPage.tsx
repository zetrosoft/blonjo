import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { 
  Plus, Settings2, Package, TrendingUp, RefreshCw, 
  Store, Calculator, ExternalLink, Loader2, Save 
} from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface MyCatalogItem {
  id: number;
  sku: string;
  name: string;
  base_unit: string;
  stock?: number;
  hpp?: number;
  sell_price?: number;
  auto_adjusted?: boolean;
}

export default function MyCatalogPage({ hideHeader = false }: { hideHeader?: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<MyCatalogItem[]>([]);
  const [pricingRules, setPricingRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStockMaintenance, setIsStockMaintenance] = useState(false);

  // Edit states
  const [selectedItem, setSelectedItem] = useState<MyCatalogItem | null>(null);
  const [editSellPrice, setEditSellPrice] = useState<number>(0);
  const [editHpp, setEditHpp] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [activeRule, setActiveRule] = useState<any | null>(null);
  const [editRulePayload, setEditRulePayload] = useState<any | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      // Get My Catalog (subscribed products)
      const data = await fetchClient('/inventory/my-catalog');
      setItems(data);
      
      // Get Stock Maintenance setting
      const settings = await fetchClient('/settings');
      const sm = settings.find((s: any) => s.key === 'stock_maintenance');
      setIsStockMaintenance(sm?.value === 'true');

      // Get Active Pricing Rules
      const rules = await fetchClient('/inventory/pricing-rules');
      if (Array.isArray(rules)) {
        setPricingRules(rules);
      }
    } catch (err: any) {
      toast.error(t('mc_toast_load_failed') || 'Gagal memuat katalog', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const toggleStockMaintenance = async (checked: boolean) => {
    try {
      await fetchClient('/settings', {
        method: 'POST',
        body: JSON.stringify({
          key: 'stock_maintenance',
          value: checked ? 'true' : 'false',
          description: 'Stock Maintenance Mode'
        })
      });
      setIsStockMaintenance(checked);
      toast.success(t('mc_toast_settings_saved'), { 
        description: checked ? t('mc_toast_sm_active') : t('mc_toast_sm_inactive')
      });
    } catch (err: any) {
      toast.error(t('mc_toast_settings_failed') || 'Gagal menyimpan pengaturan');
    }
  };

  const isRuleMatch = (rule: any, item: MyCatalogItem) => {
    if (!rule || !item) return false;
    if (rule.product_id === item.id) return true;
    
    // Normalisasi o -> u untuk toleransi ejaan (telur vs telor)
    const normalizeText = (txt: string) => {
      return (txt || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/o/g, 'u');
    };
    
    const payloadName = normalizeText(rule.rule_payload?.product_name);
    const itemName = normalizeText(item.name);
    if (payloadName && itemName && payloadName === itemName) return true;
    
    const ruleName = normalizeText(rule.name);
    if (ruleName && itemName && ruleName.includes(itemName)) return true;
    
    if (payloadName && itemName && (payloadName.includes(itemName) || itemName.includes(payloadName))) return true;
    
    return false;
  };

  const handleOpenEdit = (item: MyCatalogItem) => {
    setSelectedItem(item);
    setEditSellPrice(item.sell_price || 0);
    setEditHpp(item.hpp || 0);
    setEditStock(item.stock || 0);
    
    // Temukan aturan harga aktif dengan pencocokan cerdas
    const matchedRule = pricingRules.find(r => isRuleMatch(r, item));
    if (matchedRule) {
      setActiveRule(matchedRule);
      setEditRulePayload(matchedRule.rule_payload ? JSON.parse(JSON.stringify(matchedRule.rule_payload)) : null);
    } else {
      setActiveRule(null);
      setEditRulePayload(null);
    }
    
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    setSavingItem(true);
    try {
      const body: any = {
        sell_price: editSellPrice,
        hpp: editHpp,
        stock: editStock
      };
      if (activeRule && editRulePayload) {
        body.pricing_rule_payload = editRulePayload;
      }
      
      await fetchClient(`/inventory/my-catalog/${selectedItem.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      toast.success(t('mc_toast_update_success') || 'Harga & Stok berhasil diperbarui');
      setIsEditDialogOpen(false);
      loadCatalog();
    } catch (err: any) {
      toast.error(t('mc_toast_update_failed') || 'Gagal memperbarui item katalog', { description: err.message });
    } finally {
      setSavingItem(false);
    }
  };

  const getRuleSummaryText = (rule: any) => {
    const payload = rule.rule_payload;
    if (rule.rule_type === 'tiered' && payload.tiers) {
      return payload.tiers.map((tier: any) => `Beli \u2265 ${tier.qty_threshold} ${tier.unit || 'pcs'} @ ${formatRp(tier.unit_price)}`).join(', ');
    }
    if (rule.rule_type === 'bundle_multiple' && payload.bundle_rules) {
      const br = payload.bundle_rules;
      return `Beli 1 @ ${formatRp(br.base_price)}, Beli ${br.bundle_qty} @ ${formatRp(br.bundle_price)} (Kelipatan)`;
    }
    if (rule.rule_type === 'formula' && payload.multiplier) {
      return `Formula: ${payload.multiplier}x Harga Dasar`;
    }
    return t('pr_custom_logic');
  };

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('mc_title')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('mc_desc')}
            </p>
          </div>
        </div>
      )}


      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">{t('mc_my_item_list')}</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border border-border/50">
              <Store className="w-3.5 h-3.5 text-primary" />
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="stock-mt" 
                  checked={isStockMaintenance} 
                  onCheckedChange={(c: boolean) => toggleStockMaintenance(!!c)} 
                />
                <Label htmlFor="stock-mt" className="text-xs font-medium cursor-pointer m-0">
                  {t('mc_stock_maintenance')}
                </Label>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={loadCatalog}>
              <RefreshCw className="w-3.5 h-3.5" /> {t('pr_refresh_btn')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('mc_col_name')}</TableHead>
                  <TableHead className="text-right">{t('mc_col_stock')}</TableHead>
                  <TableHead className="text-right">{t('mc_col_hpp')}</TableHead>
                  <TableHead className="text-right">{t('mc_col_price')}</TableHead>
                  <TableHead className="text-center">{t('mc_col_action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10">{t('mc_loading')}</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-muted-foreground">{t('mc_empty')}</p>
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => {
                  const matchedRules = pricingRules.filter(r => isRuleMatch(r, item));
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.name}</span>
                            {item.auto_adjusted && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] font-extrabold uppercase py-0 px-1.5 leading-normal">
                                ⚠️ Auto-Adjusted
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">{item.sku}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {item.stock || 0} <span className="text-[10px] text-muted-foreground uppercase">{item.base_unit}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatRp(item.hpp || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span className="font-semibold text-primary">{formatRp(item.sell_price || 0)}</span>
                          {matchedRules.map((rule, idx) => (
                            <span 
                              key={idx} 
                              className="text-[9px] text-indigo-600 dark:text-indigo-400 mt-1 font-medium bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-800/40 max-w-[200px] truncate" 
                              title={`${rule.name}: ${getRuleSummaryText(rule)}`}
                            >
                              ⚙️ {getRuleSummaryText(rule)}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* CRUD Edit Modal */}
      {selectedItem && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[450px] border border-border/80 shadow-2xl">
            <DialogHeader className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500/90 dark:text-indigo-400">
                {t('mc_edit_catalog_title') || "Ubah Detail Produk"}
              </span>
              <DialogTitle className="text-2xl font-extrabold text-foreground tracking-tight leading-none pt-1">
                {selectedItem.name}
              </DialogTitle>
              <div className="flex items-center gap-1.5 pt-1.5">
                <Badge variant="outline" className="font-mono text-[10px] px-2 py-0.5 rounded text-muted-foreground uppercase bg-muted/30">
                  SKU: {selectedItem.sku}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px] px-2 py-0.5 rounded text-muted-foreground uppercase bg-muted/30">
                  Unit: {selectedItem.base_unit}
                </Badge>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="sell_price" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('mc_col_price') || "Harga Jual"}</Label>
                <Input 
                  id="sell_price"
                  type="number"
                  value={editSellPrice}
                  onChange={(e) => setEditSellPrice(Number(e.target.value))}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hpp" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('mc_col_hpp') || "HPP (Rata-rata)"}</Label>
                <Input 
                  id="hpp"
                  type="number"
                  value={editHpp}
                  onChange={(e) => setEditHpp(Number(e.target.value))}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('mc_col_stock') || "Stok Fisik"} ({selectedItem.base_unit})</Label>
                <Input 
                  id="stock"
                  type="number"
                  value={editStock}
                  onChange={(e) => setEditStock(Number(e.target.value))}
                  className="font-mono text-sm"
                />
              </div>

              {activeRule && editRulePayload && (
                <div className="mt-4 pt-4 border-t border-dashed space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      Aturan Harga Aktif: {activeRule.name}
                    </span>
                    <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">
                      {activeRule.rule_type.toUpperCase()}
                    </span>
                  </div>
                  
                  {activeRule.rule_type === 'tiered' && editRulePayload.tiers && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Konfigurasi Harga Bertingkat (Grosir)</Label>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {editRulePayload.tiers.map((tier: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 bg-muted/30 p-2 rounded border">
                            <div className="w-28 text-xs font-medium">
                              Qty Min: <span className="font-mono">{tier.qty_threshold}</span> {tier.unit || 'kg'}
                            </div>
                            <div className="flex-1">
                              <Input 
                                type="number"
                                value={tier.unit_price}
                                onChange={(e) => {
                                  const newTiers = [...editRulePayload.tiers];
                                  newTiers[idx].unit_price = Number(e.target.value);
                                  setEditRulePayload({ ...editRulePayload, tiers: newTiers });
                                }}
                                className="h-8 text-xs font-mono"
                                placeholder="Harga Satuan"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {activeRule.rule_type === 'bundle_multiple' && editRulePayload.bundle_rules && (
                    <div className="space-y-2 bg-muted/30 p-3 rounded border">
                      <Label className="text-xs text-muted-foreground block mb-1">Konfigurasi Promo Kelipatan</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Harga Dasar</Label>
                          <Input 
                            type="number"
                            value={editRulePayload.bundle_rules.base_price || 0}
                            onChange={(e) => {
                              setEditRulePayload({
                                ...editRulePayload,
                                bundle_rules: {
                                  ...editRulePayload.bundle_rules,
                                  base_price: Number(e.target.value)
                                }
                              });
                            }}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Harga Paket</Label>
                          <Input 
                            type="number"
                            value={editRulePayload.bundle_rules.bundle_price || 0}
                            onChange={(e) => {
                              setEditRulePayload({
                                ...editRulePayload,
                                bundle_rules: {
                                  ...editRulePayload.bundle_rules,
                                  bundle_price: Number(e.target.value)
                                }
                              });
                            }}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1 mt-1">
                        <Label className="text-[10px]">Minimal Qty Paket</Label>
                        <Input 
                          type="number"
                          value={editRulePayload.bundle_rules.bundle_qty || 0}
                          onChange={(e) => {
                            setEditRulePayload({
                              ...editRulePayload,
                              bundle_rules: {
                                ...editRulePayload.bundle_rules,
                                bundle_qty: Number(e.target.value)
                              }
                            });
                          }}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                  
                  {activeRule.rule_type === 'formula' && editRulePayload.hasOwnProperty('multiplier') && (
                    <div className="space-y-1 bg-muted/30 p-3 rounded border">
                      <Label className="text-xs text-muted-foreground">Faktor Pengali (Formula)</Label>
                      <Input 
                        type="number"
                        step="0.01"
                        value={editRulePayload.multiplier || 0}
                        onChange={(e) => {
                          setEditRulePayload({
                            ...editRulePayload,
                            multiplier: Number(e.target.value)
                          });
                        }}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={savingItem}>
                {t('btn_cancel') || 'Batal'}
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingItem} className="gap-2">
                {savingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('btn_save_changes') || 'Simpan Perubahan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
