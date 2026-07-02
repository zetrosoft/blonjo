/**
 * VoiceRecorder Component
 * ========================
 * Menggunakan Web Speech API yang built-in di browser.
 * TIDAK mengirim data audio ke server eksternal — Privacy-safe.
 * 
 * @security Voice data diproses 100% lokal di browser (Google/Apple speech engine)
 * @requires HTTPS di production
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Square, Volume2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { fetchClient } from '../api/client';
import { applyVoiceRules, VoiceRule, defaultVoiceRules, sanitizeVoiceRules } from '../lib/voiceRules';
import { VoiceRuleDialog } from './VoiceRuleDialog';

interface VoiceRecorderProps {
  onTranscript: (text: string, isInterim: boolean) => void;
  disabled?: boolean;
  initialText?: string;
}

// Type declarations untuk Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function VoiceRecorder({ onTranscript, disabled = false, initialText = '' }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeRules, setActiveRules] = useState<VoiceRule[]>(defaultVoiceRules);
  const activeRulesRef = useRef<VoiceRule[]>(defaultVoiceRules);
  const recognitionRef = useRef<any>(null);

  // Sync ref dengan state untuk menghindari stale closure di event listener recognition
  useEffect(() => {
    activeRulesRef.current = activeRules;
  }, [activeRules]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
    
    // Fetch custom voice rules if any
    fetchClient('/settings/voice_rules')
      .then((data: any) => {
        if (data && data.value) {
          const sanitized = sanitizeVoiceRules(JSON.parse(data.value));
          setActiveRules(sanitized);
        }
      })
      .catch(() => {
        // Abaikan jika setting belum dibuat atau gagal dimuat (gunakan default)
      });
  }, []);

  const [pulse, setPulse] = useState(false);

  // Efek pulse sederhana tanpa perlu AnalyserNode agar lebih hemat resource
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => setPulse(p => !p), 500);
      return () => clearInterval(interval);
    } else {
      setPulse(false);
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (disabled) return;
    setErrorMsg('');
    setInterimText('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalSegments: string[] = initialText.trim() ? [initialText.trim()] : [];

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let transcript = result[0].transcript as string;
        
        if (result.isFinal) {
            const lower = transcript.toLowerCase().trim();
            // Voice Commands
            const hapusKataMatch = lower.match(/^(?:hapus|buang|kurangi|mundur)\s+(\d+)\s+kata$/);
            const gantiMatch = lower.match(/^(?:ganti|ubah)\s+(.+?)\s+(?:dengan|jadi)\s+(.+)$/);
            
            if (hapusKataMatch) {
                const numWords = parseInt(hapusKataMatch[1], 10);
                let words = finalSegments.join(' ').trim().split(/\s+/);
                if (words.length > 0 && words[0] !== "") {
                    words.splice(Math.max(0, words.length - numWords), numWords);
                    finalSegments = words.length > 0 ? [words.join(' ')] : [];
                }
            } else if (['salah', 'hapus', 'batal', 'ralat', 'salah dengar', 'bukan itu', 'hapus baris'].includes(lower)) {
                // Hapus kalimat/segment terakhir
                if (finalSegments.length > 0) {
                    finalSegments.pop();
                }
            } else if (['hapus semua', 'bersihkan', 'reset', 'kosongkan', 'ulangi dari awal', 'bersihkan semua'].includes(lower)) {
                // Bersihkan semua segment
                finalSegments = [];
            } else if (gantiMatch) {
                const targetWord = gantiMatch[1].trim();
                const replacementWord = gantiMatch[2].trim();
                if (targetWord && replacementWord) {
                    finalSegments = finalSegments.map(seg => {
                        const regex = new RegExp(targetWord, 'gi');
                        return seg.replace(regex, replacementWord);
                    });
                }
            } else {
               const processed = applyVoiceRules(transcript.trim(), activeRulesRef.current);
               if (processed.includes('[STOP]')) {
                   const cleanText = processed.replace('[STOP]', '').trim();
                   if (cleanText) finalSegments.push(cleanText);
                   if (recognitionRef.current) {
                       recognitionRef.current.stop();
                   }
               } else {
                   finalSegments.push(processed);
               }
           }
        } else {
          const interimProcessed = applyVoiceRules(transcript, activeRulesRef.current);
          if (interimProcessed.includes('[STOP]')) {
              interim += interimProcessed.replace('[STOP]', '').trim();
              if (recognitionRef.current) {
                  recognitionRef.current.stop();
              }
          } else {
              interim += interimProcessed;
          }
        }
      }
      setInterimText(interim);
      
      const currentFinal = finalSegments.join(' ');
      const space = currentFinal && interim ? ' ' : '';
      onTranscript((currentFinal + space + interim).trim(), true);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setErrorMsg('Izin mikrofon ditolak.');
      } else if (event.error === 'network') {
        setErrorMsg('Tidak ada internet.');
      } else if (event.error !== 'aborted') {
        setErrorMsg(`Error: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText('');
      const currentFinal = finalSegments.join(' ');
      if (currentFinal.trim()) {
        onTranscript(currentFinal.trim(), false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [disabled, onTranscript]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  if (!isSupported) {
    return null; // Sembunyikan icon mic jika browser tidak support
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {errorMsg && (
        <div className="absolute bottom-full mb-2 right-0 bg-rose-500/90 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap">
          {errorMsg}
        </div>
      )}
      <div className="relative">
        <div className="absolute -top-3 -right-3 z-10">
          <VoiceRuleDialog />
        </div>
        {isRecording && (
          <>
            <div
              className={cn(
                "absolute -inset-1 rounded-full bg-rose-500/30 transition-all duration-300",
                pulse ? "scale-150 opacity-0" : "scale-100 opacity-100"
              )}
            />
            <div className="absolute -inset-2 rounded-full bg-rose-500/10 animate-pulse" />
          </>
        )}
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled}
          size="icon"
          className={cn(
            'relative w-10 h-10 rounded-full transition-all duration-300 shadow-md',
            isRecording
              ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/40'
              : 'bg-primary/90 hover:bg-primary text-primary-foreground backdrop-blur-sm'
          )}
        >
          {isRecording ? (
            <Square className="w-4 h-4 fill-current" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
