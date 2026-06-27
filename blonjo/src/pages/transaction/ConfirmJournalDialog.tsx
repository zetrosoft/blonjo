import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Save, Loader2 } from 'lucide-react';
import { Account, JournalEntry } from './types';
import { ParsedTransaction } from '../../lib/smartParser';
import { formatRp } from '../../lib/utils';

interface ConfirmJournalDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  parsedResult: ParsedTransaction | null;
  smartEntries: JournalEntry[];
  accounts: Account[];
  onUpdateEntry: (i: number, field: keyof JournalEntry, value: any) => void;
  onExecuteSubmit: (status: 'draft' | 'posted') => void;
  saving: boolean;
}

export function ConfirmJournalDialog({
  isOpen,
  onOpenChange,
  parsedResult,
  smartEntries,
  accounts,
  onUpdateEntry,
  onExecuteSubmit,
  saving
}: ConfirmJournalDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('tx_confirm_title')}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Periksa rincian jurnal otomatis di bawah ini sebelum disimpan ke dalam buku besar. 
            Sistem telah menghitung HPP secara proporsional sesuai standar Perpetual PSAK EMKM.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
            <p className="text-sm font-medium mb-1">{t('tx_total_tx')}</p>
            <p className="text-2xl font-bold">{formatRp(parsedResult?.total_amount || 0)}</p>
          </div>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('tx_account')}</TableHead>
                  <TableHead className="w-[180px]">{t('tx_debit')}</TableHead>
                  <TableHead className="w-[180px]">{t('tx_credit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {smartEntries.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell className="py-3">
                      <Select value={entry.account_id} onValueChange={(val) => onUpdateEntry(index, 'account_id', val)}>
                        <SelectTrigger className="h-10 border-none bg-transparent hover:bg-muted/50 focus:ring-0">
                          <SelectValue placeholder={t('tx_select_account')}>
                            {(() => {
                              if (entry.account) {
                                return (
                                  <div className="flex items-center">
                                    <span className="font-mono text-xs mr-2 opacity-60">[{entry.account.code}]</span>
                                    <span className="font-medium">{entry.account.name}</span>
                                  </div>
                                );
                              }
                              const acc = accounts.find(a => a.id.toString() === entry.account_id.toString());
                              if (acc) {
                                return (
                                  <div className="flex items-center">
                                    <span className="font-mono text-xs mr-2 opacity-60">[{acc.code}]</span>
                                    <span className="font-medium">{acc.name}</span>
                                  </div>
                                );
                              }
                              return <span className="text-muted-foreground italic">Pilih akun...</span>;
                            })()}
                          </SelectValue>
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
                        onChange={(e) => onUpdateEntry(index, 'debit', parseFloat(e.target.value) || 0)}
                        className="h-10 border-none bg-transparent text-right font-semibold"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={entry.credit}
                        onChange={(e) => onUpdateEntry(index, 'credit', parseFloat(e.target.value) || 0)}
                        className="h-10 border-none bg-transparent text-right font-semibold"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('btn_cancel')}</Button>
          <Button onClick={() => onExecuteSubmit('draft')} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('btn_save_journal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
