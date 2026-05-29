import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Wand2, Upload, FileText, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AITrainingSettings() {
  const { t } = useTranslation();
  
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [instructions, setInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [processResult, setProcessResult] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    // Create preview
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
  };

  const handleProcess = async () => {
    if (!file && !filePreview) {
      toast.error('Silakan upload file terlebih dahulu.');
      return;
    }
    if (!instructions.trim()) {
      toast.error('Silakan berikan petunjuk cara membaca data.');
      return;
    }

    setIsProcessing(true);
    
    // TODO: Connect to backend for real AI processing.
    // For now, simulate a process delay.
    setTimeout(() => {
      setProcessResult('{\n  "status": "success",\n  "message": "Data berhasil diproses berdasarkan petunjuk."\n}');
      setIsProcessing(false);
      setIsResultDialogOpen(true);
    }, 1500);
  };

  const handleSaveResult = () => {
    // TODO: Send final result to backend
    toast.success('Hasil pelatihan berhasil disimpan!');
    setIsResultDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Title and Subtitle */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-primary" />
            {t('setting_ai_training')}
          </CardTitle>
          <p className="text-muted-foreground">
            Pelatihan AI Multi-fungsi: Ajari sistem mengenali berbagai jenis dokumen, teks, atau gambar dengan memberikan petunjuk spesifik.
          </p>
        </CardHeader>
      </Card>

      {/* Card 2: Training Interface */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
        
        {/* Header: 2 Cols (2:1) */}
        <CardHeader className="border-b border-border/40 pb-6">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="col-span-2">
              <CardTitle className="text-xl">Materi Pembelajaran Baru</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Upload data dan berikan instruksi cara ekstraksinya.</p>
            </div>
            <div className="col-span-1 flex justify-end">
              <Input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
              />
              <Button onClick={() => fileInputRef.current?.click()} className="w-full max-w-[200px] gap-2">
                <Upload className="w-4 h-4" />
                Upload File
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Body: 2 Cols (1:1) */}
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kolom Kiri: Instruksi */}
            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-bold text-primary">Petunjuk Ekstraksi (Instruksi untuk AI)</Label>
              <textarea 
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Contoh: Baca dokumen ini dan ambil total pembelian, nama toko, serta daftar barangnya. Format ke dalam JSON."
                className="w-full flex-1 min-h-[300px] text-sm p-4 rounded-xl border border-primary/30 bg-primary/5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Kolom Kanan: Preview File (Markdown Canvas) */}
            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-bold text-muted-foreground">Preview File</Label>
              <div className="w-full flex-1 min-h-[300px] p-4 rounded-xl border border-border/50 bg-muted/20 overflow-y-auto prose dark:prose-invert max-w-none text-sm">
                {filePreview ? (
                  filePreview.startsWith('![Preview]') ? (
                    <img src={filePreview.match(/\((.*?)\)/)?.[1]} alt="Preview" className="max-w-full h-auto rounded-md" />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs">{filePreview}</pre>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                    <FileText className="w-12 h-12 mb-2" />
                    <p>Belum ada file di-upload</p>
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
            disabled={isProcessing || !filePreview || !instructions}
            className="px-8 gap-2"
          >
            {isProcessing ? (
              <span className="animate-pulse">Memproses...</span>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Process Data
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Popup Dialog Besar untuk Hasil (Editable) */}
      <Dialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
        <DialogContent className="max-w-4xl bg-card border border-border/40 shadow-2xl rounded-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              Hasil Ekstraksi AI (Editable)
            </DialogTitle>
            <DialogDescription>
              Silakan periksa dan perbaiki hasil ekstraksi di bawah ini sebelum menyimpannya ke memori pelatihan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <textarea
              value={processResult}
              onChange={(e) => setProcessResult(e.target.value)}
              className="w-full h-[400px] text-sm font-mono p-4 rounded-xl border border-border/50 bg-muted/10 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <DialogFooter className="border-t border-border/20 pt-4">
            <Button variant="outline" onClick={() => setIsResultDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSaveResult}>
              Simpan ke Data Pembelajaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
