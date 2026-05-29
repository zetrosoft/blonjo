/**
 * Transactions Page — Smart Input Mode
 * =====================================
 * Fitur:
 *  1. Smart Note   — Ketik bebas seperti nota belanja, AI parse otomatis
 *  2. Voice Input  — Rekam suara → transkripsi → parsing otomatis
 *  3. Manual Entry — Form jurnal manual (mode lama, tetap tersedia)
 * 
 * @security Semua parsing dilakukan client-side — 0 data suara ke server luar
 * @architect Persona: System Architect & Senior Developer
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { SmartTextarea } from '../components/SmartTextarea';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ParsePreview, CONFIDENCE_MAP } from '../components/ParsePreview';
import { parseNoteText, ParsedTransaction } from '../lib/smartParser';
import { 
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger 
} from '../components/ui/tooltip';
import {
  Sparkles, Mic, Table2, ShoppingCart, Plus, Trash2, Save,
  Calculator, AlertCircle, CheckCircle2, Loader2, RotateCcw,
  Wand2, Send, FileText, ChevronRight, UploadCloud, Image as ImageIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────
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
type InputMode = 'smart' | 'voice' | 'manual';

// ─── Contoh Placeholder Nota ─────────────────────────────────────
const SMART_NOTE_EXAMPLES: string[] = [];

// ─── Main Component ──────────────────────────────────────────────
export default function Transactions() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('smart');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Smart Note state
  const [noteText, setNoteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedTransaction | null>(null);
  const [currentOcrTaskId, setCurrentOcrTaskId] = useState<number | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  // ── OCR Integration ──────────────────────────────────────────
  const pollOCRStatus = async (taskId: number) => {
    setCurrentOcrTaskId(taskId);
    const interval = setInterval(async () => {
      try {
        const tasks = await fetchClient('/ocr/tasks');
        const task = tasks.find((t: any) => t.id === taskId);
        
        if (task.status === 'completed' || task.status === 'corrected') {
          clearInterval(interval);
          setIsUploading(false);
          
          // User request: Tulis ke textarea "Pembelian {hasil OCR mentah}"
          let text = '';
          if (task.raw_ocr_text) {
            text = `Pembelian ${task.raw_ocr_text}`;
          } else {
            // Fallback jika raw_ocr_text tidak ada (legacy data)
            const data = task.extracted_data;
            text = `${data.description || 'Nota Baru'} :\n`;
            if (data.items && data.items.length > 0) {
              data.items.forEach((item: any) => {
                text += `• ${item.name} ${item.qty} set @ ${item.price}\n`;
              });
            }
            if (data.total_amount) {
              text += `Total: ${data.total_amount}`;
            }
          }
          
          setNoteText(text);
          toast.success("OCR Berhasil", { description: "Data mentah telah dimasukkan ke Smart Note." });
          
          // Trigger parsing otomatis
          setTimeout(() => {
            const result = parseNoteText(text);
            setParsedResult(result);
          }, 500);
        } else if (task.status === 'failed') {
          clearInterval(interval);
          setIsUploading(false);
          toast.error("OCR Gagal", { description: task.error_message || "Gagal mengekstrak data struk." });
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await fetchClient('/ocr/upload', {
        method: 'POST',
        body: formData
      });
      toast.info("File diunggah", { description: "Sedang memproses data dengan AI..." });
      pollOCRStatus(result.id);
    } catch (error: any) {
      setIsUploading(false);
      toast.error("Gagal mengunggah", { description: error.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Smart Note Confirm Dialog state
  const [smartConfirmOpen, setSmartConfirmOpen] = useState(false);
  const [smartEntries, setSmartEntries] = useState<JournalEntry[]>([]);

  // Manual mode state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [refNo, setRefNo] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('manual');
  const [entries, setEntries] = useState<JournalEntry[]>([
    { account_id: '', debit: 0, credit: 0 },
    { account_id: '', debit: 0, credit: 0 },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchClient('/finance/accounts');
        setAccounts(data);
      } catch (err) {
        console.error('Failed to load accounts', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Smart Parse Handler ──────────────────────────────────────
  const handleParse = useCallback(() => {
    if (!noteText.trim()) return;
    setIsParsing(true);
    // Simulasi async untuk UX feel (parsing sebenarnya instan)
    setTimeout(() => {
      const result = parseNoteText(noteText);
      setParsedResult(result);
      setIsParsing(false);
    }, 600);
  }, [noteText]);

  const handleVoiceTranscript = useCallback((text: string, isInterim: boolean) => {
    setNoteText(text);
    if (!isInterim) {
      setTimeout(() => {
        const result = parseNoteText(text);
        setParsedResult(result);
      }, 300);
    } else {
      setParsedResult(null);
    }
  }, []);

  const handleReset = () => {
    setNoteText('');
    setParsedResult(null);
  };

  const handleLoadExample = () => {
    const example = SMART_NOTE_EXAMPLES[exampleIdx % SMART_NOTE_EXAMPLES.length];
    setNoteText(example);
    setParsedResult(null);
    setExampleIdx(i => i + 1);
  };

  const updateParsed = useCallback((updates: Partial<ParsedTransaction>) => {
    setParsedResult(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  // ── Submit Smart/Voice ────────────────────────────────────────
  const handleOpenSmartConfirm = () => {
    if (!parsedResult) return;
    
    // Auto-map entries based on parsedResult
    const amount = parsedResult.total_amount;
    let debitId = '';
    let creditId = '';

    const findAcc = (kws: string[]) => {
      const found = accounts.find(a => kws.some(k => a.name.toLowerCase().includes(k)));
      return found ? found.id.toString() : '';
    };

    switch (parsedResult.transaction_type) {
      case 'purchase':
        debitId = findAcc(['persediaan', 'beli', 'biaya']);
        creditId = findAcc(['kas', 'bank']);
        break;
      case 'income':
        debitId = findAcc(['kas', 'bank']);
        creditId = findAcc(['pendapatan', 'jual']);
        break;
      case 'operational':
        debitId = findAcc(['beban', 'biaya', 'operasional']);
        creditId = findAcc(['kas', 'bank']);
        break;
      case 'capital':
        debitId = findAcc(['kas', 'bank']);
        creditId = findAcc(['modal']);
        break;
      case 'non_cash_out':
        debitId = findAcc(['bank']);
        creditId = findAcc(['kas']);
        break;
      case 'non_cash_in':
        debitId = findAcc(['kas']);
        creditId = findAcc(['bank']);
        break;
      default:
        debitId = '';
        creditId = '';
    }

    setSmartEntries([
      { account_id: debitId, debit: amount, credit: 0 },
      { account_id: creditId, debit: 0, credit: amount }
    ]);

    setSmartConfirmOpen(true);
  };

  const updateSmartEntry = (i: number, field: keyof JournalEntry, value: any) => {
    const ne = [...smartEntries];
    ne[i] = { ...ne[i], [field]: value };
    setSmartEntries(ne);
  };

  const executeSmartSubmit = async (status: 'draft' | 'posted' = 'draft') => {
    if (!parsedResult) return;
    
    // Validasi balance
    const totalD = smartEntries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const totalC = smartEntries.reduce((s, e) => s + Number(e.credit || 0), 0);
    if (totalD !== totalC || totalD <= 0) {
      toast.error('Gagal', { description: 'Total Debit dan Kredit harus seimbang!' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        transaction_date: parsedResult.transaction_date,
        description: parsedResult.description,
        transaction_type: parsedResult.transaction_type,
        total_amount: parsedResult.total_amount,
        reference_no: undefined,
        status,
        entries: smartEntries.map(e => ({
          account_id: parseInt(e.account_id),
          debit: Number(e.debit),
          credit: Number(e.credit),
        })),
        items: parsedResult.items.map(i => ({
          ...i,
          contact_name: parsedResult.contact_name
        })),
      };

      await fetchClient('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // RAG: Jika dari OCR, kirim koreksi untuk pembelajaran AI
      if (currentOcrTaskId) {
        try {
          const ocrCorrectionPayload = {
            transaction_date: parsedResult.transaction_date,
            reference_no: '',
            description: parsedResult.description,
            total_amount: parsedResult.total_amount,
            transaction_type: parsedResult.transaction_type,
            items: parsedResult.items.map(i => ({
              name: i.name,
              qty: i.qty,
              price: i.unit_price,
              total: i.total,
              contact_name: parsedResult.contact_name
            }))
          };
          
          await fetchClient(`/ocr/tasks/${currentOcrTaskId}/correct`, {
            method: 'POST',
            body: JSON.stringify(ocrCorrectionPayload)
          });
          console.log("RAG Feedback sent successfully.");
        } catch (ocrErr) {
          console.error("Failed to send RAG feedback", ocrErr);
        }
      }

      toast.success(t('tx_toast_success'), {
        description: `${parsedResult.type_label} — Rp ${parsedResult.total_amount.toLocaleString('id-ID')} (${t(`status_${status}`)})`,
      });
      setSmartConfirmOpen(false);
      setCurrentOcrTaskId(null); // Reset task ID
      handleReset();
    } catch (error: any) {
      toast.error(t('tx_toast_fail'), { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Manual Entry Handlers ─────────────────────────────────────
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

  const totalDebit = entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const handleSubmitManual = async () => {
    if (!isBalanced) return;
    setSaving(true);
    try {
      await fetchClient('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transaction_date: date,
          reference_no: refNo || undefined,
          description,
          transaction_type: type,
          status: 'draft',
          total_amount: totalDebit,
          entries: entries.map(e => ({
            account_id: parseInt(e.account_id),
            debit: Number(e.debit),
            credit: Number(e.credit),
          })),
        }),
      });
      toast.success(t('tx_toast_success') + ` (${t('status_draft')})`);
      setDescription('');
      setRefNo('');
      setEntries([
        { account_id: '', debit: 0, credit: 0 },
        { account_id: '', debit: 0, credit: 0 },
      ]);
    } catch (error: any) {
      toast.error(error.message || t('tx_toast_fail'));
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-none px-4 md:px-6 lg:px-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">

      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('menu_transactions')}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('tx_subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Mode Selector Tabs ── */}
      <div className="flex gap-2 bg-muted/40 p-1 rounded-xl border border-border/50 w-fit">
        {[
          { id: 'smart' as InputMode, icon: Wand2, label: t('tx_smart_note'), desc: t('tx_smart_note_desc') },
          { id: 'manual' as InputMode, icon: Table2, label: t('tx_manual'), desc: t('tx_manual_desc') },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setInputMode(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              inputMode === tab.id
                ? 'bg-background text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════
           MODE: SMART NOTE
         ════════════════════════════════════════ */}
      {inputMode === 'smart' && (
        <div className="grid gap-4 lg:grid-cols-5">

          {/* Left: Input Area */}
          <div className="lg:col-span-2 space-y-3">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-primary" />
                  {t('tx_note_card_title')}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('tx_note_card_desc')}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <SmartTextarea
                    value={noteText}
                    onChange={(val) => {
                      setNoteText(val);
                      setParsedResult(null); // reset parse saat teks berubah
                    }}
                    placeholder={t('tx_note_placeholder')}
                    className="min-h-[140px] pb-14"
                  />
                  <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-2.5">
                    <TooltipProvider>
                      {/* Tombol Upload */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative group">
                            <input
                              type="file"
                              ref={fileInputRef}
                              className="hidden"
                              accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx"
                              onChange={handleFileUpload}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className={cn(
                                "h-11 w-11 rounded-full border-2 border-primary/40 bg-background/95 backdrop-blur-sm transition-all duration-300 shadow-lg hover:border-primary hover:scale-110 active:scale-95 group-hover:shadow-primary/20",
                                isUploading && "border-primary border-t-transparent animate-spin"
                              )}
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                            >
                              {isUploading ? (
                                <Loader2 className="h-5 w-5 text-primary" />
                              ) : (
                                <Plus className="h-6 w-6 text-primary group-hover:rotate-90 transition-transform duration-300" />
                              )}
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="bg-zinc-900 text-white border-zinc-800">
                          <p className="font-bold">Upload Nota / File</p>
                          <p className="text-[10px] opacity-70">Mendukung Gambar, PDF, Excel & Doc</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Tombol Voice Record */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative group">
                            <VoiceRecorder onTranscript={handleVoiceTranscript} disabled={isParsing || saving || isUploading} initialText={noteText} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="bg-zinc-900 text-white border-zinc-800">
                          <p className="font-bold">Voice Input</p>
                          <p className="text-[10px] opacity-70">Rekam suara & konversi ke teks otomatis</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={handleParse}
                    disabled={!noteText.trim() || isParsing}
                    className="gap-2"
                  >
                    {isParsing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isParsing ? t('tx_btn_parsing') : t('tx_btn_parse')}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleLoadExample}
                    className="gap-2 text-xs"
                    size="sm"
                  >
                    <ChevronRight className="w-3 h-3" />
                    {t('tx_btn_example')}
                  </Button>

                  {noteText && (
                    <Button
                      variant="ghost"
                      onClick={handleReset}
                      className="gap-1 text-muted-foreground text-xs"
                      size="sm"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('tx_btn_reset')}
                    </Button>
                  )}
                </div>

                {/* Keyword Guide */}
                <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t('tx_keyword_guide')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: t('tx_kw_purchase'), color: 'bg-rose-500/15 text-rose-400' },
                      { label: t('tx_kw_income'), color: 'bg-emerald-500/15 text-emerald-400' },
                      { label: t('tx_kw_operational'), color: 'bg-orange-500/15 text-orange-400' },
                      { label: t('tx_kw_transfer_out'), color: 'bg-violet-500/15 text-violet-400' },
                      { label: t('tx_kw_transfer_in'), color: 'bg-cyan-500/15 text-cyan-400' },
                      { label: t('tx_kw_capital'), color: 'bg-sky-500/15 text-sky-400' },
                    ].map((kw) => (
                      <span
                        key={kw.label}
                        className={cn('text-xs px-2 py-0.5 rounded-full border border-current/20 font-medium', kw.color)}
                      >
                        {kw.label}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview & Submit */}
          <div className="lg:col-span-3 space-y-3">
            <Card className={cn(
              'border-border/60 transition-all duration-300',
              parsedResult ? 'border-primary/30 bg-primary/3' : ''
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    {t('tx_preview_title')}
                  </div>
                  {parsedResult && (() => {
                    const conf = CONFIDENCE_MAP[parsedResult.confidence];
                    const ConfIcon = conf.icon;
                    return (
                      <span className={cn(
                        'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                        conf.cls
                      )}>
                        <ConfIcon className="w-3 h-3" />
                        {conf.label}
                      </span>
                    );
                  })()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!parsedResult ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                      <Wand2 className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('tx_preview_empty')}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {t('tx_preview_empty_desc')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ParsePreview parsed={parsedResult} onUpdate={updateParsed} />

                    <Button
                      onClick={handleOpenSmartConfirm}
                      disabled={saving || parsedResult.total_amount <= 0}
                      className="w-full gap-2"
                      size="lg"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {saving ? t('tx_btn_saving') : t('tx_btn_save_tx')}
                    </Button>

                    {parsedResult.total_amount <= 0 && (
                      <p className="text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t('tx_err_amount_not_detected')}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}


      {/* ════════════════════════════════════════
           MODE: MANUAL ENTRY
         ════════════════════════════════════════ */}
      {inputMode === 'manual' && (
        <div className="space-y-6">
          {/* Header Actions */}
          <div className="flex justify-end">
            <Button onClick={handleSubmitManual} disabled={!isBalanced || saving || loading} size="lg" className="gap-2 px-8">
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
                  <span className="text-xl font-bold">Rp {totalDebit.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-end border-b border-border/50 pb-4">
                  <span className="text-sm text-muted-foreground font-medium">{t('tx_total_credit')}</span>
                  <span className="text-xl font-bold">Rp {totalCredit.toLocaleString('id-ID')}</span>
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
      )}

      {/* Dialog Konfirmasi Jurnal Smart Note */}
      <Dialog open={smartConfirmOpen} onOpenChange={setSmartConfirmOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('tx_confirm_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
              <p className="text-sm font-medium mb-1">{t('tx_total_tx')}</p>
              <p className="text-2xl font-bold">Rp {parsedResult?.total_amount.toLocaleString('id-ID')}</p>
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
                        <Select value={entry.account_id} onValueChange={(val) => updateSmartEntry(index, 'account_id', val)}>
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
                          onChange={(e) => updateSmartEntry(index, 'debit', parseFloat(e.target.value) || 0)}
                          className="h-10 border-none bg-transparent text-right font-semibold"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={entry.credit}
                          onChange={(e) => updateSmartEntry(index, 'credit', parseFloat(e.target.value) || 0)}
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
            <Button variant="outline" onClick={() => setSmartConfirmOpen(false)}>{t('btn_cancel')}</Button>
            <Button onClick={() => executeSmartSubmit('draft')} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('btn_save_journal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
