import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { AlertCircle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { formatRp } from '../../../lib/utils';
import type { ParsedTransaction } from '../../../lib/smartParser';

interface DuplicateWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parsedResult: ParsedTransaction | null;
}

export function DuplicateWarningDialog({
  isOpen,
  onClose,
  parsedResult
}: DuplicateWarningDialogProps) {
  if (!parsedResult) return null;

  const duplicateTaskId = (parsedResult as any).duplicate_task_id || (parsedResult as any).id;
  const imageApiUrl = duplicateTaskId ? `/api/v1/ocr/tasks/${duplicateTaskId}/image` : null;

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] flex flex-col border-2 border-rose-500/50 bg-background shadow-2xl p-5 overflow-hidden font-sans">
        <DialogHeader className="space-y-1 text-left shrink-0">
          <div className="flex items-center gap-2 text-rose-500 font-bold text-base">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <DialogTitle className="text-rose-500 text-lg font-bold">
              PERINGATAN DUPLIKASI BERKAS AI
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-rose-400 dark:text-rose-300 leading-relaxed font-medium">
            {(parsedResult as any).duplicate_warning || 'Foto nota ini terdeteksi 100% identik dengan nota yang sudah pernah diproses di database sebelumnya.'}
          </DialogDescription>
        </DialogHeader>

        {/* Ringkasan Transaksi Duplikat (Fixed header shrink-0) */}
        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs my-2 text-rose-300 shrink-0">
          <div><span className="opacity-75">Supplier:</span> <strong className="block text-foreground truncate font-semibold">{parsedResult.contact_name || 'N/A'}</strong></div>
          <div><span className="opacity-75">Tanggal:</span> <strong className="block text-foreground truncate font-semibold">{parsedResult.transaction_date || 'N/A'}</strong></div>
          <div><span className="opacity-75">Total:</span> <strong className="block text-foreground font-semibold">{formatRp(parsedResult.total_amount || 0)}</strong></div>
        </div>

        {/* Display Foto Nota Asli yang Paling Terakhir Ditemukan (Scrollable flex-1) */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-2.5 space-y-2 text-center max-h-[45vh] min-h-[160px]">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-1 shrink-0">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <ImageIcon className="w-4 h-4 text-primary" />
              Foto Struk/Nota Asli Terakhir
            </span>
            <span className="text-[11px]">Task ID #{duplicateTaskId || 'DB'}</span>
          </div>

          <div className="overflow-y-auto rounded-lg border border-border/50 bg-black/50 p-2 flex items-center justify-center min-h-[180px]">
            {imageApiUrl ? (
              <img
                src={imageApiUrl}
                alt="Foto Struk Nota Asli Terakhir"
                className="max-h-[380px] max-w-full w-auto h-auto object-contain rounded-md shadow-md hover:scale-[1.02] transition-transform duration-200"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Pratinjau gambar asli dari server</p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-3 shrink-0 border-t border-border/40 mt-auto">
          <Button
            type="button"
            onClick={handleClose}
            className="w-full h-11 gap-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm shadow-lg shadow-rose-600/20"
          >
            <RefreshCw className="w-4 h-4" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
