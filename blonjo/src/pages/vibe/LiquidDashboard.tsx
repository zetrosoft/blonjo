import React, { useState } from 'react';
import { Omnibar } from './Omnibar';
import { VibeRenderer, VibeData } from './VibeRenderer';
import { fetchClient } from '@/api/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAccountingStore } from '@/store/accounting';

const LiquidDashboard: React.FC = () => {
  const [vibeItems, setVibeItems] = useState<VibeData[]>([]);
  const [processor, setProcessor] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const processIntent = async (intent: string, file?: File) => {
    setIsProcessing(true);
    try {
      let data: any;
      
      if (file) {
        // Use FormData for file uploads (OCR path)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('text', intent || 'Proses dokumen ini');
        
        data = await fetchClient('/vibe/intent', {
          method: 'POST',
          body: formData,
          headers: {
            // fetchClient handles multipart/form-data correctly if body is FormData
          }
        });
      } else {
        // Normal text intent
        data = await fetchClient('/vibe/intent', {
          method: 'POST',
          body: JSON.stringify({ text: intent })
        });
      }
      
      if (data && Array.isArray(data.items)) {
        setVibeItems(data.items);
        setProcessor(data.processor);
        
        // Success message for transactions - Sync Global Store
        const hasAction = data.items.some((item: any) => item.type === 'message' && item.title.includes('Berhasil'));
        if (hasAction) {
          toast.success("Transaksi telah diproses dan disimpan.");
          useAccountingStore.getState().refreshAll(); // <--- SYNC GLOBAL LANDSCAPE
        }
      } else {
        toast.error("Format data dari AI tidak valid.");
      }
    } catch (error) {
      console.error("Vibe Error:", error);
      toast.error("Gagal terhubung ke Vibe Engine.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-primary/5 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-16 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary/10 blur-3xl rounded-full -z-10 animate-pulse" />
          <h1 className="text-5xl font-black tracking-tight mb-3 bg-gradient-to-r from-primary via-blue-600 to-indigo-600 bg-clip-text text-transparent">
            LIQUID UI
          </h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2 font-medium tracking-wide">
            TRANSACTIONAL AI ORCHESTRATOR
            {isProcessing && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
          </p>
        </header>

        <Omnibar onIntent={processIntent} disabled={isProcessing} />
        
        <main className="relative min-h-[400px]">
          {isProcessing && (
             <div className="absolute inset-x-0 top-0 flex flex-col items-center justify-center pt-12 z-20 space-y-4 animate-in fade-in duration-500">
                <div className="flex gap-1">
                   <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                   <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                   <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                </div>
                <p className="text-sm font-mono text-primary/60 animate-pulse">Menghubungkan konteks bisnis...</p>
             </div>
          )}
          
          <div className={cn(
            "transition-all duration-700",
            isProcessing ? "opacity-30 blur-sm scale-[0.98]" : "opacity-100 blur-0 scale-100"
          )}>
            <VibeRenderer items={vibeItems} processor={processor} />
          </div>
        </main>
      </div>
    </div>
  );
};

// Utility function to merge classes
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

export default LiquidDashboard;
