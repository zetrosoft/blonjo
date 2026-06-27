import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Wand2, Upload, FileText, CheckCircle, Eye, Edit3, Loader2, Trash2, Calendar, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { fetchClient } from '../../api/client';

// Simple Markdown Table Renderer to avoid react-markdown import issues in Docker
const renderSimpleTable = (md: string) => {
  if (!md) return null;
  const lines = md.trim().split('\n');
  const tableIndex = lines.findIndex(l => l.includes('|'));
  
  if (tableIndex === -1) return <pre className="whitespace-pre-wrap font-mono text-xs">{md}</pre>;

  const beforeTable = lines.slice(0, tableIndex);
  const tableLines = lines.slice(tableIndex);

  return (
    <div className="space-y-4 text-zinc-900 dark:text-zinc-100">
      <div className="text-sm leading-relaxed space-y-1">
        {beforeTable.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-900/50">
              {tableLines[0].split('|').filter(cell => cell.trim() !== "").map((cell, i) => (
                <th key={i} className="border border-zinc-200 dark:border-zinc-800 p-2 text-left font-bold">{cell.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableLines.length > 2 ? tableLines.slice(2).map((line, li) => (
              <tr key={li} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                {line.split('|').filter(cell => cell.trim() !== "").map((cell, ci) => (
                  <td key={ci} className="border border-zinc-200 dark:border-zinc-800 p-2">{cell.trim()}</td>
                ))}
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function AITrainingSettings() {
  const { t } = useTranslation();
  
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [processResult, setProcessResult] = useState('');
  const [rawOcrText, setRawOcrText] = useState('');
  const [isRawOcrDialogOpen, setIsRawOcrDialogOpen] = useState(false);
  const [isEditingResult, setIsEditingResult] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [trainingTemplates, setTrainingTemplates] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTrainingTemplates();
  }, []);

  const loadTrainingTemplates = async () => {
    setIsLoadingList(true);
    try {
      const data = await fetchClient('/ocr/training-templates');
      setTrainingTemplates(data || []);
    } catch (err) {
      toast.error("Gagal memuat daftar pelatihan.");
    } finally {
      setIsLoadingList(false);
    }
  };

  const handlePreviewOldTemplate = (tpl: any) => {
    setEditingId(tpl.id);
    setRawOcrText(tpl.raw_ocr_text);
    try {
      const parsed = JSON.parse(tpl.expected_output);
      setProcessResult(parsed.final_markdown || tpl.expected_output);
      setInstructions(parsed.instructions || '');
    } catch (e) {
      setProcessResult(tpl.expected_output);
      setInstructions('');
    }
    setIsResultDialogOpen(true);
    setIsEditingResult(false);
  };

  const handleDeleteTemplate = (id: number) => {
    setDeleteTargetId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await fetchClient(`/ocr/training-templates/${deleteTargetId}`, { method: 'DELETE' });
      toast.success("Materi berhasil dihapus.");
      loadTrainingTemplates();
    } catch (err) {
      toast.error("Gagal menghapus materi.");
    } finally {
      setIsDeleteDialogOpen(false);
      setDeleteTargetId(null);
    }
  };

  const handleVoiceTranscript = (text: string, isInterim: boolean) => {
    setInstructions(text);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    // 1. UI Preview
    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setFilePreview(`![Preview](${url})`);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target?.result as string);
      };
      reader.readAsText(selectedFile);
    }

    // 2. Real Backend OCR Extraction (Raw)
    if (selectedFile.type.startsWith('image/')) {
      setIsExtracting(true);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        const response = await fetchClient('/ocr/training-templates/extract-raw', {
          method: 'POST',
          body: formData,
        });
        
        if (response && response.raw_text) {
          setRawOcrText(response.raw_text);
          toast.success("Teks mentah berhasil diekstrak!");
        }
      } catch (err: any) {
        console.error(err);
        toast.error("Gagal mengekstrak teks OCR mentah.");
      } finally {
        setIsExtracting(false);
      }
    }
  };

  const handleProcess = async () => {
    if (!file && !filePreview) {
      toast.error(t('toast_err_upload_first'));
      return;
    }
    if (!instructions.trim()) {
      toast.error(t('toast_err_instruction_required'));
      return;
    }

    setIsProcessing(true);
    
    try {
      // Call real AI process endpoint
      const response = await fetchClient('/ocr/training-templates/process', {
        method: 'POST',
        body: {
          instructions: instructions,
          raw_text: rawOcrText
        }
      });
      
      if (response && response.processed_markdown) {
        setProcessResult(response.processed_markdown);
        setIsResultDialogOpen(true);
        setIsEditingResult(false);
        toast.success(`Data diproses menggunakan ${response.processor.toUpperCase()}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal memproses data dengan AI.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveResult = async () => {
    try {
      // JSON Conversion for RAG embedding
      const jsonOutput = {
        type: "training_data",
        raw_input: rawOcrText,
        instructions: instructions,
        final_markdown: processResult,
        timestamp: new Date().toISOString()
      };

      const payload = {
        file_name: file?.name || 'training_material',
        raw_ocr_text: rawOcrText,
        expected_output: JSON.stringify(jsonOutput)
      };

      if (editingId) {
        await fetchClient(`/ocr/training-templates/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        toast.success("Data pelatihan berhasil diperbarui.");
      } else {
        await fetchClient('/ocr/training-templates', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast.success(t('toast_success_training_saved'));
      }

      setIsResultDialogOpen(false);
      setEditingId(null);
      loadTrainingTemplates();
    } catch (err: any) {
      toast.error("Gagal menyimpan data pelatihan.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Card 2: Training Interface */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
        
        {/* Header: 2 Cols (2:1) */}
        <CardHeader className="border-b border-border/40 pb-6">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="col-span-2">
              <CardTitle className="text-xl">{t('ai_training_new_material')}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{t('ai_training_new_material_desc')}</p>
            </div>
            <div className="col-span-1 flex justify-end">
              <Input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
              />
              <Button onClick={() => fileInputRef.current?.click()} className="w-full max-w-[200px] gap-2" disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isExtracting ? "Extracting..." : t('btn_upload_file')}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Body: 2 Cols (1:1) */}
        <CardContent className="pt-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kolom Kiri: Instruksi */}
            <div className="space-y-2 flex flex-col h-[600px]">
              <Label className="text-sm font-bold text-primary h-6 flex items-center">{t('ai_training_instruction_label')}</Label>
              <div className="relative flex-1 group">
                <textarea 
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={t('ai_training_instruction_placeholder')}
                  className="w-full h-full p-4 pr-12 rounded-xl border border-primary/30 bg-primary/5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-y-auto text-sm leading-relaxed font-mono"
                />
                <div className="absolute top-3 right-3 z-10 opacity-60 hover:opacity-100 transition-opacity scale-90 origin-top-right">
                  <VoiceRecorder onTranscript={handleVoiceTranscript} initialText={instructions} />
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Preview File / Input Data */}
            <div className="space-y-2 flex flex-col h-[600px]">
              <Label className="text-sm font-bold text-muted-foreground h-6 flex items-center">{t('ai_training_preview_label')}</Label>
              <div className="w-full flex-1 p-4 rounded-xl border border-border/50 bg-muted/20 overflow-y-auto text-sm shadow-inner">
                {filePreview ? (
                  filePreview.startsWith('![Preview]') ? (
                    <div className="flex justify-center p-2">
                      <img src={filePreview.match(/\((.*?)\)/)?.[1]} alt="Preview" className="max-w-full h-auto rounded-md shadow-lg border border-border/20" />
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs p-2">{filePreview}</pre>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                    <FileText className="w-12 h-12 mb-2" />
                    <p>{t('ai_training_no_file')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>

        {/* Footer: Process Button */}
        <CardFooter className="border-t border-border/40 pt-6 flex justify-end">
          <Button 
            onClick={handleProcess} 
            disabled={isProcessing || !filePreview || !instructions || isExtracting}
            className="px-8 gap-2"
          >
            {isProcessing ? (
              <span className="animate-pulse">{t('text_processing')}</span>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                {t('btn_process_data')}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Card 3: AI Training List & Stats */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5 overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Pustaka Pengetahuan AI (RAG)
              </CardTitle>
              <p className="text-sm text-muted-foreground">Daftar materi yang sudah dilatih dan statistik penggunaannya.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadTrainingTemplates} disabled={isLoadingList}>
              {isLoadingList ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/30 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="px-6 py-4 font-bold">Materi / File</th>
                  <th className="px-6 py-4 font-bold">Dibuat Pada</th>
                  <th className="px-6 py-4 font-bold text-center">Frekuensi Akses</th>
                  <th className="px-6 py-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {trainingTemplates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground italic">
                      {isLoadingList ? "Memuat data..." : "Belum ada materi pelatihan yang tersimpan."}
                    </td>
                  </tr>
                ) : (
                  trainingTemplates.map((tpl) => (
                    <tr key={tpl.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold">{tpl.file_name || `Materi #${tpl.id}`}</span>
                            {!tpl.tenant_id && (
                              <span className="text-[10px] w-fit px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold uppercase tracking-tighter">Public Knowledge</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(tpl.created_at).toLocaleDateString('id-ID')}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-lg font-black text-primary">{tpl.usage_count}</span>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Akses AI</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handlePreviewOldTemplate(tpl)} className="h-8 w-8 hover:text-primary">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTemplate(tpl.id)} className="h-8 w-8 text-rose-500 hover:bg-rose-500/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isResultDialogOpen} onOpenChange={(open) => {
        setIsResultDialogOpen(open);
        if (!open) {
          setEditingId(null);
          setProcessResult('');
          setInstructions('');
          setFilePreview('');
          setFile(null);
        }
      }}>
        <DialogContent className="max-w-4xl bg-card border border-border/40 shadow-2xl rounded-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="p-4 border-b border-border/20 bg-muted/10 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  {t('ai_training_result_title')}
                </DialogTitle>
                <DialogDescription>
                  {t('ai_training_result_desc')}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsRawOcrDialogOpen(true)}
                  className="gap-2 text-xs font-bold border-zinc-200 dark:border-zinc-800"
                  title="Lihat OCR Mentah"
                >
                  <Eye className="w-3.5 h-3.5" />
                  RAW OCR
                </Button>
                
                <Button 
                  variant={isEditingResult ? "secondary" : "outline"} 
                  size="sm" 
                  onClick={() => setIsEditingResult(!isEditingResult)}
                  className="gap-2 text-xs font-bold border-zinc-200 dark:border-zinc-800"
                >
                  {isEditingResult ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                  {isEditingResult ? "Preview" : "Edit"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {isEditingResult ? (
              <textarea
                value={processResult}
                onChange={(e) => setProcessResult(e.target.value)}
                className="w-full h-full min-h-[500px] text-sm font-mono p-6 rounded-xl border border-border/50 bg-muted/10 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed shadow-inner"
              />
            ) : (
              <div className="w-full p-8 rounded-2xl border border-border/40 bg-card shadow-inner min-h-[500px]">
                {renderSimpleTable(processResult)}
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-border/20 bg-muted/5 rounded-b-2xl">
            <Button variant="outline" onClick={() => setIsResultDialogOpen(false)} className="px-8">
              {t('btn_cancel') || 'Batal'}
            </Button>
            <Button onClick={handleSaveResult} className="px-8 gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 text-white font-bold">
              <CheckCircle className="w-4 h-4" />
              {t('btn_save_learning_data')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRawOcrDialogOpen} onOpenChange={setIsRawOcrDialogOpen}>
        <DialogContent className="max-w-2xl bg-zinc-950 border border-zinc-800 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Hasil OCR Mentah (Input AI)
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs italic">
              Ini adalah teks mentah hasil pembacaan mesin sebelum diproses oleh AI.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 mt-4">
            <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-zinc-300 max-h-[400px] overflow-y-auto">
              {rawOcrText || "Tidak ada data OCR mentah."}
            </pre>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsRawOcrDialogOpen(false)} className="text-zinc-400 hover:text-white">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Materi Pelatihan?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Materi ini akan dihapus permanen dari Pustaka Pengetahuan AI (RAG).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-rose-500 hover:bg-rose-600">
              Hapus Materi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
