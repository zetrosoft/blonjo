import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '../../components/ui/alert-dialog';
import {
  Sparkles, RefreshCw, ChevronDown, ChevronUp,
  ClipboardList, Plus, Trash2, Check, X, Calendar, PackageCheck, Pencil
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupedRecommendation {
  supplier_id: number;
  supplier_name: string;
  last_purchase_date: string;
  next_purchase_date: string;
  sales_visit_day: string | null;
  sales_visit_interval: number;
  items: Array<{
    product_id: number;
    product_name: string;
    sku: string;
    qty: number;
    unit: string;
    unit_price: number;
  }>;
}

interface PurchasePlanItem {
  id: number;
  product_id: number | null;
  custom_product_name: string | null;
  product_name: string;
  sku: string;
  supplier_contact_id: number | null;
  supplier_name: string | null;
  qty: number;
  unit_price: number;
  subtotal: number;
  is_purchased: boolean;
}

interface PurchasePlan {
  id: number;
  tenant_id: number;
  status: string;
  send_via_wa: boolean;
  send_via_email: boolean;
  total_amount: number;
  planned_date: string;
  created_at: string;
  items: PurchasePlanItem[];
}

// ─── Tab 1: Rekomendasi Restock ───────────────────────────────────────────────

function RekomRestock() {
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState<GroupedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingDraftId, setGeneratingDraftId] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/material-control/recommendations');
      setRecommendations(Array.isArray(data) ? data : []);
      setExpandedGroups({});
    } catch (error) {
      toast.error(t('mc_rp_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const toggleGroup = (supplierId: number) => {
    setExpandedGroups(prev => ({ ...prev, [supplierId]: !prev[supplierId] }));
  };

  const handleGeneratePurchaseDraft = async (group: GroupedRecommendation, e: React.MouseEvent) => {
    e.stopPropagation();
    setGeneratingDraftId(group.supplier_id);
    try {
      const payload = {
        supplier_id: group.supplier_id || null,
        plan_date: group.next_purchase_date !== '-' ? group.next_purchase_date : new Date().toISOString().split('T')[0],
        notes: `Auto generated draft from AI Smart Restock for ${group.supplier_name}`,
        items: group.items.map(item => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price
        }))
      };
      await fetchClient('/purchase-plans', { method: 'POST', body: JSON.stringify(payload) });
      toast.success(t('mc_rp_toast_draft_success', { name: group.supplier_name }));
      setRecommendations(prev => prev.filter(r => r.supplier_id !== group.supplier_id));
    } catch (error) {
      toast.error(t('mc_rp_toast_draft_failed', { name: group.supplier_name }));
    } finally {
      setGeneratingDraftId(null);
    }
  };

  const totalEstimatedBudget = recommendations.reduce((acc, group) => {
    const groupTotal = (group.items || []).reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
    return acc + groupTotal;
  }, 0);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-2 bg-white rounded-xl border border-zinc-200 shadow-sm">
      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm font-medium">{t('mc_rp_restock_loading')}</p>
    </div>
  );

  if (recommendations.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
      <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
        <CheckCircle className="h-6 w-6" />
      </div>
      <h3 className="font-bold text-lg text-zinc-900">{t('mc_rp_restock_empty')}</h3>
      <p className="text-muted-foreground text-sm text-center max-w-md">
        {t('mc_rp_restock_empty_desc')}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white border-none shadow-lg">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-indigo-200 to-transparent" />
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm gap-1 hover:bg-white/30">
              <Sparkles className="h-3 w-3 animate-pulse" /> AI-Powered Procurement
            </Badge>
          </div>
          <CardTitle className="text-2xl mt-2 font-extrabold tracking-tight">{t('mc_rp_budget_estimate')}</CardTitle>
          <div className="text-4xl font-bold font-mono mt-2">{formatRp(totalEstimatedBudget)}</div>
        </CardHeader>
      </Card>

      <div className="flex justify-end">
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> {t('common_refresh')}
        </Button>
      </div>

      <div className="space-y-4">
        {recommendations.map((group, idx) => {
          const groupCost = (group.items || []).reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
          const isExpanded = !!expandedGroups[group.supplier_id];
          return (
            <Card key={group.supplier_id || idx} className="border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <CardHeader
                className="bg-zinc-50/60 dark:bg-zinc-900/30 py-4 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => toggleGroup(group.supplier_id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronUp className="h-5 w-5 text-zinc-500" /> : <ChevronDown className="h-5 w-5 text-zinc-500" />}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-bold text-base text-zinc-900 dark:text-zinc-50">{group.supplier_name}</span>
                    <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">|</span>
                    <span className="text-sm text-muted-foreground">
                      {t('mc_rp_last_purchase')}: <strong className="text-zinc-700 dark:text-zinc-300">{group.last_purchase_date}</strong>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">|</span>
                    <span className="text-sm text-muted-foreground">
                      {t('mc_rp_next_purchase')}: <strong className="text-emerald-600 dark:text-emerald-400">{group.next_purchase_date}</strong>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-8 sm:pl-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatRp(groupCost)}</p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                    onClick={(e) => handleGeneratePurchaseDraft(group, e)}
                    disabled={generatingDraftId === group.supplier_id}
                  >
                    {generatingDraftId === group.supplier_id ? (
                      <><RefreshCw className="h-3 w-3 animate-spin" /> {t('common_processing')}...</>
                    ) : (
                      <>{t('mc_rp_create_draft')} <ArrowRight className="h-3 w-3" /></>
                    )}
                  </Button>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="w-full overflow-x-auto">
                    <Table className="w-full border-collapse">
                      <TableHeader className="bg-white dark:bg-zinc-950">
                        <TableRow>
                          <TableHead className="w-[60px] pl-6 py-2.5 text-xs font-bold">No</TableHead>
                          <TableHead className="py-2.5 text-xs font-bold">{t('mc_rp_col_product')}</TableHead>
                          <TableHead className="text-right py-2.5 text-xs font-bold">{t('mc_rp_col_qty')}</TableHead>
                          <TableHead className="text-center py-2.5 text-xs font-bold">{t('mc_rp_col_unit')}</TableHead>
                          <TableHead className="text-right py-2.5 text-xs font-bold">{t('mc_rp_col_price')}</TableHead>
                          <TableHead className="text-right pr-6 py-2.5 text-xs font-bold">{t('mc_rp_col_total')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(group.items || []).map((item, itemIdx) => (
                          <TableRow key={item.product_id} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20">
                            <TableCell className="pl-6 py-3 font-semibold text-zinc-500 text-xs">{itemIdx + 1}</TableCell>
                            <TableCell className="py-3 font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                              {item.product_name}
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.sku || '-'}</div>
                            </TableCell>
                            <TableCell className="py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">{item.qty}</TableCell>
                            <TableCell className="py-3 text-center text-xs text-muted-foreground uppercase">{item.unit}</TableCell>
                            <TableCell className="py-3 text-right text-xs">{formatRp(item.unit_price)}</TableCell>
                            <TableCell className="py-3 pr-6 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              {formatRp(item.qty * item.unit_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab 2: List Rencana Belanja ───────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
  pending_approval: { label: 'Menunggu Approval', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Disetujui', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'Selesai', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancelled: { label: 'Dibatalkan', className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ListRencanaBelanja() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlans, setExpandedPlans] = useState<Record<number, boolean>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [planToDelete, setPlanToDelete] = useState<number | null>(null);

  const [checkedItems, setCheckedItems] = useState<Record<number, Set<number>>>({});
  const [editingQty, setEditingQty] = useState<Record<number, string>>({});

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/material-control/purchase-plans');
      const sorted = (data || []).sort((a: PurchasePlan, b: PurchasePlan) =>
        new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime()
      );
      setPlans(sorted);
      const initChecked: Record<number, Set<number>> = {};
      sorted.forEach((p: PurchasePlan) => { initChecked[p.id] = new Set(); });
      setCheckedItems(initChecked);
    } catch (err) {
      toast.error(t('mc_rp_plans_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlans(); }, []);

  const togglePlan = (id: number) => {
    setExpandedPlans(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleItemCheck = (planId: number, itemId: number) => {
    setCheckedItems(prev => {
      const current = new Set(prev[planId] || []);
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...prev, [planId]: current };
    });
  };

  const toggleCheckAll = (plan: PurchasePlan) => {
    setCheckedItems(prev => {
      const current = prev[plan.id] || new Set<number>();
      const allIds = plan.items.map(it => it.id);
      const allChecked = allIds.every(id => current.has(id));
      return { ...prev, [plan.id]: allChecked ? new Set() : new Set(allIds) };
    });
  };

  const handleDelete = async () => {
    if (!planToDelete) return;
    setDeletingId(planToDelete);
    try {
      await fetchClient(`/material-control/purchase-plans/${planToDelete}`, { method: 'DELETE' });
      toast.success(t('mc_rp_plans_delete_success'));
      setPlans(prev => prev.filter(p => p.id !== planToDelete));
    } catch (err) {
      toast.error(t('mc_rp_plans_delete_failed'));
    } finally {
      setDeletingId(null);
      setPlanToDelete(null);
    }
  };

  const handleApprove = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingId(id);
    try {
      await fetchClient(`/material-control/purchase-plans/${id}/approve`, { method: 'POST' });
      toast.success(t('mc_rp_plans_approve_success'));
      loadPlans();
    } catch (err) {
      toast.error(t('mc_rp_plans_approve_failed'));
    } finally {
      setApprovingId(null);
    }
  };

  const handlePartialComplete = async (plan: PurchasePlan, e: React.MouseEvent) => {
    e.stopPropagation();
    const checked = checkedItems[plan.id] || new Set<number>();
    if (checked.size === 0) {
      toast.warning(t('mc_rp_plans_select_item'));
      return;
    }
    setExecutingId(plan.id);
    try {
      await fetchClient(`/material-control/purchase-plans/${plan.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          purchased_item_ids: Array.from(checked),
          complete_plan: false
        })
      });
      toast.success(t('mc_rp_plans_execute_success'));
      setCheckedItems(prev => ({ ...prev, [plan.id]: new Set() }));
      loadPlans();
    } catch (err) {
      toast.error(t('mc_rp_plans_execute_failed'));
    } finally {
      setExecutingId(null);
    }
  };

  const handleComplete = async (plan: PurchasePlan, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutingId(plan.id);
    try {
      await fetchClient(`/material-control/purchase-plans/${plan.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          purchased_item_ids: plan.items.map(it => it.id),
          complete_plan: true
        })
      });
      toast.success(t('mc_rp_plans_complete_success'));
      setCheckedItems(prev => ({ ...prev, [plan.id]: new Set() }));
      loadPlans();
    } catch (err) {
      toast.error(t('mc_rp_plans_complete_failed'));
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AlertDialog open={!!planToDelete} onOpenChange={() => setPlanToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mc_rp_plans_delete_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('mc_rp_plans_delete_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common_cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600">{t('common_delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('mc_rp_plans_desc')}</p>
        <div className="flex gap-2">
          <Button onClick={loadPlans} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> {t('common_refresh')}
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => navigate('/material-control/purchase-plan')}
          >
            <Plus className="h-3.5 w-3.5" /> {t('mc_rp_plans_new')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 bg-white rounded-xl border border-zinc-200 shadow-sm">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">{t('mc_rp_plans_loading')}</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mb-2">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h3 className="font-bold text-lg text-zinc-900">{t('mc_rp_plans_empty')}</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => {
            const statusInfo = STATUS_LABELS[plan.status?.toLowerCase()] || { label: plan.status, className: 'bg-zinc-100 text-zinc-600' };
            const isExpanded = !!expandedPlans[plan.id];
            const isOverdue = new Date(plan.planned_date) < new Date(new Date().setHours(0, 0, 0, 0));
            const isActive = plan.status !== 'completed' && plan.status !== 'COMPLETED' && plan.status !== 'cancelled';
            const planChecked = checkedItems[plan.id] || new Set<number>();
            const allIds = plan.items.map(it => it.id);
            const allChecked = allIds.length > 0 && allIds.every(id => planChecked.has(id));
            const someChecked = planChecked.size > 0 && !allChecked;

            return (
              <Card key={plan.id} className="border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <CardHeader
                  className="bg-zinc-50/60 dark:bg-zinc-900/30 py-3.5 px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer hover:bg-zinc-100/50 transition-colors"
                  onClick={() => togglePlan(plan.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 font-mono">
                          PP-{String(plan.id).padStart(5, '0')}
                        </span>
                        <Badge className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>
                          {statusInfo.label}
                        </Badge>
                        {isOverdue && isActive && (
                          <Badge className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            {t('mc_rp_overdue')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('mc_rp_date')}: <strong className="text-zinc-700 dark:text-zinc-300 ml-1">{formatDate(plan.planned_date)}</strong>
                        </span>
                        <span>•</span>
                        <span>{plan.items?.length || 0} {t('mc_rp_items')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-7 sm:pl-0" onClick={e => e.stopPropagation()}>
                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono mr-1">
                      {formatRp(plan.total_amount)}
                    </p>

                    {(plan.status === 'draft' || plan.status === 'pending_approval') && (
                      <Button
                        size="sm" variant="outline"
                        className="gap-1.5 h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
                        onClick={(e) => handleApprove(plan.id, e)}
                        disabled={approvingId === plan.id}
                      >
                        {approvingId === plan.id
                          ? <RefreshCw className="h-3 w-3 animate-spin" />
                          : <Check className="h-3 w-3" />}
                        {t('common_approve')}
                      </Button>
                    )}

                    <Button
                      size="sm" variant="ghost"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={() => setPlanToDelete(plan.id)}
                      disabled={deletingId === plan.id}
                    >
                      {deletingId === plan.id
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-0 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="w-full overflow-x-auto">
                      <Table className="w-full border-collapse">
                        <TableHeader className="bg-white dark:bg-zinc-950">
                          <TableRow>
                            <TableHead className="w-[46px] pl-5 py-2.5 text-xs">
                              {isActive && (
                                <input
                                  type="checkbox"
                                  checked={allChecked}
                                  ref={el => { if (el) el.indeterminate = someChecked; }}
                                  onChange={() => toggleCheckAll(plan)}
                                  className="w-4 h-4 rounded border-zinc-300 text-indigo-600 cursor-pointer"
                                />
                              )}
                            </TableHead>
                            <TableHead className="py-2.5 text-xs font-bold">{t('mc_rp_col_product')}</TableHead>
                            <TableHead className="py-2.5 text-xs font-bold">{t('mc_rp_col_supplier')}</TableHead>
                            <TableHead className="text-right py-2.5 text-xs font-bold">{t('mc_rp_col_qty')}</TableHead>
                            <TableHead className="text-right py-2.5 text-xs font-bold">{t('mc_rp_col_price')}</TableHead>
                            <TableHead className="text-right pr-5 py-2.5 text-xs font-bold">{t('mc_rp_col_total')}</TableHead>
                            <TableHead className="text-center py-2.5 text-xs font-bold">{t('mc_rp_col_status')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plan.items.map((item) => {
                            const isChecked = planChecked.has(item.id);
                            return (
                              <TableRow key={item.id} className={`hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20 ${item.is_purchased ? 'opacity-60' : ''}`}>
                                <TableCell className="pl-5 py-3 text-center">
                                  {isActive && !item.is_purchased && (
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleItemCheck(plan.id, item.id)}
                                      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 cursor-pointer"
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="py-3">
                                  <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.product_name}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{item.sku || '-'}</div>
                                </TableCell>
                                <TableCell className="py-3 text-xs text-muted-foreground">{item.supplier_name || '-'}</TableCell>
                                <TableCell className="py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">{Number(item.qty)}</TableCell>
                                <TableCell className="py-3 text-right text-xs font-mono">{formatRp(Number(item.unit_price))}</TableCell>
                                <TableCell className="py-3 pr-5 text-right text-sm font-semibold">{formatRp(Number(item.qty) * Number(item.unit_price))}</TableCell>
                                <TableCell className="py-3 text-center">
                                  {item.is_purchased ? (
                                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                      <Check className="h-2.5 w-2.5 mr-1" />{t('mc_rp_status_purchased')}
                                    </Badge>
                                  ) : (
                                    <Badge className="text-[10px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                      {t('mc_rp_status_pending')}
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {plan.items.map((item, itemIdx) => {
                                const isChecked = planChecked.has(item.id);
                                const isEditingThisQty = editingQty[item.id] !== undefined;
                                const displayQty = isEditingThisQty ? (parseFloat(editingQty[item.id]) || 0) : item.qty;

                                return (
                                  <TableRow
                                    key={item.id}
                                    className={`hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20 ${item.is_purchased ? 'opacity-60' : ''}`}
                                  >
                                    {/* Checkbox item */}
                                    <TableCell className="pl-5 py-3 text-center">
                                      {isActive && !item.is_purchased && (
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleItemCheck(plan.id, item.id)}
                                          className="w-4 h-4 rounded border-zinc-300 text-indigo-600 cursor-pointer"
                                        />
                                      )}
                                    </TableCell>

                                    <TableCell className="py-3">
                                      <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.product_name}</div>
                                      <div className="text-[10px] text-muted-foreground font-mono">{item.sku || '-'}</div>
                                    </TableCell>

                                    <TableCell className="py-3 text-xs text-muted-foreground">{item.supplier_name || '-'}</TableCell>

                                    {/* Qty — editable inline (pencil on hover) */}
                                    <TableCell className="py-3 text-right">
                                      {isEditingThisQty ? (
                                        <div className="flex items-center justify-end gap-1">
                                          <Input
                                            type="number" min="0.01" step="0.01"
                                            value={editingQty[item.id]}
                                            onChange={e => setEditingQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                                            className="h-7 w-20 text-xs text-right"
                                            autoFocus
                                          />
                                          <button
                                            className="text-emerald-600 hover:text-emerald-700"
                                            onClick={() => {
                                              const newQty = parseFloat(editingQty[item.id]);
                                              if (isNaN(newQty) || newQty <= 0) { toast.warning('Qty harus > 0'); return; }
                                              setPlans(prev => prev.map(p => {
                                                if (p.id !== plan.id) return p;
                                                return {
                                                  ...p,
                                                  items: p.items.map(it => it.id === item.id ? { ...it, qty: newQty, subtotal: newQty * Number(it.unit_price) } : it),
                                                  total_amount: p.items.reduce((s, it) => s + (it.id === item.id ? newQty * Number(it.unit_price) : Number(it.subtotal)), 0)
                                                };
                                              }));
                                              setEditingQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                            }}
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            className="text-zinc-400 hover:text-zinc-600"
                                            onClick={() => setEditingQty(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-end gap-1.5 group">
                                          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{Number(item.qty)}</span>
                                          {isActive && !item.is_purchased && (
                                            <button
                                              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600"
                                              onClick={() => setEditingQty(prev => ({ ...prev, [item.id]: String(Number(item.qty)) }))}
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>

                                    <TableCell className="py-3 text-right text-xs font-mono">{formatRp(Number(item.unit_price))}</TableCell>
                                    <TableCell className="py-3 pr-5 text-right text-sm font-semibold">{formatRp(displayQty * Number(item.unit_price))}</TableCell>

                                    <TableCell className="py-3 text-center">
                                      {item.is_purchased ? (
                                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                          <Check className="h-2.5 w-2.5 mr-1" />Dibeli
                                        </Badge>
                                      ) : (
                                        <Badge className="text-[10px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                          Belum
                                        </Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Footer action — hanya jika plan masih aktif */}
                        {isActive && (
                          <div className="flex items-center justify-between px-5 py-3 bg-zinc-50/40 dark:bg-zinc-900/20 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-xs text-muted-foreground">
                              {planChecked.size > 0
                                ? <><strong className="text-indigo-600">{planChecked.size}</strong> {t('mc_rp_items')} {t('mc_rp_status_purchased').toLowerCase()}</>
                                : t('mc_rp_check_hint')}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm" variant="outline"
                                className="gap-1.5 h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 disabled:opacity-50"
                                onClick={(e) => handlePartialComplete(plan, e)}
                                disabled={planChecked.size === 0 || executingId === plan.id}
                              >
                                {executingId === plan.id
                                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                                  : <PackageCheck className="h-3 w-3" />}
                                {t('mc_rp_btn_partial_complete')}
                              </Button>
                              <Button
                                size="sm"
                                className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={(e) => handleComplete(plan, e)}
                                disabled={executingId === plan.id}
                              >
                                {executingId === plan.id
                                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                                  : <PackageCheck className="h-3 w-3" />}
                                {t('mc_rp_btn_complete')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component: Tabbed ────────────────────────────────────────────────────

export default function RecommendedPurchase() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'restock' | 'plans'>('restock');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t('mc_rp_title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('mc_rp_subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('restock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'restock'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          {t('mc_rp_tab_restock')}
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'plans'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          {t('mc_rp_tab_plans')}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'restock' ? <RekomRestock /> : <ListRencanaBelanja />}
    </div>
  );
}

