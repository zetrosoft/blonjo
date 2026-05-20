import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient, ApiError } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ShoppingCart, Plus, Trash2, Save, Calculator, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

interface JournalEntry {
  account_id: string;
  debit: number;
  credit: number;
}

export default function Transactions() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [refNo, setRefNo] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('manual');
  const [entries, setEntries] = useState<JournalEntry[]>([
    { account_id: '', debit: 0, credit: 0 },
    { account_id: '', debit: 0, credit: 0 },
  ]);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const data = await fetchClient('/finance/accounts');
        setAccounts(data);
      } catch (err) {
        console.error("Failed to load accounts", err);
      } finally {
        setLoading(false);
      }
    };
    loadAccounts();
  }, []);

  const addEntryRow = () => {
    setEntries([...entries, { account_id: '', debit: 0, credit: 0 }]);
  };

  const removeEntryRow = (index: number) => {
    if (entries.length <= 2) return;
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof JournalEntry, value: any) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    setEntries(newEntries);
  };

  const totalDebit = entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const handleSubmit = async () => {
    if (!isBalanced) return;
    setSaving(true);
    try {
      const payload = {
        transaction_date: date,
        reference_no: refNo || undefined,
        description,
        transaction_type: type,
        total_amount: totalDebit,
        entries: entries.map(e => ({
          account_id: parseInt(e.account_id),
          debit: Number(e.debit),
          credit: Number(e.credit)
        }))
      };

      await fetchClient('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success("Transaction recorded successfully!");
      // Reset form
      setDescription('');
      setRefNo('');
      setEntries([
        { account_id: '', debit: 0, credit: 0 },
        { account_id: '', debit: 0, credit: 0 },
      ]);
    } catch (error: any) {
      toast.error(error.message || "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{t('menu_transactions')}</h2>
            <p className="text-muted-foreground mt-0.5">Record new journal entry manually</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={!isBalanced || saving || loading} size="lg" className="px-8">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Post Transaction
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle>Header Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Transaction Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Reference No (Optional)</Label>
                <Input placeholder="e.g. INV-001" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Journal</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="General description of the transaction" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "border-border/60 transition-colors",
          isBalanced ? "bg-emerald-500/5 border-emerald-500/20" : "bg-primary/5 border-primary/20"
        )}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calculator className="w-4 h-4 mr-2" />
              Quick Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between items-end border-b border-border/50 pb-4">
              <span className="text-sm text-muted-foreground font-medium">Total Debit</span>
              <span className="text-xl font-bold">Rp {totalDebit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end border-b border-border/50 pb-4">
              <span className="text-sm text-muted-foreground font-medium">Total Credit</span>
              <span className="text-xl font-bold">Rp {totalCredit.toLocaleString()}</span>
            </div>
            <div className="pt-2">
              {!isBalanced ? (
                <div className="flex items-center text-sm font-medium text-rose-500 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Entries are not balanced
                </div>
              ) : (
                <div className="flex items-center text-sm font-medium text-emerald-500 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Ready to post
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Journal Entries</CardTitle>
          <Button variant="outline" size="sm" onClick={addEntryRow}>
            <Plus className="w-4 h-4 mr-2" />
            Add Row
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-[200px]">Debit</TableHead>
                  <TableHead className="w-[200px]">Credit</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell className="py-3">
                      <Select value={entry.account_id} onValueChange={(val) => updateEntry(index, 'account_id', val)}>
                        <SelectTrigger className="h-10 border-none bg-transparent hover:bg-muted/50 focus:ring-0">
                          <SelectValue placeholder="Select account..." />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map(acc => (
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
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeEntryRow(index)} disabled={entries.length <= 2}>
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
