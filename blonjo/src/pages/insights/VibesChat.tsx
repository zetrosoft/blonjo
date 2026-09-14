import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { useTheme } from '../../components/theme-provider';
import apiClient from '../../api/client';
import { 
  Send, Bot, User, Loader2, Sparkles, Copy, 
  Check, ThumbsUp, ThumbsDown, Plus, MessageSquare, 
  Trash2, ChevronLeft, ChevronRight, BarChart3, 
  PieChart, LineChart, RefreshCw, Download,
  ArrowRight, Share2, Eye, Code, Maximize2,
  Minimize2, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Image as ImageIcon,
  X, Pin, PinOff, Bookmark, BookmarkCheck, Lightbulb, Wallet, GitBranch,
  Layers, TrendingUp, Tag, Package, ExternalLink, Compass, Zap, MoreVertical,
  Pencil
} from 'lucide-react';
import { UniversalPlotlyChart } from '../../components/UniversalPlotlyChart';
import { Button } from '../../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  created_at?: string;
  execution_time_ms?: number;
  prompt_used?: string;
  actions?: Array<{ label: string; path: string }>;
  suggestions?: string[];
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
 * Komponen Visual Chart Universal & Interaktif (Plotly Engine) - Memoized
 */
const InteractiveVisualChart = React.memo<{ type: string; rawJson: string }>(({ type, rawJson }) => {
  return <UniversalPlotlyChart rawContent={rawJson} chartType={type} />;
});


const GraphCodeBlock = React.memo<{ language: string; code: string }>(({ language, code }) => {
  const { theme } = useTheme();
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const elementId = `mermaid-chart-${reactId}`;
  
  const isMermaid = language.toLowerCase() === 'mermaid';
  const [viewMode, setViewMode] = useState<'visual' | 'code'>(isMermaid ? 'visual' : 'code');
  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Deteksi tema aktif
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (!isMermaid || !code.trim()) return;

    let isMounted = true;
    setIsRendering(true);
    setRenderError(null);

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDarkMode ? 'dark' : 'neutral',
        securityLevel: 'loose',
        fontFamily: 'Inter, system-ui, sans-serif',
        themeVariables: isDarkMode ? {
          darkMode: true,
          background: '#0f172a',
          primaryColor: '#6366f1',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#818cf8',
          lineColor: '#94a3b8',
          secondaryColor: '#334155',
          tertiaryColor: '#1e293b'
        } : {
          darkMode: false,
          background: '#ffffff',
          primaryColor: '#4f46e5',
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#6366f1',
          lineColor: '#64748b',
          secondaryColor: '#f1f5f9',
          tertiaryColor: '#e2e8f0'
        }
      });

      // Render diagram
      mermaid.render(elementId, code.trim()).then(({ svg }) => {
        if (isMounted) {
          setSvgContent(svg);
          setIsRendering(false);
        }
      }).catch((err) => {
        console.warn('[Mermaid] Rendering error:', err);
        if (isMounted) {
          setRenderError(err?.message || 'Sintaks diagram tidak valid');
          setIsRendering(false);
        }
      });
    } catch (err: any) {
      console.warn('[Mermaid] Init error:', err);
      if (isMounted) {
        setRenderError(err?.message || 'Gagal memproses diagram');
        setIsRendering(false);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [code, isDarkMode, isMermaid, elementId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCode = () => {
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
    a.download = `graph_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSVG = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = () => {
    if (!svgContent) return;
    try {
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const URLObj = window.URL || window.webkitURL || window;
      const blobURL = URLObj.createObjectURL(svgBlob);
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement('canvas');
        const scaleFactor = 2; // High DPI export
        canvas.width = (image.width || 800) * scaleFactor;
        canvas.height = (image.height || 600) * scaleFactor;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        context.fillStyle = isDarkMode ? '#0f172a' : '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `diagram_${Date.now()}.png`;
        downloadLink.click();
        URLObj.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (e) {
      console.error('Failed to export PNG:', e);
      handleDownloadSVG();
    }
  };

  const titleMap: Record<string, string> = {
    dot: 'DOT (Graphviz Graph)',
    graphml: 'GraphML (XML Graph)',
    cypher: 'Cypher (Graph Query)',
    mermaid: 'Visual Flow & Architecture Diagram'
  };

  return (
    <>
      <div className="my-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-900/90 shadow-sm overflow-hidden backdrop-blur-md">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/90 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5" />
              {titleMap[language.toLowerCase()] || language.toUpperCase()}
            </span>

            {/* Switch Tab Visual / Code (Khusus Mermaid) */}
            {isMermaid && !renderError && (
              <div className="flex items-center bg-slate-200/70 dark:bg-slate-800/70 p-0.5 rounded-lg ml-1.5">
                <button
                  type="button"
                  onClick={() => setViewMode('visual')}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                    viewMode === 'visual'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Visual</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('code')}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                    viewMode === 'code'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Code className="w-3 h-3" />
                  <span>Kode</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5">
            {viewMode === 'visual' && svgContent && (
              <>
                {/* Zoom Controls */}
                <div className="hidden sm:flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800/50 px-1 py-0.5 rounded-lg mr-1 text-slate-600 dark:text-slate-300">
                  <button
                    type="button"
                    onClick={() => setZoom(prev => Math.max(0.6, prev - 0.15))}
                    className="p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Perkecil (-)"
                  >
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] font-mono w-7 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setZoom(prev => Math.min(2.0, prev + 0.15))}
                    className="p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Perbesar (+)"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Reset Zoom"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>

                {/* Fullscreen Button */}
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800/80 hover:bg-slate-300/60 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="Tampilan Penuh"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span className="hidden md:inline">Perbesar</span>
                </button>

                {/* Export PNG */}
                <button
                  type="button"
                  onClick={handleDownloadPNG}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors border border-indigo-200/60 dark:border-indigo-800/60"
                  title="Unduh format gambar PNG"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">PNG</span>
                </button>
              </>
            )}

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800/80 hover:bg-slate-300/60 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Salin ke clipboard"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Tersalin' : 'Salin'}</span>
            </button>

            {/* Export Code / SVG */}
            <button
              type="button"
              onClick={viewMode === 'visual' && svgContent ? handleDownloadSVG : handleDownloadCode}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800/80 hover:bg-slate-300/60 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Download file"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {viewMode === 'visual' && isMermaid ? (
          <div className="relative p-4 overflow-x-auto min-h-[140px] flex items-center justify-center bg-slate-50/40 dark:bg-slate-950/40">
            {isRendering && (
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-6 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                <span>Merender diagram visual...</span>
              </div>
            )}

            {renderError ? (
              <div className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Tidak dapat menampilkan visual diagram (sintaks output tidak kompatibel).</span>
                </div>
                <pre className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                  {code}
                </pre>
              </div>
            ) : svgContent ? (
              <div 
                className="w-full flex items-center justify-center transition-transform duration-200 origin-center py-2"
                style={{ transform: `scale(${zoom})` }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            ) : null}
          </div>
        ) : (
          <pre className="p-3.5 text-xs font-mono overflow-x-auto text-emerald-600 dark:text-emerald-300 bg-slate-900">
            {code}
          </pre>
        )}
      </div>

      {/* Fullscreen Interactive Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-500" />
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Pratinjau Diagram Visual
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Modal Zoom Controls */}
                <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/70 px-2 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                  <button
                    type="button"
                    onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))}
                    className="p-1 hover:text-indigo-500 transition-colors"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setZoom(prev => Math.min(3.0, prev + 0.2))}
                    className="p-1 hover:text-indigo-500 transition-colors"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="p-1 hover:text-indigo-500 transition-colors"
                    title="Reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadPNG}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-100/50 dark:bg-slate-950/60">
              <div 
                className="transition-transform duration-200 origin-center"
                style={{ transform: `scale(${zoom})` }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
});

const QUICK_STARTERS = [
  {
    title: 'Rekomendasi Harga & Margin',
    description: 'Analisa HPP modal terbaru dan rekomendasi harga jual optimal.',
    prompt: 'Berapa rekomendasi harga jual beras dan minyak agar margin toko tetap sehat?',
    icon: Tag,
    color: 'from-blue-500 to-indigo-600',
    bgLight: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60'
  },
  {
    title: 'Paket Bundling Cerdas',
    description: 'Kombinasi produk laris dan stok lambat berdasar kebiasaan belanja.',
    prompt: 'Buatkan rekomendasi paket bundling sembako hemat untuk akhir pekan ini',
    icon: Package,
    color: 'from-amber-500 to-orange-600',
    bgLight: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60'
  },
  {
    title: 'Tren Kas & Penjualan',
    description: 'Grafik tren harian perbandingan omset kasir vs pengeluaran belanja.',
    prompt: 'Tampilkan grafik tren penjualan vs belanja toko periode bulan ini',
    icon: TrendingUp,
    color: 'from-emerald-500 to-teal-600',
    bgLight: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
  },
  {
    title: 'Prediksi Stok & Kulakan',
    description: 'Estimasi sisa hari persediaan habis dan saran order ke pemasok.',
    prompt: 'Kapan perkiraan stok beras dan telur akan habis dan perlu kulakan lagi?',
    icon: Zap,
    color: 'from-purple-500 to-pink-600',
    bgLight: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/60 dark:border-purple-800/60'
  }
];

// Helper: Extract actions from message content
const extractActions = (content: string): { cleanContent: string; actions: Array<{ label: string; path: string }> } => {
  const match = /<!--\s*ACTIONS\s*-->([\s\S]*?)<!--\s*\/ACTIONS\s*-->/i.exec(content);
  if (!match) {
    return { cleanContent: content, actions: [] };
  }
  const cleanContent = content.replace(match[0], '').trim();
  const actionsRaw = match[1].trim().split('\n');
  const actions: Array<{ label: string; path: string }> = [];
  for (const line of actionsRaw) {
    const linkMatch = /\[(.*?)\]\((.*?)\)/.exec(line);
    if (linkMatch) {
      actions.push({ label: linkMatch[1].trim(), path: linkMatch[2].trim() });
    }
  }
  return { cleanContent, actions };
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

interface ChatMessageItemProps {
  msg: Message;
  idx: number;
  isStreamingActive: boolean;
  displayContent: string;
  isPinned: boolean;
  copiedIndex: number | null;
  feedbackVote?: 'up' | 'down';
  onCopy: (text: string, idx: number) => void;
  onVote: (idx: number, vote: 'up' | 'down') => void;
  onTogglePin: (idx: number) => void;
  onInspectPrompt: (prompt: string | null) => void;
  onEditQuery: (text: string) => void;
  onNavigate: (path: string) => void;
  onSendSuggestion: (sug: string) => void;
  sending: boolean;
  streamingMsgIndex: number | null;
}

/**
 * ⚡ MEMOIZED CHAT MESSAGE BUBBLE
 * Mencegah re-render gelembung chat masa lalu saat pengguna mengetik pesan di textarea
 * atau saat pesan terakhir sedang di-stream secara bertahap.
 */
const ChatMessageItem = React.memo<ChatMessageItemProps>(({
  msg,
  idx,
  isStreamingActive,
  displayContent,
  isPinned,
  copiedIndex,
  feedbackVote,
  onCopy,
  onVote,
  onTogglePin,
  onInspectPrompt,
  onEditQuery,
  onNavigate,
  onSendSuggestion,
  sending,
  streamingMsgIndex
}) => {
  const isUser = msg.role === 'user';
  const actions = !isUser ? (msg.actions && msg.actions.length > 0 ? msg.actions : extractActions(displayContent).actions) : [];
  const suggestions = !isUser ? (msg.suggestions && msg.suggestions.length > 0 ? msg.suggestions : extractSuggestions(displayContent).suggestions) : [];
  const cleanContent = !isUser ? extractActions(extractSuggestions(displayContent).cleanContent).cleanContent : displayContent;

  return (
    <div className={`flex flex-col gap-2 max-w-4xl mx-auto ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex gap-3 w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20 mt-1">
            <Bot className="h-4 w-4" />
          </div>
        )}

        <div className={`flex flex-col space-y-1 max-w-[92%] md:max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Bubble Message */}
          <div
            className={`p-4 md:p-5 rounded-2xl text-xs md:text-sm leading-relaxed shadow-sm transition-all ${
              isUser
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-none whitespace-pre-wrap font-medium shadow-indigo-500/10'
                : isPinned
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 backdrop-blur-xl border border-amber-400/40 dark:border-amber-500/30 text-slate-800 dark:text-slate-100 rounded-tl-none ring-1 ring-amber-400/30 shadow-md'
                  : 'bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-100 rounded-tl-none shadow-sm'
            }`}
          >
            {isPinned && !isUser && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-amber-200/50 dark:border-amber-800/50">
                <BookmarkCheck className="w-3 h-3 text-amber-500" />
                <span>Insight Disematkan</span>
              </div>
            )}

            {isUser ? (
              msg.content
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)(?::([\w-]+))?/.exec(className || '');
                      const lang = match ? match[1] : '';
                      const subType = match && match[2] ? match[2] : '';
                      const codeContent = String(children).replace(/\n$/, '');

                      if (lang === 'chart' || lang === 'plotly') {
                        return <InteractiveVisualChart type={subType || 'plotly'} rawJson={codeContent} />;
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
                        <div className="my-3 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/40 shadow-xs">
                          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-xs">
                            {children}
                          </table>
                        </div>
                      );
                    },
                    th({ children }) {
                      return (
                        <th className="bg-slate-100/90 dark:bg-slate-800/90 px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700">
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
                {isStreamingActive && (
                  <span className="inline-block w-2 h-4 bg-indigo-600 dark:bg-indigo-400 ml-1 translate-y-0.5 animate-pulse rounded-xs" />
                )}
              </div>
            )}
          </div>

          {/* User Bubble Toolbar: Copy & Edit */}
          {isUser && (
            <div className="flex items-center gap-1.5 pt-1 px-1 opacity-70 hover:opacity-100 transition-opacity">
              <button
                onClick={() => onCopy(msg.content, idx)}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Salin pertanyaan"
              >
                {copiedIndex === idx ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>Salin</span>
              </button>
              <button
                onClick={() => onEditQuery(msg.content)}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Edit dan muat kembali ke input box"
              >
                <Pencil className="h-3 w-3" />
                <span>Edit</span>
              </button>
            </div>
          )}

          {/* Actions Toolbar & Grounding Source Chips */}
          {!isUser && !isStreamingActive && (
            <div className="flex flex-wrap items-center justify-between w-full pt-1.5 px-1 gap-2 animate-in fade-in duration-300">
              <div className="flex items-center gap-1.5 ml-auto">
                {/* Response Time Badge */}
                {msg.execution_time_ms !== undefined && (
                  <span 
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50"
                    title={`Total waktu pemrosesan AI: ${msg.execution_time_ms} ms`}
                  >
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span>{(msg.execution_time_ms / 1000).toFixed(1)}s</span>
                  </span>
                )}

                {/* Inspect Prompt Button */}
                {msg.prompt_used && (
                  <button
                    onClick={() => onInspectPrompt(msg.prompt_used || null)}
                    className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                    title="Inspeksi Context & System Prompt Lengkap"
                  >
                    <Code className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  onClick={() => onTogglePin(idx)}
                  className={`p-1 rounded transition-colors ${
                    isPinned 
                      ? 'text-amber-500 bg-amber-500/10 font-bold' 
                      : 'text-slate-400 hover:text-amber-500'
                  }`}
                  title={isPinned ? "Lepas sematan insight" : "Sematkan insight penting"}
                >
                  {isPinned ? <BookmarkCheck className="h-3.5 w-3.5 text-amber-500" /> : <Bookmark className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onCopy(cleanContent, idx)}
                  className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                  title="Salin respon"
                >
                  {copiedIndex === idx ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onVote(idx, 'up')}
                  className={`p-1 rounded transition-colors ${feedbackVote === 'up' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-indigo-600'}`}
                  title="Bermanfaat"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onVote(idx, 'down')}
                  className={`p-1 rounded transition-colors ${feedbackVote === 'down' ? 'text-rose-600 font-bold' : 'text-slate-400 hover:text-rose-600'}`}
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

      {/* 🎯 CLICKABLE ACTION DEEP-LINKS (Aksi Langsung ke Modul Blonjo - Muncul LANGSUNG tanpa menunggu streaming) */}
      {!isUser && actions.length > 0 && (
        <div className="pl-11 pr-2 w-full pt-1 animate-in fade-in duration-300">
          <div className="flex flex-wrap gap-2 items-center">
            {actions.map((act, aIdx) => (
              <button
                key={aIdx}
                onClick={() => onNavigate(act.path)}
                className="group flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all shadow-xs shadow-indigo-500/20 hover:scale-102"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{act.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🎯 CLICKABLE SUGGESTION CHIPS (Langkah / Pertanyaan Selanjutnya) */}
      {!isUser && !isStreamingActive && suggestions.length > 0 && (
        <div className="pl-11 pr-2 w-full pt-1 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="flex flex-wrap gap-1.5 items-center">
            {suggestions.map((sug, sIdx) => (
              <button
                key={sIdx}
                onClick={() => onSendSuggestion(sug)}
                disabled={sending || streamingMsgIndex !== null}
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
}, (prev, next) => {
  if (!prev.isStreamingActive && !next.isStreamingActive) {
    return (
      prev.msg.content === next.msg.content &&
      prev.isPinned === next.isPinned &&
      (prev.copiedIndex === prev.idx) === (next.copiedIndex === next.idx) &&
      prev.feedbackVote === next.feedbackVote &&
      prev.sending === next.sending &&
      prev.streamingMsgIndex === next.streamingMsgIndex
    );
  }
  return (
    prev.isStreamingActive === next.isStreamingActive &&
    prev.displayContent === next.displayContent &&
    prev.isPinned === next.isPinned
  );
});

export default function VibesChat() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'up' | 'down'>>({});
  const [pinnedIndices, setPinnedIndices] = useState<number[]>([]);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<number | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [inspectingPrompt, setInspectingPrompt] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  // ⚡ Streaming & Dynamic Scroll States
  const [streamingMsgIndex, setStreamingMsgIndex] = useState<number | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const streamingTimerRef = useRef<any>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Helper untuk scroll instan ke paling bawah tanpa animasi geser
  const scrollToInstantBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Deteksi interaksi scroll pengguna di container pesan
  const handleContainerScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    // Jika user scroll ke atas lebih dari 80px, user dianggap sedang membaca pesan sebelumnya
    isUserScrolledUpRef.current = distanceFromBottom > 80;
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuSessionId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Cleanup streaming timer on unmount
  useEffect(() => {
    return () => {
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
      }
    };
  }, []);

  // Load pinned insights for active session from localStorage
  useEffect(() => {
    try {
      const storageKey = `blonjo_pinned_chat_${currentSessionId || 'default'}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setPinnedIndices(JSON.parse(saved));
      } else {
        setPinnedIndices([]);
      }
    } catch {
      setPinnedIndices([]);
    }
  }, [currentSessionId]);

  const togglePin = useCallback((idx: number) => {
    setPinnedIndices((prev) => {
      const next = prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx];
      try {
        const storageKey = `blonjo_pinned_chat_${currentSessionId || 'default'}`;
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [currentSessionId]);

  // Auto-resize textarea up to 5 lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // 🎯 Scroll Management:
  // 1. Saat awal dibuka / ganti sesi: otomatis muncul chat terakhir secara instan tanpa terlihat efek geser
  useEffect(() => {
    if (!initialLoading && messages.length > 0) {
      scrollToInstantBottom();
      const r1 = requestAnimationFrame(scrollToInstantBottom);
      const t1 = setTimeout(scrollToInstantBottom, 30);
      const t2 = setTimeout(scrollToInstantBottom, 100);
      return () => {
        cancelAnimationFrame(r1);
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [initialLoading, currentSessionId]);

  // 2. Saat user kirim pesan, scroll ke bawah agar loading indikator terlihat
  useEffect(() => {
    if (sending && messagesContainerRef.current) {
      isUserScrolledUpRef.current = false;
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [sending]);

  // 3. Dynamic Stream Follow-Scroll: Mengikuti kalimat yang sedang diketik via RAF (Bebas Layout Thrashing)
  const scrollRafRef = useRef<number | null>(null);

  const scheduleFollowScroll = useCallback(() => {
    if (isUserScrolledUpRef.current || !messagesContainerRef.current) return;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (messagesContainerRef.current && !isUserScrolledUpRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (streamingMsgIndex !== null && !isUserScrolledUpRef.current) {
      scheduleFollowScroll();
    }
  }, [streamingText, streamingMsgIndex, scheduleFollowScroll]);

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

  // 2. Load Messages for a Specific Session
  const loadSession = async (sessionId: number) => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    setStreamingMsgIndex(null);
    setStreamingText('');
    setCurrentSessionId(sessionId);
    setActiveMenuSessionId(null);
    try {
      const res: any = await apiClient.get(`/insights/sessions/${sessionId}`);
      const data = res?.data || res;
      const msgs = Array.isArray(data?.messages) ? data.messages : (Array.isArray(data) ? data : []);
      if (msgs.length > 0) {
        setMessages(msgs);
      } else {
        setMessages([
          {
            role: 'assistant',
            content: 'Halo! Saya Asisten Virtual untuk toko Anda. Senang bisa mendampingi pengelolaan dan pemantauan bisnis Anda hari ini. Ada hal atau data operasional yang ingin kita tinjau bersama?'
          }
        ]);
      }
      isUserScrolledUpRef.current = false;
      requestAnimationFrame(() => scrollToInstantBottom());
    } catch (err) {
      console.error(`Gagal memuat pesan sesi ${sessionId}:`, err);
    } finally {
      setInitialLoading(false);
    }
  };

  // 3. Start New Fresh Session
  const handleNewChat = () => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    setStreamingMsgIndex(null);
    setStreamingText('');
    setCurrentSessionId(null);
    setActiveMenuSessionId(null);
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

  // 4. Delete a Session via Radix AlertDialog
  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    try {
      await apiClient.delete(`/insights/sessions/${sessionToDelete}`);
      setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
      if (currentSessionId === sessionToDelete) {
        handleNewChat();
      }
    } catch (err) {
      console.error(`Gagal menghapus sesi ${sessionToDelete}:`, err);
    } finally {
      setSessionToDelete(null);
      setActiveMenuSessionId(null);
    }
  };

  // 5. Clear All Sessions
  const handleClearAllSessions = () => {
    setShowClearAllDialog(true);
  };

  const confirmClearAllSessions = async () => {
    try {
      await apiClient.delete('/insights/sessions');
      setSessions([]);
      handleNewChat();
    } catch (err) {
      console.error("Gagal mengosongkan riwayat sesi:", err);
    } finally {
      setShowClearAllDialog(false);
    }
  };

  // Initial Load Trigger
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      try {
        const sessList = await fetchSessions();
        if (sessList && sessList.length > 0) {
          await loadSession(sessList[0].id);
        } else {
          handleNewChat();
        }
      } catch (err) {
        console.error("Init chat session error:", err);
        handleNewChat();
      } finally {
        setInitialLoading(false);
      }
    };
    init();
  }, []);

  // Send Message (Supports direct query parameter for suggestion clicks)
  const handleSend = async (queryText?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (queryText || input).trim();
    if (!query || sending || streamingMsgIndex !== null) return;

    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }

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

      const ans = res?.answer || res?.data?.answer || "Maaf, saya tidak dapat merumuskan jawaban saat ini.";
      const sources = res?.sources || res?.data?.sources;
      const sessId = res?.session_id || res?.data?.session_id;
      const execTime = res?.execution_time_ms ?? res?.data?.execution_time_ms;
      const promptUsed = res?.prompt_used || res?.data?.prompt_used;

      if (sessId && sessId !== currentSessionId) {
        setCurrentSessionId(sessId);
      }
      fetchSessions();

      // ⚡ Ekstrak ACTIONS di awal agar tombol aksi langsung tampil seketika tanpa menunggu streaming
      const { cleanContent: contentNoAct, actions: parsedActions } = extractActions(ans);
      const { cleanContent: textToStream, suggestions: parsedSuggestions } = extractSuggestions(contentNoAct);

      const assistantIndex = updatedMessages.length;
      const targetText = textToStream;

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          actions: parsedActions,
          suggestions: parsedSuggestions,
          sources: sources,
          execution_time_ms: execTime,
          prompt_used: promptUsed
        }
      ]);
      setSending(false);
      isUserScrolledUpRef.current = false;
      setStreamingMsgIndex(assistantIndex);
      setStreamingText('');

      let charIndex = 0;
      const totalLen = targetText.length;
      // Adaptive chunking yang ergonomis & ramah CPU (28ms per tick)
      const chunkSize = totalLen > 1500 ? 24 : (totalLen > 800 ? 14 : (totalLen > 300 ? 8 : 4));

      if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);

      streamingTimerRef.current = setInterval(() => {
        charIndex += chunkSize;
        if (charIndex >= totalLen) {
          clearInterval(streamingTimerRef.current);
          streamingTimerRef.current = null;
          setMessages(prev => {
            const next = [...prev];
            if (next[assistantIndex]) {
              next[assistantIndex] = {
                ...next[assistantIndex],
                content: targetText
              };
            }
            return next;
          });
          setStreamingMsgIndex(null);
          setStreamingText('');
        } else {
          setStreamingText(targetText.slice(0, charIndex));
        }
      }, 28);
    } catch (err: any) {
      console.error('Error vibes chat:', err);
      setSending(false);
      setStreamingMsgIndex(null);
      setStreamingText('');
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

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleVote = useCallback(async (idx: number, vote: 'up' | 'down') => {
    const isTogglingOff = feedbackState[idx] === vote;
    setFeedbackState(prev => ({
      ...prev,
      [idx]: isTogglingOff ? undefined : vote
    } as any));

    if (!isTogglingOff) {
      try {
        const msg = messages[idx];
        const prevMsg = idx > 0 ? messages[idx - 1] : null;
        await apiClient.post('/insights/chat/feedback', {
          session_id: currentSessionId,
          message_index: idx,
          vote: vote,
          user_query: prevMsg?.role === 'user' ? prevMsg.content : '',
          assistant_response: msg?.content || ''
        });
      } catch (err) {
        console.warn('Feedback submission warning:', err);
      }
    }
  }, [feedbackState, messages, currentSessionId]);

  const handleEditQuery = useCallback((text: string) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-xs">
      
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
            <span>{t('chat_new_session')}</span>
          </Button>
        </div>

        {/* List Sessions */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>{t('chat_history_title')}</span>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllSessions}
                className="text-rose-500 hover:text-rose-600 transition-colors font-semibold flex items-center gap-1 cursor-pointer lowercase"
                title="Kosongkan Semua Riwayat"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>kosongkan</span>
              </button>
            )}
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-3 text-slate-400 text-xs">
              {t('chat_empty_history')}
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              const isMenuOpen = activeMenuSessionId === s.id;
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
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="truncate">{s.title}</span>
                  </div>

                  {/* Menu Titik 3 Vertikal */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuSessionId(isMenuOpen ? null : s.id);
                      }}
                      className={`p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-all ${
                        isMenuOpen ? 'opacity-100 bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title={t('chat_options')}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {isMenuOpen && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 z-30 min-w-[130px] p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuSessionId(null);
                            setSessionToDelete(s.id);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('chat_delete_action')}</span>
                        </button>
                      </div>
                    )}
                  </div>
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
              <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Sajen Intelligence
                  </h2>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50">
                    Omniscient Hub
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Pusat Analitika Strategis, Finansial & Operasional Toko Terpadu
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tombol Filter Pinned Messages */}
            {pinnedIndices.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPinnedOnly(!showPinnedOnly)}
                className={`h-7 text-xs gap-1.5 rounded-lg border transition-all ${
                  showPinnedOnly 
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
                }`}
                title="Tampilkan hanya insight yang disematkan"
              >
                <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                <span>Disematkan ({pinnedIndices.length})</span>
              </Button>
            )}

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
        </div>

        {/* Area Messages List */}
        <div 
          ref={messagesContainerRef} 
          onScroll={handleContainerScroll}
          className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800"
        >
          
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
              {/* 🎯 INTERACTIVE QUICK STARTERS (Muncul saat chat baru / belum ada interaksi pengguna) */}
              {messages.length <= 1 && !showPinnedOnly && (
                <div className="max-w-4xl mx-auto my-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-2 px-1">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Pertanyaan & Topik Analisis Cepat
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {QUICK_STARTERS.map((starter, qIdx) => {
                      const IconComponent = starter.icon;
                      return (
                        <button
                          key={qIdx}
                          type="button"
                          onClick={() => handleSend(starter.prompt)}
                          disabled={sending}
                          className="group relative flex flex-col text-left p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className={`p-2 rounded-xl border ${starter.bgLight} transition-transform group-hover:scale-105`}>
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                              Tanyakan <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {starter.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {starter.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tampilan Khusus Filter Pinned Kosong */}
              {showPinnedOnly && pinnedIndices.length === 0 && (
                <div className="text-center py-12 space-y-3">
                  <Bookmark className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500">Belum ada insight yang disematkan pada sesi ini.</p>
                  <Button size="sm" variant="outline" onClick={() => setShowPinnedOnly(false)}>
                    Tampilkan Semua Pesan
                  </Button>
                </div>
              )}

              {messages.map((msg, idx) => {
                // Lewatkan jika filter pinned aktif dan pesan ini tidak di-pin
                if (showPinnedOnly && !pinnedIndices.includes(idx)) {
                  return null;
                }

                const isStreamingActive = idx === streamingMsgIndex;
                const displayContent = isStreamingActive ? streamingText : msg.content;
                const isPinned = pinnedIndices.includes(idx);

                return (
                  <ChatMessageItem
                    key={idx}
                    msg={msg}
                    idx={idx}
                    isStreamingActive={isStreamingActive}
                    displayContent={displayContent}
                    isPinned={isPinned}
                    copiedIndex={copiedIndex}
                    feedbackVote={feedbackState[idx]}
                    onCopy={handleCopy}
                    onVote={handleVote}
                    onTogglePin={togglePin}
                    onInspectPrompt={setInspectingPrompt}
                    onEditQuery={handleEditQuery}
                    onNavigate={navigate}
                    onSendSuggestion={handleSend}
                    sending={sending}
                    streamingMsgIndex={streamingMsgIndex}
                  />
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
                placeholder="Ketik pesan Anda di sini..."
                className="flex-1 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none p-2 text-xs md:text-sm placeholder:text-slate-400 text-slate-800 dark:text-slate-100 resize-none max-h-[120px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
              />
              <Button
                type="submit"
                size="icon"
                disabled={sending || streamingMsgIndex !== null || !input.trim()}
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

      {/* Radix UI Alert Dialog untuk Konfirmasi Hapus Sesi Tunggal */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
          <AlertDialogHeader className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-1">
              <Trash2 className="w-5 h-5" />
            </div>
            <AlertDialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('chat_delete_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('chat_delete_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <AlertDialogCancel 
              onClick={() => setSessionToDelete(null)}
              className="text-xs rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t('chat_cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteSession}
              className="text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-500/20"
            >
              {t('chat_confirm_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Radix UI Alert Dialog untuk Konfirmasi Kosongkan Seluruh Riwayat Chat */}
      <AlertDialog open={showClearAllDialog} onOpenChange={(open) => !open && setShowClearAllDialog(false)}>
        <AlertDialogContent className="max-w-md rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
          <AlertDialogHeader className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-1">
              <Trash2 className="w-5 h-5" />
            </div>
            <AlertDialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Kosongkan Semua Riwayat Chat?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Tindakan ini akan menghapus seluruh sesi dan histori percakapan Anda secara permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <AlertDialogCancel 
              onClick={() => setShowClearAllDialog(false)}
              className="text-xs rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClearAllSessions}
              className="text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-500/20"
            >
              Ya, Kosongkan Semua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🎯 PROMPT & GROUNDING CONTEXT INSPECTOR MODAL */}
      {inspectingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-indigo-500" />
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Inspeksi System Prompt & Grounding Context AI
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inspectingPrompt);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800"
                  title="Salin seluruh prompt ke clipboard"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPrompt ? 'Tersalin' : 'Salin Prompt'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingPrompt(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 bg-slate-950 text-slate-100">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-emerald-400">
                {inspectingPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
