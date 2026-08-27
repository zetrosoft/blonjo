import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../../api/client';
import { 
  Send, Bot, User, Loader2, Sparkles, Copy, 
  Check, ThumbsUp, ThumbsDown, Plus, MessageSquare, 
  Trash2, ChevronLeft, ChevronRight, BarChart3, 
  PieChart, LineChart, Table2, RefreshCw, Printer, Download,
  ArrowRight, FileSpreadsheet, Share2
} from 'lucide-react';
import { Button } from '../../components/ui/button';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  created_at?: string;
}

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChartData {
  title?: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string[];
  }>;
}

/**
 * Utility: Export Markdown Table to CSV / Excel Download
 */
function downloadTableAsCSV(markdownContent: string, filename = 'Laporan_Keuangan_Toko.csv') {
  try {
    const lines = markdownContent.split('\n');
    const tableLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
    if (tableLines.length === 0) return;

    const csvRows: string[] = [];
    for (const line of tableLines) {
      // Abaikan separator baris tabel (|---|---|)
      if (line.includes('---') || line.includes(':---')) continue;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map(c => `"${c.trim().replace(/"/g, '""').replace(/\*\*/g, '')}"`);
      csvRows.push(cells.join(','));
    }

    const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export CSV:', err);
  }
}

/**
 * Utility: Print / Export to PDF
 */
function printTableReport(content: string, title = 'Laporan Keuangan Toko') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; }
          h2 { margin-bottom: 4px; color: #0f172a; }
          p.subtitle { color: #64748b; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; text-align: right; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <p class="subtitle">Dicetak otomatis dari Blonjo Smart Assistant pada ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</p>
        <div id="table-container"></div>
        <div class="footer">Sistem Akuntansi & Manajemen Ritel Blonjo</div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Komponen Visual Chart Interaktif untuk Blok ```chart:bar, ```chart:donut, ```chart:line
 */
const InteractiveVisualChart: React.FC<{ type: 'bar' | 'donut' | 'line'; rawJson: string }> = ({ type, rawJson }) => {
  try {
    const data: ChartData = JSON.parse(rawJson);
    const labels = data.labels || [];
    const dataset = data.datasets?.[0] || { label: 'Nilai', data: [] };
    const values = dataset.data || [];
    const maxVal = Math.max(...values, 1);

    const colors = [
      '#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', 
      '#8b5cf6', '#06b6d4', '#14b8a6', '#f97316', '#84cc16'
    ];

    if (type === 'donut') {
      const total = values.reduce((a, b) => a + b, 0);
      let cumulativePercent = 0;

      return (
        <div className="my-4 p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
          {data.title && (
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <PieChart className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">{data.title}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* SVG Donut */}
            <div className="relative flex items-center justify-center h-44">
              <svg viewBox="0 0 36 36" className="w-36 h-36 transform -rotate-90">
                {values.map((val, idx) => {
                  const percent = total > 0 ? (val / total) * 100 : 0;
                  const strokeDasharray = `${percent} ${100 - percent}`;
                  const strokeDashoffset = -cumulativePercent;
                  cumulativePercent += percent;
                  return (
                    <circle
                      key={idx}
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke={colors[idx % colors.length]}
                      strokeWidth="4"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-500 hover:opacity-80"
                    />
                  );
                })}
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-slate-400 font-medium">Total</span>
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                  Rp {total.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
            {/* Legend */}
            <div className="space-y-1.5 text-xs">
              {labels.map((lbl, idx) => {
                const val = values[idx] || 0;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                return (
                  <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                      <span className="truncate text-slate-700 dark:text-slate-300 font-medium">{lbl}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Rp {val.toLocaleString('id-ID')}</span>
                      <span className="text-[10px] text-slate-400">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // Line Chart Renderer (SVG Polyline & Data Points)
    if (type === 'line') {
      const allVals = data.datasets ? data.datasets.flatMap(d => d.data) : values;
      const globalMax = Math.max(...allVals, 1);
      const svgWidth = 500;
      const svgHeight = 160;
      const padX = 40;
      const padY = 25;

      return (
        <div className="my-4 p-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          {data.title && (
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">{data.title}</span>
              </div>
              {data.datasets && data.datasets.length > 1 && (
                <div className="flex items-center gap-2">
                  {data.datasets.map((ds, dIdx) => (
                    <div key={dIdx} className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[dIdx % colors.length] }} />
                      <span>{ds.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-40">
              {/* Grid Lines */}
              <line x1={padX} y1={padY} x2={svgWidth - 20} y2={padY} stroke="#94a3b8" strokeDasharray="3 3" strokeOpacity="0.3" />
              <line x1={padX} y1={svgHeight / 2} x2={svgWidth - 20} y2={svgHeight / 2} stroke="#94a3b8" strokeDasharray="3 3" strokeOpacity="0.3" />
              <line x1={padX} y1={svgHeight - padY} x2={svgWidth - 20} y2={svgHeight - padY} stroke="#94a3b8" strokeOpacity="0.4" />

              {/* Datasets Polyline */}
              {(data.datasets && data.datasets.length > 0 ? data.datasets : [dataset]).map((ds, dIdx) => {
                const color = colors[dIdx % colors.length];
                const points = ds.data.map((val, idx) => {
                  const x = padX + (idx / Math.max(labels.length - 1, 1)) * (svgWidth - padX - 30);
                  const y = (svgHeight - padY) - (val / globalMax) * (svgHeight - 2 * padY);
                  return `${x},${y}`;
                }).join(' ');

                return (
                  <g key={dIdx}>
                    <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
                    {ds.data.map((val, idx) => {
                      const x = padX + (idx / Math.max(labels.length - 1, 1)) * (svgWidth - padX - 30);
                      const y = (svgHeight - padY) - (val / globalMax) * (svgHeight - 2 * padY);
                      return (
                        <circle key={idx} cx={x} cy={y} r="3.5" fill={color} className="hover:r-5 transition-all">
                          <title>{`${labels[idx] || ''}: Rp ${val.toLocaleString('id-ID')}`}</title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}

              {/* X Labels */}
              {labels.map((lbl, idx) => {
                const x = padX + (idx / Math.max(labels.length - 1, 1)) * (svgWidth - padX - 30);
                return (
                  <text key={idx} x={x} y={svgHeight - 6} fontSize="9" fill="#94a3b8" textAnchor="middle">
                    {lbl}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      );
    }

    // Default: Multi-Dataset Comparative Bar Chart
    const datasetsList = data.datasets && data.datasets.length > 0 ? data.datasets : [dataset];
    const allVals = datasetsList.flatMap(d => d.data);
    const globalMax = Math.max(...allVals, 1);

    return (
      <div className="my-4 p-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        {data.title && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">{data.title}</span>
            </div>
            {datasetsList.length > 1 && (
              <div className="flex items-center gap-3">
                {datasetsList.map((ds, dIdx) => (
                  <div key={dIdx} className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[dIdx % colors.length] }} />
                    <span>{ds.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="space-y-3">
          {labels.map((lbl, idx) => {
            return (
              <div key={idx} className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5 border border-slate-100 dark:border-slate-800/60">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">{lbl}</span>
                <div className="space-y-1">
                  {datasetsList.map((ds, dIdx) => {
                    const val = ds.data[idx] || 0;
                    const pct = Math.max(3, (val / globalMax) * 100);
                    const color = colors[dIdx % colors.length];
                    return (
                      <div key={dIdx} className="space-y-0.5">
                        <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          <span>{datasetsList.length > 1 ? ds.label : ''}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">Rp {val.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="w-full bg-slate-200/60 dark:bg-slate-700/60 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (e) {
    return (
      <pre className="p-3 my-2 text-xs bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto text-slate-700 dark:text-slate-300">
        {rawJson}
      </pre>
    );
  }
};

const GraphCodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap: Record<string, string> = {
      dot: 'dot',
      graphml: 'graphml',
      cypher: 'cyp',
      mermaid: 'mmd'
    };
    const ext = extMap[language.toLowerCase()] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph_export_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const titleMap: Record<string, string> = {
    dot: 'DOT (Graphviz Graph)',
    graphml: 'GraphML (XML Graph Structure)',
    cypher: 'Cypher (Graph Query Pattern)',
    mermaid: 'Mermaid (Visual Diagram)'
  };

  return (
    <div className="my-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-950/90 border-b border-slate-800">
        <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
          <Share2 className="w-3.5 h-3.5" />
          {titleMap[language.toLowerCase()] || language.toUpperCase()}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Tersalin' : 'Salin'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-900 rounded-lg transition-colors border border-indigo-800/50"
            title="Download file graf"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>
        </div>
      </div>
      <pre className="p-3.5 text-xs font-mono overflow-x-auto text-emerald-300 bg-slate-950/40">
        {code}
      </pre>
    </div>
  );
};

export default function VibesChat() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'up' | 'down'>>({});
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea up to 5 lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // 1. Fetch Sessions List on Mount
  const fetchSessions = async () => {
    try {
      const res: any = await apiClient.get('/insights/sessions');
      const sessList = Array.isArray(res) ? res : (res?.data || []);
      setSessions(sessList);
      return sessList;
    } catch (err) {
      console.error('Gagal mengambil daftar sesi:', err);
      return [];
    }
  };

  // 2. Load Session Messages
  const loadSession = async (sessionId: number) => {
    try {
      setInitialLoading(true);
      setCurrentSessionId(sessionId);
      const res: any = await apiClient.get(`/insights/sessions/${sessionId}`);
      const data = res?.data || res;
      if (data && data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error(`Gagal memuat pesan sesi ${sessionId}:`, err);
    } finally {
      setInitialLoading(false);
    }
  };

  // 3. Start New Fresh Session
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([
      {
        role: 'assistant',
        content: 'Halo! Saya Asisten Virtual untuk toko Anda. Senang bisa mendampingi pengelolaan dan pemantauan bisnis Anda hari ini. Ada hal atau data operasional yang ingin kita tinjau bersama?'
      }
    ]);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // 4. Delete a Session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    if (!confirm('Apakah Anda yakin ingin menghapus riwayat obrolan ini?')) return;
    try {
      await apiClient.delete(`/insights/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error(`Gagal menghapus sesi ${sessionId}:`, err);
    }
  };

  // Initial Load Trigger
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      const sessList = await fetchSessions();
      if (sessList.length > 0) {
        await loadSession(sessList[0].id);
      } else {
        try {
          const res: any = await apiClient.post('/insights/chat', {
            message: "Halo! Berikan sapaan hangat dan ringkas sebagai asisten virtual toko, lalu tanyakan bagaimana saya bisa mendampingi operasional toko hari ini."
          });
          const ans = res?.answer || res?.data?.answer;
          const sessId = res?.session_id || res?.data?.session_id;
          if (sessId) {
            setCurrentSessionId(sessId);
            fetchSessions();
          }
          setMessages([
            {
              role: 'assistant',
              content: ans || "Halo! Saya Asisten Virtual untuk toko Anda. Ada yang ingin kita diskusikan mengenai kondisi toko hari ini?",
              sources: res?.sources || res?.data?.sources
            }
          ]);
        } catch (e) {
          handleNewChat();
        } finally {
          setInitialLoading(false);
        }
      }
    };
    init();
  }, []);

  // Send Message (Supports direct query parameter for suggestion clicks)
  const handleSend = async (queryText?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (queryText || input).trim();
    if (!query || sending) return;

    const userMsg: Message = { role: 'user', content: query };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSending(true);

    try {
      const historyPayload = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res: any = await apiClient.post('/insights/chat', {
        message: query,
        session_id: currentSessionId,
        history: historyPayload
      });

      const ans = res?.answer || res?.data?.answer;
      const sources = res?.sources || res?.data?.sources;
      const sessId = res?.session_id || res?.data?.session_id;

      if (sessId && sessId !== currentSessionId) {
        setCurrentSessionId(sessId);
      }
      fetchSessions();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: ans || "Maaf, saya tidak dapat merumuskan jawaban saat ini.",
          sources: sources
        }
      ]);
    } catch (err: any) {
      console.error('Error vibes chat:', err);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Maaf, terjadi kendala saat memproses permintaan Anda: ${err?.response?.data?.detail || err.message || 'Koneksi gagal'}`
        }
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleVote = (idx: number, vote: 'up' | 'down') => {
    setFeedbackState(prev => ({
      ...prev,
      [idx]: prev[idx] === vote ? undefined : vote
    } as any));
  };

  // Helper: Extract suggestions from message content
  const extractSuggestions = (content: string): { cleanContent: string; suggestions: string[] } => {
    const match = /<!--\s*SUGGESTIONS\s*-->([\s\S]*?)<!--\s*\/SUGGESTIONS\s*-->/i.exec(content);
    if (!match) {
      return { cleanContent: content, suggestions: [] };
    }
    const cleanContent = content.replace(match[0], '').trim();
    const suggestionsRaw = match[1].trim().split('\n');
    const suggestions = suggestionsRaw
      .map(s => s.replace(/^[-*•\d.]+\s*/, '').trim())
      .filter(s => s.length > 0)
      .slice(0, 3);

    return { cleanContent, suggestions };
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      
      {/* ── SUB-MENU / SIDEBAR RIWAYAT CHAT (KIRI) ── */}
      <div className={`shrink-0 transition-all duration-300 ease-in-out border-r border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl flex flex-col z-20 ${
        sidebarOpen ? 'w-64 md:w-72' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden'
      }`}>
        {/* Header Sidebar */}
        <div className="p-3 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
          <Button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 text-xs font-semibold shadow-md shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Obrolan Baru</span>
          </Button>
        </div>

        {/* List Sessions */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Riwayat Percakapan
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-3 text-slate-400 text-xs">
              Belum ada riwayat percakapan.
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`group relative flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                    isActive 
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200/60 dark:border-indigo-800/60 shadow-sm'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="truncate">{s.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-600 rounded text-slate-400 transition-opacity"
                    title="Hapus sesi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── AREA UTAMA CHAT (FULL-WIDTH LEBAR & LEGA) ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-transparent via-slate-50/20 to-indigo-50/10 dark:from-transparent dark:via-slate-950/20 dark:to-indigo-950/10 relative">
        
        {/* Top Floating Control Bar */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-slate-200/40 dark:border-slate-800/40 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
              title={sidebarOpen ? "Tutup panel riwayat" : "Buka panel riwayat"}
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Asisten Virtual Toko
                </h2>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Partner Diskusi Pintar & Analisa Bisnis Terpadu
                </p>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            className="h-7 text-xs gap-1 rounded-lg border-slate-200 dark:border-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Sesi Baru</span>
          </Button>
        </div>

        {/* Area Messages List */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          
          {/* Initial Loading Skeleton */}
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/10 flex items-center justify-center animate-pulse">
                  <Bot className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-bounce" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Menyiapkan data toko...
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Menghubungkan asisten virtual dengan kondisi operasional & keuangan terbaru toko Anda.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-indigo-500">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                <span className="text-xs font-semibold">Sedang menganalisa...</span>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const { cleanContent, suggestions } = !isUser ? extractSuggestions(msg.content) : { cleanContent: msg.content, suggestions: [] };
                const hasTable = cleanContent.includes('|') && cleanContent.includes('---');

                return (
                  <div
                    key={idx}
                    className={`flex flex-col gap-2 max-w-4xl mx-auto ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`flex gap-3 w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {!isUser && (
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20 mt-1">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div className={`flex flex-col space-y-1 max-w-[92%] md:max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                        
                        {/* Bubble Message */}
                        <div
                          className={`p-4 md:p-5 rounded-2xl text-xs md:text-sm leading-relaxed shadow-sm ${
                            isUser
                              ? 'bg-indigo-600 text-white rounded-br-none whitespace-pre-wrap'
                              : 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/70 dark:border-slate-800/70 text-slate-800 dark:text-slate-100 rounded-tl-none'
                          }`}
                        >
                          {isUser ? (
                            msg.content
                          ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ node, className, children, ...props }: any) {
                                    const match = /language-(\w+)(?::(\w+))?/.exec(className || '');
                                    const lang = match ? match[1] : '';
                                    const subType = match && match[2] ? match[2] : '';
                                    const codeContent = String(children).replace(/\n$/, '');

                                    if (lang === 'chart') {
                                      const cType = (subType || 'bar') as 'bar' | 'donut' | 'line';
                                      return <InteractiveVisualChart type={cType} rawJson={codeContent} />;
                                    }

                                    if (['dot', 'graphml', 'cypher', 'mermaid'].includes(lang.toLowerCase())) {
                                      return <GraphCodeBlock language={lang} code={codeContent} />;
                                    }

                                    return (
                                      <code className={`${className} bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono text-xs`} {...props}>
                                        {children}
                                      </code>
                                    );
                                  },
                                  table({ children }) {
                                    return (
                                      <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 shadow-sm">
                                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-xs">
                                          {children}
                                        </table>
                                      </div>
                                    );
                                  },
                                  th({ children }) {
                                    return (
                                      <th className="bg-slate-100/90 dark:bg-slate-800/90 px-3.5 py-2.5 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                                        {children}
                                      </th>
                                    );
                                  },
                                  td({ children }) {
                                    return (
                                      <td className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                                        {children}
                                      </td>
                                    );
                                  }
                                }}
                              >
                                {cleanContent}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>

                        {/* Export Toolbar & Grounding Source Chips */}
                        {!isUser && (
                          <div className="flex flex-wrap items-center justify-between w-full pt-1.5 px-1 gap-2">
                            
                            {/* Table Action Buttons (Print PDF & Download Excel) */}
                            {hasTable && (
                              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 px-2 py-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
                                  <Table2 className="w-3 h-3 text-indigo-500" />
                                  Laporan:
                                </span>
                                <button
                                  onClick={() => printTableReport(cleanContent)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors"
                                  title="Cetak format PDF"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Cetak PDF</span>
                                </button>
                                <button
                                  onClick={() => downloadTableAsCSV(cleanContent)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 px-1.5 py-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                                  title="Download ke format Excel/CSV"
                                >
                                  <FileSpreadsheet className="w-3 h-3" />
                                  <span>Excel</span>
                                </button>
                              </div>
                            )}

                            {/* Quick Actions (Copy & Vote) */}
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => handleCopy(cleanContent, idx)}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                title="Salin respon"
                              >
                                {copiedIndex === idx ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => handleVote(idx, 'up')}
                                className={`p-1 rounded transition-colors ${feedbackState[idx] === 'up' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-indigo-600'}`}
                                title="Bermanfaat"
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleVote(idx, 'down')}
                                className={`p-1 rounded transition-colors ${feedbackState[idx] === 'down' ? 'text-rose-600 font-bold' : 'text-slate-400 hover:text-rose-600'}`}
                                title="Kurang akurat"
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {isUser && (
                        <div className="w-8 h-8 rounded-xl bg-slate-800 dark:bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-sm mt-1">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    {/* 🎯 CLICKABLE SUGGESTION CHIPS (Langkah / Pertanyaan Selanjutnya) */}
                    {!isUser && suggestions.length > 0 && (
                      <div className="pl-11 pr-2 w-full pt-1">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {suggestions.map((sug, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => handleSend(sug)}
                              disabled={sending}
                              className="group flex items-center gap-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/70 dark:border-indigo-800/70 px-3 py-1.5 rounded-full transition-all text-left shadow-2xs hover:shadow-xs disabled:opacity-50"
                            >
                              <Sparkles className="w-3 h-3 text-indigo-500 shrink-0 group-hover:rotate-12 transition-transform" />
                              <span>{sug}</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0 ml-0.5" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}

              {/* Sending Indicator */}
              {sending && (
                <div className="flex gap-3 max-w-4xl mx-auto justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 rounded-tl-none flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    <span className="text-xs text-slate-500 font-medium">Asisten sedang menyusun analisa dan data faktual toko...</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ── INPUT PROMPT MULTI-LINE TERBUKA & RAMAH ── */}
        <div className="p-4 md:px-8 border-t border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shrink-0">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={(e) => handleSend(undefined, e)} className="relative flex items-end gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/30 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ketik pesan atau tanyakan apa saja seputar operasional & bisnis toko Anda..."
                className="flex-1 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none p-2 text-xs md:text-sm placeholder:text-slate-400 text-slate-800 dark:text-slate-100 resize-none max-h-[120px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
              />
              <Button
                type="submit"
                size="icon"
                disabled={sending || !input.trim()}
                className="h-9 w-9 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white shadow-md shadow-indigo-500/20 disabled:opacity-50 transition-all shrink-0 mb-0.5"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <div className="flex justify-between items-center px-2 mt-1.5 text-[10px] text-slate-400">
              <span>Tekan <b>Enter</b> untuk mengirim, <b>Shift + Enter</b> untuk baris baru.</span>
              <span>Asisten Keuangan Terpadu</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
