import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from './ui/button';
import { fetchClient } from '../api/client';
import { cn } from '../lib/utils';

interface AIParsingLogResponse {
  id: number;
  original_text: string;
  prompt: string | null;
  parsed_result: string;
  token_in: number;
  token_out: number;
  processor: string;
  created_at: string;
}

interface AIModelQuotaResponse {
  model_name: string;
  request_count: number;
  limit: number;
  token_count: number;
}

export function TerminalLogs() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [logs, setLogs] = useState<AIParsingLogResponse[]>([]);
  const [quotas, setQuotas] = useState<AIModelQuotaResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Initial load
      loadData();
      
      const interval = setInterval(() => {
        if (!isPaused) {
          loadData();
        }
      }, 5000); 
      
      return () => clearInterval(interval);
    }
  }, [isOpen, isPaused]);

  useEffect(() => {
    if (endRef.current && isOpen && logs.length > 0) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [logsData, quotaData] = await Promise.all([
        fetchClient('/finance/parsing-logs?limit=50'),
        fetchClient('/finance/ai-quotas')
      ]);
      
      if (Array.isArray(logsData)) {
        // Clone before reverse because it mutates
        setLogs([...logsData].reverse());
      }
      
      if (Array.isArray(quotaData)) {
        setQuotas(quotaData);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load terminal data', err);
      setError(err.message || 'Connection lost');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-900 text-zinc-400 border border-zinc-800 shadow-lg z-50 transition-all duration-300"
        title="Open AI Terminal Logs"
      >
        <TerminalIcon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono font-medium text-blue-400">activity log</span>
      </button>
    );
  }

  return (
    <div 
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={cn(
        "fixed z-[100] font-mono transition-all duration-300 ease-in-out flex flex-col bg-zinc-950/95 backdrop-blur-md border-zinc-800 shadow-2xl overflow-hidden",
        isFullscreen 
          ? "inset-0 rounded-none" 
          : "bottom-4 right-4 w-full max-w-[600px] h-[400px] rounded-xl border"
      )}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-bold text-zinc-300 tracking-wider">AI_ENGINE_LOGS ~ /var/log/ai</span>
          {isPaused && (
            <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded animate-pulse">
              PAUSED (CURSOR ACTIVE)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200">
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-rose-500/20 rounded text-zinc-400 hover:text-rose-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-[11px] sm:text-xs text-left">
        {error && (
          <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 mb-4">
            ERR: {error}
          </div>
        )}
        {/* Quota Dashboard Section */}
        {quotas.length > 0 && (
          <div className="mb-6 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2 flex justify-between">
              <span>AI Quota Monitoring (ESTIMATED RPD)</span>
              <span className="text-emerald-500 animate-pulse">AUTO-SWITCH ACTIVE</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {quotas.map(q => (
                <div key={q.model_name} className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="font-mono text-zinc-300">{q.model_name.toUpperCase()}</span>
                    <span className="text-zinc-400">{q.request_count} / {q.limit || '∞'}</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        (q.request_count / q.limit) > 0.9 ? "bg-rose-500" : 
                        (q.request_count / q.limit) > 0.7 ? "bg-yellow-500" : "bg-blue-500"
                      )}
                      style={{ width: `${Math.min(100, (q.request_count / (q.limit || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.map((log) => (
          <div key={log.id} className="border-b border-zinc-800/50 pb-3">
            <div className="flex flex-wrap items-center gap-2 text-zinc-500 mb-1">
              <span className="text-blue-400">[{formatDate(log.created_at)}]</span>
              <span className="text-zinc-400">PROCESSOR:</span>
              <span className={cn(
                "font-bold",
                log.processor === 'ollama' ? 'text-blue-500' :
                log.processor === 'gemini' ? 'text-rose-500' : 'text-yellow-400'
              )}>
                {log.processor.toUpperCase()}
              </span>
              <span className="text-zinc-400 ml-2">TOKENS (IN:</span>
              <span className="text-emerald-400">{log.token_in}</span>
              <span className="text-zinc-400">| OUT:</span>
              <span className="text-emerald-400">{log.token_out}</span>
              <span className="text-zinc-400">)</span>
            </div>
            
            <div className="flex flex-col gap-1.5 ml-2">
              <div className="flex gap-2">
                <span className="text-rose-400 select-none">➜</span>
                <span className="text-zinc-300 break-all">
                  {log.original_text.startsWith('AI TRAINING') ? 'TRAINING' : 
                   log.original_text.startsWith('OCR FILE') ? 'OCR' : 'INPUT'}: <span className="text-zinc-100">{log.original_text}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-rose-400 select-none">➜</span>
                <span className="text-zinc-300 break-all">PROMPT: <span className="text-zinc-400 italic">{log.prompt || 'N/A'}</span></span>
              </div>
              <div className="flex gap-2">
                <span className="text-emerald-400 select-none">✔</span>
                <div className="text-zinc-300 flex-1 w-full overflow-x-hidden">
                  RESULT: 
                  <pre className="mt-1 bg-zinc-900/50 p-2 rounded border border-zinc-800/80 text-zinc-300 whitespace-pre-wrap break-all w-full overflow-hidden text-[10px]">
                    {log.parsed_result.startsWith('{') || log.parsed_result.startsWith('[') 
                      ? (() => {
                          try {
                            return JSON.stringify(JSON.parse(log.parsed_result), null, 2);
                          } catch {
                            return log.parsed_result;
                          }
                        })()
                      : log.parsed_result
                    }
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ))}
        {logs.length === 0 && !loading && (
          <div className="text-zinc-500 italic">No parsing logs available yet.</div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
