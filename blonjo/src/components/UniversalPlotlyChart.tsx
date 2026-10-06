import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  BarChart3, 
  BarChart2, 
  TrendingUp, 
  PieChart, 
  Layers, 
  Download, 
  RefreshCw, 
  Sparkles 
} from 'lucide-react';

declare global {
  interface Window {
    Plotly?: any;
  }
}

// Global script loader promise to prevent duplicate injection
let plotlyScriptPromise: Promise<any> | null = null;

function loadPlotlyLibrary(): Promise<any> {
  if (typeof window !== 'undefined' && window.Plotly) {
    return Promise.resolve(window.Plotly);
  }
  if (!plotlyScriptPromise) {
    plotlyScriptPromise = new Promise((resolve, reject) => {
      // 1. Coba load dari file lokal /plotly.min.js (Self-Hosted, 0ms latency)
      const script = document.createElement('script');
      script.src = '/plotly.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Plotly) {
          resolve(window.Plotly);
        } else {
          fallbackCDN();
        }
      };
      script.onerror = () => fallbackCDN();

      // 2. Fallback ke CDN resmi jika file lokal tidak ditemukan
      function fallbackCDN() {
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://cdn.plot.ly/plotly-basic-2.35.2.min.js';
        cdnScript.async = true;
        cdnScript.onload = () => {
          if (window.Plotly) {
            resolve(window.Plotly);
          } else {
            reject(new Error('Plotly failed to initialize on window'));
          }
        };
        cdnScript.onerror = () => reject(new Error('Failed to load Plotly library'));
        document.head.appendChild(cdnScript);
      }

      document.head.appendChild(script);
    });
  }
  return plotlyScriptPromise;
}

// Curated Editorial Palettes ala Data Visualisation Catalogue (Tailwind-Inspired)
const PALETTES = {
  indigo: '#6366f1',
  indigoFill: 'rgba(99, 102, 241, 0.08)',
  emerald: '#10b981',
  emeraldFill: 'rgba(16, 185, 129, 0.08)',
  amber: '#f59e0b',
  amberFill: 'rgba(245, 158, 11, 0.08)',
  rose: '#f43f5e',
  roseFill: 'rgba(244, 63, 94, 0.08)',
  sky: '#0ea5e9',
  skyFill: 'rgba(14, 165, 233, 0.08)',
  violet: '#8b5cf6',
  violetFill: 'rgba(139, 92, 246, 0.08)',
  donutColors: ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']
};

const formatRupiahCompact = (num: number): string => {
  if (Math.abs(num) >= 1_000_000_000) {
    return `Rp ${(num / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `Rp ${(num / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  }
  if (Math.abs(num) >= 1_000) {
    return `Rp ${(num / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} Rb`;
  }
  return `Rp ${num.toLocaleString('id-ID')}`;
};

interface UniversalPlotlyChartProps {
  rawContent: string;
  chartType?: string; // 'plotly' | 'bar' | 'bar-horizontal' | 'donut' | 'pie' | 'line' | 'waterfall'
}

export const UniversalPlotlyChart: React.FC<UniversalPlotlyChartProps> = ({
  rawContent,
  chartType = 'plotly'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metadata hasil ekstraksi untuk DataViz Catalogue Header
  const [chartMeta, setChartMeta] = useState<{
    title: string;
    badgeText: string;
    badgeType: 'trend' | 'comparison' | 'composition' | 'waterfall' | 'analytics';
    keyMetrics: Array<{ label: string; value: string; color?: string }>;
  }>({
    title: 'Visualisasi Data Analitik',
    badgeText: '📊 ANALISIS DATA',
    badgeType: 'analytics',
    keyMetrics: []
  });

  useEffect(() => {
    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;

    loadPlotlyLibrary()
      .then((Plotly) => {
        if (!isMounted || !containerRef.current) return;

        const cleanRaw = (rawContent || '').trim();
        let parsedData: any[] = [];
        let parsedLayout: Record<string, any> = {};

        // 1. Parsing JSON data
        if (cleanRaw.startsWith('{') || cleanRaw.includes('{')) {
          try {
            let jsonStr = cleanRaw;
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
              jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
            const parsed = JSON.parse(jsonStr);

            if (parsed.data && Array.isArray(parsed.data)) {
              parsedData = parsed.data;
              parsedLayout = parsed.layout || {};
            } else if (parsed.labels && parsed.datasets) {
              // Format Chart.js: { labels: [...], datasets: [{ data: [...] }] }
              const labels = parsed.labels;
              const values = parsed.datasets[0]?.data || [];
              const title = parsed.title || parsed.datasets[0]?.label || 'Data Analitik';

              if (chartType === 'donut' || chartType === 'pie') {
                parsedData = [{
                  type: 'pie',
                  hole: chartType === 'donut' ? 0.55 : 0,
                  labels: labels,
                  values: values,
                  textinfo: 'label+percent',
                  hoverinfo: 'label+value+percent'
                }];
              } else if (chartType === 'bar-horizontal' || chartType === 'horizontal') {
                parsedData = [{
                  type: 'bar',
                  orientation: 'h',
                  x: values,
                  y: labels,
                  marker: { color: PALETTES.indigo }
                }];
              } else if (chartType === 'line') {
                parsedData = [{
                  type: 'scatter',
                  mode: 'lines+markers',
                  x: labels,
                  y: values,
                  line: { color: PALETTES.emerald, width: 3.5, shape: 'spline' }
                }];
              } else {
                parsedData = [{
                  type: 'bar',
                  x: labels,
                  y: values,
                  marker: { color: PALETTES.indigo }
                }];
              }
              parsedLayout = { title };
            } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
              // Key-Value map: { "Supplier A": 1000000, "Supplier B": 500000 }
              const labels = Object.keys(parsed);
              const values = labels.map(k => Number(parsed[k]) || 0);
              
              if (chartType === 'donut' || chartType === 'pie') {
                parsedData = [{
                  type: 'pie',
                  hole: 0.55,
                  labels,
                  values
                }];
              } else if (chartType === 'bar-horizontal' || chartType === 'horizontal' || labels.some(l => l.length > 15)) {
                parsedData = [{
                  type: 'bar',
                  orientation: 'h',
                  x: values,
                  y: labels,
                  marker: { color: PALETTES.indigo }
                }];
              } else {
                parsedData = [{
                  type: 'bar',
                  x: labels,
                  y: values,
                  marker: { color: PALETTES.indigo }
                }];
              }
            }
          } catch (err: any) {
            console.warn('[PlotlyChart] JSON parse fallback:', err.message);
          }
        }

        // 2. Fallback line parser if no valid data
        if (!parsedData || parsedData.length === 0) {
          const lines = cleanRaw.split('\n');
          const labels: string[] = [];
          const values: number[] = [];
          let title = '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (/^title\s*:\s*(.*)/i.test(trimmed)) {
              title = trimmed.replace(/^title\s*:\s*/i, '').replace(/["']/g, '').trim();
              continue;
            }
            const kvMatch = /^["']?([^"':]+)["']?\s*:\s*([\d.,]+)/.exec(trimmed);
            if (kvMatch && !['data', 'layout', 'x-axis', 'y-axis'].includes(kvMatch[1].toLowerCase())) {
              labels.push(kvMatch[1].trim());
              const cleanNum = kvMatch[2].replace(/\./g, '').replace(/,/g, '.');
              values.push(parseFloat(cleanNum) || 0);
            }
          }

          if (labels.length > 0) {
            parsedData = [{
              type: 'bar',
              orientation: labels.some(l => l.length > 15) ? 'h' : 'v',
              x: labels.some(l => l.length > 15) ? values : labels,
              y: labels.some(l => l.length > 15) ? labels : values,
              marker: { color: PALETTES.indigo }
            }];
            parsedLayout = { title };
          }
        }

        if (parsedData.length === 0) {
          setError('Visualisasi sedang disiapkan');
          setLoading(false);
          return;
        }

        // 🎨 3. Data Visualisation Catalogue Taxonomy & Metadata Extraction
        const rawTitle = parsedLayout.title?.text || (typeof parsedLayout.title === 'string' ? parsedLayout.title : '') || 'Analisis Data & Tren Operasional';
        let detectedBadge = '📊 KOMPARASI DATA';
        let detectedType: 'trend' | 'comparison' | 'composition' | 'waterfall' | 'analytics' = 'comparison';
        const metrics: Array<{ label: string; value: string; color?: string }> = [];

        // Deteksi Tipe Taksonomi
        const isScatterLine = parsedData.some(d => d.type === 'scatter' || (d.mode && d.mode.includes('lines')));
        const isPieDonut = parsedData.some(d => d.type === 'pie' || d.hole !== undefined);
        const isHorizontalBar = parsedData.some(d => d.type === 'bar' && d.orientation === 'h');

        if (isScatterLine) {
          detectedBadge = '📈 TREN WAKTU (LINE / SPLINE)';
          detectedType = 'trend';
        } else if (isPieDonut) {
          detectedBadge = '🍩 KOMPOSISI & PROPORSI (DONUT)';
          detectedType = 'composition';
        } else if (isHorizontalBar) {
          detectedBadge = '📊 KOMPARASI ENTITAS (BAR)';
          detectedType = 'comparison';
        } else {
          detectedBadge = '📊 KOMPARASI KATEGORI (BAR)';
          detectedType = 'comparison';
        }

        // Hitung Key Metrics Takeaway
        parsedData.forEach((trace, idx) => {
          const traceName = trace.name || (parsedData.length === 1 ? 'Total' : `Data ${idx + 1}`);
          const vals: number[] = Array.isArray(trace.y) && typeof trace.y[0] === 'number' 
            ? trace.y 
            : (Array.isArray(trace.x) && typeof trace.x[0] === 'number' ? trace.x : (Array.isArray(trace.values) ? trace.values : []));
          
          if (vals.length > 0) {
            const sum = vals.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
            if (sum > 0) {
              const color = trace.line?.color || trace.marker?.color || (idx === 0 ? PALETTES.indigo : PALETTES.emerald);
              metrics.push({
                label: traceName,
                value: sum >= 1000 ? formatRupiahCompact(sum) : sum.toLocaleString('id-ID'),
                color: typeof color === 'string' ? color : PALETTES.indigo
              });
            }
          }
        });

        setChartMeta({
          title: rawTitle,
          badgeText: detectedBadge,
          badgeType: detectedType,
          keyMetrics: metrics.slice(0, 3)
        });

        // 🎨 4. Data Visualisation Catalogue Styling Polisher
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const subtleGridColor = isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(226, 232, 240, 0.8)';

        // Poles setiap trace data agar sesuai standar DataViz Catalogue
        const polishedData = parsedData.map((trace, idx) => {
          const isLine = trace.type === 'scatter' || (trace.mode && trace.mode.includes('lines'));
          const isBar = trace.type === 'bar';
          const isPie = trace.type === 'pie';

          if (isLine) {
            const isPurchase = (trace.name || '').toLowerCase().includes('belanja') || (trace.name || '').toLowerCase().includes('modal') || (trace.name || '').toLowerCase().includes('purchase');
            const isSales = (trace.name || '').toLowerCase().includes('jual') || (trace.name || '').toLowerCase().includes('omzet') || (trace.name || '').toLowerCase().includes('sales');
            
            const lineColor = isPurchase ? PALETTES.indigo : (isSales ? PALETTES.emerald : (idx === 0 ? PALETTES.indigo : (idx === 1 ? PALETTES.emerald : PALETTES.sky)));
            const areaFillColor = isPurchase ? PALETTES.indigoFill : (isSales ? PALETTES.emeraldFill : (idx === 0 ? PALETTES.indigoFill : PALETTES.emeraldFill));

            return {
              ...trace,
              mode: 'lines+markers',
              line: {
                width: 3.5,
                shape: 'spline', // 🌊 Spline smoothing ala DataViz Catalogue
                smoothing: 1.3,
                color: lineColor,
                ...(trace.line || {})
              },
              fill: 'tozeroy', // 🌊 Soft gradient area fill di bawah garis
              fillcolor: areaFillColor,
              marker: {
                size: 7,
                color: lineColor,
                line: { width: 2, color: isDark ? '#0f172a' : '#ffffff' },
                ...(trace.marker || {})
              },
              hovertemplate: '<b>%{x}</b><br><span style="color:' + lineColor + '">●</span> %{data.name}: <b>Rp %{y:,.0f}</b><extra></extra>'
            };
          }

          if (isBar) {
            const isHorizontal = trace.orientation === 'h';
            const barColor = trace.marker?.color || (idx === 0 ? PALETTES.indigo : PALETTES.emerald);

            return {
              ...trace,
              marker: {
                color: barColor,
                cornerradius: 6, // 🔲 Sudut membulat pada ujung bar
                ...(trace.marker || {})
              },
              hovertemplate: isHorizontal 
                ? '<b>%{y}</b><br>Nominal: <b>Rp %{x:,.0f}</b><extra></extra>'
                : '<b>%{x}</b><br>Nominal: <b>Rp %{y:,.0f}</b><extra></extra>'
            };
          }

          if (isPie) {
            return {
              ...trace,
              hole: 0.55, // 🍩 Donut hole bersih
              marker: {
                colors: PALETTES.donutColors,
                line: { color: isDark ? '#0f172a' : '#ffffff', width: 2.5 }
              },
              textinfo: 'label+percent',
              textposition: 'inside',
              hovertemplate: '<b>%{label}</b><br>Nominal: <b>Rp %{value:,.0f}</b> (%{percent})<extra></extra>'
            };
          }

          return trace;
        });

        // Poles Layout: Hapus judul bawaan Plotly (karena sudah tampil di Card Header HTML)
        const finalLayout: Record<string, any> = {
          autosize: true,
          margin: { t: 15, r: 20, l: isHorizontalBar ? 130 : 45, b: 40 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: {
            family: 'Plus Jakarta Sans, Inter, system-ui, sans-serif',
            size: 11,
            color: textColor
          },
          showlegend: parsedData.length > 1,
          legend: {
            orientation: 'h',
            y: -0.22,
            x: 0.5,
            xanchor: 'center',
            font: { family: 'Plus Jakarta Sans, sans-serif', size: 10, color: textColor }
          },
          xaxis: {
            showgrid: false, // ⚡ Hapus grid vertikal untuk Data-Ink Ratio yang bersih
            zeroline: false,
            showline: true,
            linecolor: isDark ? '#334155' : '#e2e8f0',
            tickfont: { family: 'Plus Jakarta Sans, sans-serif', size: 10, color: textColor },
            automargin: true,
            ...(parsedLayout.xaxis || {})
          },
          yaxis: {
            showgrid: true,
            gridcolor: subtleGridColor, // ⚡ Grid horizontal titik-titik lembut
            griddash: 'dot',
            zeroline: false,
            showline: false,
            tickfont: { family: 'Plus Jakarta Sans, sans-serif', size: 10, color: textColor },
            automargin: true,
            ...(parsedLayout.yaxis || {})
          },
          hovermode: isScatterLine ? 'x unified' : 'closest'
        };

        const config = {
          responsive: true,
          displayModeBar: false, // Hilangkan mode bar default yang mengotori visual
          displaylogo: false
        };

        Plotly.newPlot(containerRef.current, polishedData, finalLayout, config);
        setLoading(false);

        // Auto-resize on container changes
        resizeObserver = new ResizeObserver(() => {
          if (containerRef.current && window.Plotly) {
            window.Plotly.Plots.resize(containerRef.current);
          }
        });
        resizeObserver.observe(containerRef.current);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[Plotly] Init error:', err);
        setError('Visualisasi data sedang disiapkan...');
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (containerRef.current && window.Plotly) {
        window.Plotly.purge(containerRef.current);
      }
    };
  }, [rawContent, chartType]);

  // Handler Download PNG Mandiri
  const handleExportPNG = () => {
    if (containerRef.current && window.Plotly) {
      window.Plotly.downloadImage(containerRef.current, {
        format: 'png',
        filename: `blonjo-chart-${Date.now()}`,
        height: 600,
        width: 900,
        scale: 2
      });
    }
  };

  if (error) {
    return null; // Silent failover tanpa mencemari chat dengan teks raw error
  }

  // Pilih ikon badge sesuai taksonomi DataViz
  const renderBadgeIcon = () => {
    switch (chartMeta.badgeType) {
      case 'trend':
        return <TrendingUp className="w-3 h-3" />;
      case 'composition':
        return <PieChart className="w-3 h-3" />;
      case 'waterfall':
        return <Layers className="w-3 h-3" />;
      default:
        return <BarChart3 className="w-3 h-3" />;
    }
  };

  return (
    <div className="my-5 rounded-2xl bg-white/95 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800/90 shadow-md shadow-slate-200/30 dark:shadow-slate-950/40 overflow-hidden transition-all backdrop-blur-md">
      {/* 🌟 Header Editorial Bergaya Data Visualisation Catalogue */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50/90 to-white/90 dark:from-slate-900/90 dark:to-slate-950/90 border-b border-slate-200/70 dark:border-slate-800/70 flex flex-wrap items-center justify-between gap-3">
        {/* Kiri: Taksonomi Badge & Judul Utama */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50 shadow-2xs">
              {renderBadgeIcon()}
              <span>{chartMeta.badgeText}</span>
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {chartMeta.title}
          </h4>
        </div>

        {/* Kanan: Key Metrics Pills & Tombol Export PNG */}
        <div className="flex items-center gap-2 flex-wrap">
          {chartMeta.keyMetrics.map((km, i) => (
            <div 
              key={i} 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 text-xs"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: km.color || '#6366f1' }} />
              <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">{km.label}:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs font-mono">{km.value}</span>
            </div>
          ))}

          {/* Tombol Simpan Grafik PNG */}
          <button
            type="button"
            onClick={handleExportPNG}
            className="p-1.5 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            title="Unduh visualisasi PNG resolusi tinggi"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 📊 Plotly Visual Canvas */}
      <div className="relative p-2.5 min-h-[330px] flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xs z-10 gap-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Merender visualisasi data...</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-[330px]" />
      </div>
    </div>
  );
};
