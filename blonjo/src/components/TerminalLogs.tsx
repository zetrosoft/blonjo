import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, Copy, Check, ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import { Button } from './ui/button';
import { fetchClient } from '../api/client';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

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
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedPromptId, setExpandedPromptId] = useState<number | null>(null);
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

  const handleCopyLog = (log: AIParsingLogResponse) => {
    const formattedJson = (() => {
      try {
        return JSON.stringify(JSON.parse(log.parsed_result), null, 2);
      } catch {
        return log.parsed_result;
      }
    })();

    const content = `[${formatDate(log.created_at)}] PROCESSOR: ${log.processor.toUpperCase()} (TOKENS IN: ${log.token_in} | OUT: ${log.token_out})
INPUT: ${log.original_text}
PROMPT: ${log.prompt || 'N/A'}
RESULT:
${formattedJson}`;

    navigator.clipboard.writeText(content);
    setCopiedId(log.id);
    toast.success("Log berhasil disalin ke clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} berhasil disalin!`);
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
          : "bottom-4 right-4 w-full max-w-[650px] h-[450px] rounded-xl border"
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px] sm:text-xs text-left">
        {error && (
          <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 mb-4">
            ERR: {error}
          </div>
        )}
        {/* Quota Dashboard Section */}
        {quotas.length > 0 && (
          <div className="mb-4 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/80">
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
          <div key={log.id} className="border-b border-zinc-800/60 pb-3 space-y-1.5 group">
            {/* Header Item Log */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="text-blue-400">[{formatDate(log.created_at)}]</span>
                <span className="text-zinc-400">PROCESSOR:</span>
                <span className={cn(
                  "font-bold px-1.5 py-0.5 rounded text-[10px]",
                  log.processor === 'ollama' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                  log.processor === 'gemini' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                )}>
                  {log.processor.toUpperCase()}
                </span>
                <span className="text-zinc-400">TOKENS (IN:</span>
                <span className="text-emerald-400 font-bold">{log.token_in}</span>
                <span className="text-zinc-400">| OUT:</span>
                <span className="text-emerald-400 font-bold">{log.token_out}</span>
                <span className="text-zinc-400">)</span>
              </div>

              {/* Tombol Copy per Log */}
              <button
                onClick={() => handleCopyLog(log)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                title="Copy seluruh log item ini"
              >
                {copiedId === log.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-zinc-400" />
                    <span>Copy Log</span>
                  </>
                )}
              </button>
            </div>
            
            <div className="flex flex-col gap-1.5 ml-2">
              {/* Input Text */}
              <div className="flex items-start gap-2">
                <span className="text-rose-400 select-none mt-0.5">➜</span>
                <div className="text-zinc-300 break-all flex-1">
                  <span className="font-semibold text-zinc-400">
                    {log.original_text.startsWith('AI TRAINING') ? 'TRAINING' : 
                     log.original_text.startsWith('OCR FILE') ? 'OCR' : 'INPUT'}:
                  </span>{' '}
                  <span className="text-zinc-100 font-medium">{log.original_text}</span>
                </div>
              </div>

              {/* Dynamic Prompt */}
              <div className="flex items-start gap-2">
                <span className="text-amber-400 select-none mt-0.5">⚡</span>
                <div className="text-zinc-300 flex-1 w-full overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-amber-400/90">DYNAMIC PROMPT:</span>
                    {log.prompt ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setExpandedPromptId(expandedPromptId === log.id ? null : log.id)}
                          className="flex items-center gap-1 text-[10px] text-amber-300/80 hover:text-amber-300 underline"
                        >
                          {expandedPromptId === log.id ? (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              <span>Sembunyikan</span>
                            </>
                          ) : (
                            <>
                              <ChevronRight className="w-3 h-3" />
                              <span>Tampilkan Full ({log.prompt.length} Karakter)</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleCopyText(log.prompt || '', 'Dynamic Prompt')}
                          className="text-[10px] text-zinc-400 hover:text-amber-400 flex items-center gap-1 ml-1"
                          title="Copy Dynamic Prompt saja"
                        >
                          <FileCode2 className="w-3 h-3" />
                          <span>Copy Prompt</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-zinc-500 italic">N/A (Standard Static System Prompt)</span>
                    )}
                  </div>

                  {log.prompt && expandedPromptId === log.id && (
                    <pre className="mt-1.5 bg-amber-950/20 border border-amber-500/20 p-2.5 rounded-md text-amber-200/90 whitespace-pre-wrap break-all text-[10px] font-mono shadow-inner max-h-[250px] overflow-y-auto">
                      {log.prompt}
                    </pre>
                  )}
                </div>
              </div>

              {/* Parsed Result */}
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 select-none mt-0.5">✔</span>
                <div className="text-zinc-300 flex-1 w-full overflow-x-hidden">
                  <span className="font-semibold text-emerald-400">RESULT:</span>
                  <pre className="mt-1 bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800/80 text-zinc-200 whitespace-pre-wrap break-all w-full overflow-hidden text-[10px] font-mono">
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

