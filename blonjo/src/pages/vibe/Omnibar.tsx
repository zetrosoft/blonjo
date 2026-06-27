import React, { useState, useRef } from 'react';
import { Search, Send, Paperclip, X, Mic } from 'lucide-react';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { SmartTextarea } from '@/components/SmartTextarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OmnibarProps {
  onIntent: (intent: string, file?: File) => void;
  disabled?: boolean;
}

export const Omnibar: React.FC<OmnibarProps> = ({ onIntent, disabled }) => {
  const [value, setValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((value.trim() || file) && !disabled) {
      onIntent(value, file || undefined);
      setValue('');
      setFile(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd+Enter or Ctrl+Enter for multiline support
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSend();
    }
  };

  const handleTranscript = (text: string, isInterim: boolean) => {
    setValue(text);
    if (!isInterim && text.trim()) {
      onIntent(text);
      setValue('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mb-12 space-y-4">
      <div className="relative group transition-all duration-300">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-blue-500/50 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-1000 group-focus-within:duration-200"></div>
        
        <div className="relative bg-background/80 backdrop-blur-md border-2 border-primary/10 rounded-2xl shadow-2xl overflow-hidden focus-within:border-primary/30 transition-all">
          <div className="p-1 pl-4 flex items-center justify-between border-b border-primary/5 bg-primary/5">
             <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary/60 uppercase">
                <Search className="w-3 h-3" />
                Vibe Orchestrator
             </div>
             <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <VoiceRecorder onTranscript={handleTranscript} disabled={disabled} />
             </div>
          </div>

          <div className="p-2">
            <SmartTextarea
              value={value}
              onChange={setValue}
              placeholder="Apa yang ingin Anda lakukan? (Ketik, Tempel Nota, atau Upload Dokument)"
              disabled={disabled}
              minRows={3}
              className="border-none bg-transparent focus-visible:ring-0 px-2 py-2 text-base"
            />
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,application/pdf"
            />
          </div>

          {file && (
            <div className="px-4 py-2 bg-primary/5 border-t border-primary/5 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2 text-xs text-primary font-medium">
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[200px]">{file.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setFile(null)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          <div className="p-2 flex justify-end bg-background/40">
            <Button 
              size="sm" 
              className="rounded-full px-6 shadow-lg shadow-primary/20" 
              onClick={handleSend}
              disabled={disabled || (!value.trim() && !file)}
            >
              <Send className="w-4 h-4 mr-2" />
              Execute
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex justify-center gap-4 text-[10px] text-muted-foreground/60 uppercase tracking-tighter">
        <span>Cmd + Enter untuk Kirim</span>
        <span>•</span>
        <span>Mendukung PDF & Gambar Nota</span>
        <span>•</span>
        <span>Otomatis Jurnal PSAK</span>
      </div>
    </div>
  );
};
