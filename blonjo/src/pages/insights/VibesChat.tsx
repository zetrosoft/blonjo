import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import { Send, Bot, User, Loader2, Landmark, Package, AlertCircle, Newspaper, Globe, Sparkles, TrendingUp, BarChart2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

interface NewsClip {
  title: string;
  summary: string;
  source: string;
  url: string;
}

interface ForecastItem {
  name: string;
  volume: number;
  current_stock: number;
}

interface TopSellingItem {
  name: string;
  qty_month: number;
  qty_year: number;
}

interface CashBalance {
  current_balance: number;
  yesterday_inflow: number;
  yesterday_outflow: number;
  month_inflow: number;
  month_outflow: number;
}

interface WidgetData {
  cash_balance: CashBalance;
  top_selling: TopSellingItem[];
  forecast_depletion: {
    maintenance_stock: boolean;
    items: ForecastItem[];
  };
  macro_news: NewsClip[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

export default function VibesChat() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [widgets, setWidgets] = useState<WidgetData | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize messages once translation is available
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: t('vibes_chat_welcome'),
        sources: ['Sistem Informasi Internal']
      }
    ]);
  }, [t]);

  useEffect(() => {
    fetchWidgets();
  }, []);

  // Auto-scroll ke bawah saat chat diperbarui atau halaman dibuka
  useEffect(() => {
    if (messages.length > 1) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const fetchWidgets = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<any, WidgetData>('/insights/widgets');
      setWidgets(data);
    } catch (err) {
      console.error('Gagal mengambil data insight widgets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);

    try {
      const response = await apiClient.post<any, { answer: string; sources?: string[] }>('/insights/chat', {
        message: userMsg,
        history: messages.map(m => ({ role: m.role, content: m.content }))
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.answer,
        sources: response.sources
      }]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('unexpected_error'),
        sources: []
      }]);
    } finally {
      setSending(false);
    }
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(val);
  };

  // Hitung persentase untuk visualisasi mini chart
  const maxCashInout = widgets ? Math.max(widgets.cash_balance.month_inflow, widgets.cash_balance.month_outflow, 1) : 1;
  const inflowPercent = widgets ? (widgets.cash_balance.month_inflow / maxCashInout) * 100 : 0;
  const outflowPercent = widgets ? (widgets.cash_balance.month_outflow / maxCashInout) * 100 : 0;

  const maxSellingQty = widgets && widgets.top_selling.length > 0 
    ? Math.max(...widgets.top_selling.map(item => item.qty_month), 1) 
    : 1;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 h-[calc(100vh-80px)] w-full overflow-hidden">
      {/* AREA KIRI: NotebookLM Chat Interface & Visualisasi Landing */}
      <div className="flex flex-col flex-1 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/20 dark:border-slate-800/50 rounded-2xl p-6 shadow-xl overflow-hidden h-full">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
          <Sparkles className="h-6 w-6 text-indigo-500 animate-pulse" />
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              {t('vibes_chat_title')}
            </h1>
            <p className="text-xs text-muted-foreground">{t('vibes_chat_subtitle')}</p>
          </div>
        </div>

        {/* Chat Messages / Landing Dashboard */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 scrollbar-thin">
          {messages.length === 1 && widgets && (
            <div className="mb-6 space-y-6">
              {/* Pesan Sambutan */}
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 shadow-md text-indigo-500">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="p-4 rounded-2xl shadow-sm border bg-white/70 dark:bg-slate-900/70 border-white/20 dark:border-slate-800/80 rounded-tl-none text-slate-800 dark:text-slate-100">
                    <p className="text-sm whitespace-pre-line leading-relaxed">{messages[0].content}</p>
                  </div>
                </div>
              </div>

              {/* VISUALISASI MINI CHART (Landing State) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Chart 1: Month Cash Flow */}
                <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-white/15 dark:border-slate-800/60 shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      {t('vibes_chat_landing_chart_title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-32 flex flex-col justify-end gap-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-medium">
                        <span>{t('vibes_chat_revenue')}</span>
                        <span className="text-emerald-600 font-bold">{formatRupiah(widgets.cash_balance.month_inflow)}</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${inflowPercent}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-medium">
                        <span>{t('vibes_chat_expense')}</span>
                        <span className="text-rose-600 font-bold">{formatRupiah(widgets.cash_balance.month_outflow)}</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden">
                        <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${outflowPercent}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Chart 2: Top Selling Products */}
                <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-white/15 dark:border-slate-800/60 shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <BarChart2 className="h-4 w-4 text-indigo-500" />
                      {t('vibes_chat_top_selling')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-32 flex flex-col justify-between text-[11px]">
                    {widgets.top_selling.slice(0, 3).map((item, idx) => {
                      const itemPercent = (item.qty_month / maxSellingQty) * 100;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="truncate max-w-[150px] font-medium">{item.name}</span>
                            <span className="font-bold">{item.qty_month} unit</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${itemPercent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {widgets.top_selling.length === 0 && (
                      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                        Belum ada data penjualan bulan ini
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Menampilkan sisa chat jika ada history lebih dari 1 */}
          {messages.length > 1 && messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-md ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-indigo-500'
              }`}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className="flex flex-col gap-1">
                <div className={`p-4 rounded-2xl shadow-sm border ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white border-indigo-700 rounded-tr-none'
                    : 'bg-white/70 dark:bg-slate-900/70 border-white/20 dark:border-slate-800/80 rounded-tl-none text-slate-800 dark:text-slate-100'
                }`}>
                  <p className="text-sm whitespace-pre-line leading-relaxed">{msg.content}</p>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 justify-start">
                    {msg.sources.map((src, idx) => (
                      <span key={idx} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-muted-foreground border border-white/5">
                        🔍 {src}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex gap-3 mr-auto items-center">
              <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-indigo-500 animate-spin">
                <Loader2 className="h-4 w-4" />
              </div>
              <span className="text-xs text-muted-foreground">{t('vibes_chat_typing')}</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Chat */}
        <form onSubmit={handleSend} className="flex gap-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-xl border border-white/20 dark:border-slate-800/80 backdrop-blur-md">
          <input
            type="text"
            placeholder={t('vibes_chat_placeholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={sending}
            className="flex-1 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none px-3 text-sm placeholder:text-muted-foreground text-slate-800 dark:text-slate-100"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* AREA KANAN: Sources Sidebar Panel (Glassmorphism Premium) */}
      <div className="w-full lg:w-[350px] shrink-0 overflow-y-auto space-y-6 pr-2 h-full pb-6 scrollbar-thin">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 bg-white/20 dark:bg-slate-900/20 backdrop-blur-xl border border-white/10 rounded-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-xs text-muted-foreground">{t('vibes_chat_loading_widgets')}</p>
          </div>
        ) : (
          <>
            {/* 1. Cash Balance Widget */}
            {widgets?.cash_balance && (
              <Card className="bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl border-white/20 dark:border-slate-800/50 shadow-lg rounded-2xl overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Landmark className="h-5 w-5 text-indigo-500" />
                  <CardTitle className="text-sm font-semibold">{t('vibes_chat_cash_bank')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-xs text-muted-foreground">{t('vibes_chat_current_balance')}</span>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {formatRupiah(widgets.cash_balance.current_balance)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block">{t('vibes_chat_month_inflow')}</span>
                      <span className="font-semibold text-emerald-600">
                        {formatRupiah(widgets.cash_balance.month_inflow)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('vibes_chat_month_outflow')}</span>
                      <span className="font-semibold text-rose-600">
                        {formatRupiah(widgets.cash_balance.month_outflow)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. Top Selling Products (Telah diganti dari Purchasing) */}
            {widgets?.top_selling && widgets.top_selling.length > 0 && (
              <Card className="bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl border-white/20 dark:border-slate-800/50 shadow-lg rounded-2xl">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Package className="h-5 w-5 text-violet-500" />
                  <CardTitle className="text-sm font-semibold">{t('vibes_chat_top_selling')}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2">
                  {widgets.top_selling.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                      <span className="text-muted-foreground">
                        {item.qty_month} <span className="text-[10px]">bln</span> / {item.qty_year} <span className="text-[10px]">thn</span>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 3. Forecast & Depletion Risk */}
            {widgets?.forecast_depletion && (
              <Card className="bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl border-white/20 dark:border-slate-800/50 shadow-lg rounded-2xl">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-sm font-semibold">
                    {widgets.forecast_depletion.maintenance_stock ? t('vibes_chat_depletion_forecast') : t('vibes_chat_top_purchased')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2">
                  {widgets.forecast_depletion.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                      <div className="text-right">
                        <span className="text-muted-foreground block">Vol: {item.volume}</span>
                        {widgets.forecast_depletion.maintenance_stock && (
                          <span className={`text-[10px] font-bold ${item.current_stock < 10 ? 'text-rose-500 animate-pulse' : 'text-emerald-600'}`}>
                            Stok: {item.current_stock}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 4. Macro News Clips */}
            {widgets?.macro_news && widgets.macro_news.length > 0 && (
              <Card className="bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl border-white/20 dark:border-slate-800/50 shadow-lg rounded-2xl">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Newspaper className="h-5 w-5 text-rose-500" />
                  <CardTitle className="text-sm font-semibold">{t('vibes_chat_macro_news')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {widgets.macro_news.map((item, idx) => (
                    <div key={idx} className="text-xs border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 leading-snug">
                        <Globe className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        {item.title}
                      </h4>
                      <p className="text-muted-foreground mt-1 leading-relaxed text-[11px]">{item.summary}</p>
                      <div className="flex justify-between items-center mt-2 text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">
                        <span>{item.source}</span>
                        <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {t('vibes_chat_read_more')}
                        </a>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
