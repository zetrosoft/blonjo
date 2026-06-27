import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
  Plus, Trash2, Save, Calculator, AlertCircle, CheckCircle2, Loader2 
} from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { ManualEntryProps, JournalEntry } from './types';

export function ManualEntryTab({
  accounts,
  loading,
  saving,
  date,
  setDate,
  refNo,
  setRefNo,
  description,
  setDescription,
  type,
  setType,
  entries,
  setEntries,
  onSubmit,
  isBalanced,
  totalDebit,
  totalCredit
}: ManualEntryProps) {
  const { t } = useTranslation();

  const addEntryRow = () => setEntries([...entries, { account_id: '', debit: 0, credit: 0 }]);
  const removeEntryRow = (i: number) => {
    if (entries.length <= 2) return;
    setEntries(entries.filter((_, idx) => idx !== i));
  };
  const updateEntry = (i: number, field: keyof JournalEntry, value: any) => {
    const ne = [...entries];
    ne[i] = { ...ne[i], [field]: value };
    setEntries(ne);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={!isBalanced || saving || loading} size="lg" className="gap-2 px-8">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('tx_btn_saving') : t('btn_save_draft')}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Form Header */}
        <Card className="md:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">{t('tx_header_details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{t('tx_date')}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t('tx_ref_no_optional')}</Label>
                <Input placeholder="mis. INV-001" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{t('tx_type')}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t('tx_type_manual')}</SelectItem>
                    <SelectItem value="purchase">{t('tx_type_purchase')}</SelectItem>
                    <SelectItem value="income">{t('tx_type_income')}</SelectItem>
                    <SelectItem value="operational">{t('tx_type_operational')}</SelectItem>
                    <SelectItem value="non_cash_out">{t('tx_type_non_cash_out')}</SelectItem>
                    <SelectItem value="non_cash_in">{t('tx_type_non_cash_in')}</SelectItem>
                    <SelectItem value="capital">{t('tx_type_capital')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t('tx_desc')}</Label>
                <Input
                  placeholder={t('tx_desc_placeholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className={cn(
          'border-border/60 transition-colors',
          isBalanced ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-primary/5 border-primary/20'
        )}>
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Calculator className="w-4 h-4 mr-2" />
              {t('tx_summary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between items-end border-b border-border/50 pb-4">
              <span className="text-sm text-muted-foreground font-medium">{t('tx_total_debit')}</span>
              <span className="text-xl font-bold">{formatRp(totalDebit)}</span>
            </div>
            <div className="flex justify-between items-end border-b border-border/50 pb-4">
              <span className="text-sm text-muted-foreground font-medium">{t('tx_total_credit')}</span>
              <span className="text-xl font-bold">{formatRp(totalCredit)}</span>
            </div>
            <div>
              {!isBalanced ? (
                <div className="flex items-center text-sm font-medium text-rose-500 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {t('tx_not_balanced')}
                </div>
              ) : (
                <div className="flex items-center text-sm font-medium text-emerald-500 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t('tx_ready_post')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Journal Entries Table */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('tx_journal_rows')}</CardTitle>
          <Button variant="outline" size="sm" onClick={addEntryRow} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {t('tx_add_row')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('tx_account')}</TableHead>
                  <TableHead className="w-[180px]">{t('tx_debit')}</TableHead>
                  <TableHead className="w-[180px]">{t('tx_credit')}</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell className="py-3">
                      <Select value={entry.account_id} onValueChange={(val) => updateEntry(index, 'account_id', val)}>
                        <SelectTrigger className="h-10 border-none bg-transparent hover:bg-muted/50 focus:ring-0">
                          <SelectValue placeholder={t('tx_select_account')} />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>
                              <span className="font-mono text-xs mr-2 opacity-60">[{acc.code}]</span> {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={entry.debit}
                        onChange={(e) => updateEntry(index, 'debit', parseFloat(e.target.value) || 0)}
                        className="h-10 border-none bg-transparent text-right font-semibold"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={entry.credit}
                        onChange={(e) => updateEntry(index, 'credit', parseFloat(e.target.value) || 0)}
                        className="h-10 border-none bg-transparent text-right font-semibold"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeEntryRow(index)}
                        disabled={entries.length <= 2}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
