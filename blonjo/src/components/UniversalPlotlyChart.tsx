import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, RefreshCw, Code2, AlertCircle } from 'lucide-react';

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
      const script = document.createElement('script');
      script.src = 'https://cdn.plot.ly/plotly-2.35.2.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Plotly) {
          resolve(window.Plotly);
        } else {
          reject(new Error('Plotly failed to initialize on window'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Plotly script from CDN'));
      document.head.appendChild(script);
    });
  }
  return plotlyScriptPromise;
}

interface UniversalPlotlyChartProps {
  rawContent: string;
  chartType?: string; // 'plotly' | 'bar' | 'bar-horizontal' | 'donut' | 'pie' | 'line' | 'waterfall' | 'treemap' | etc.
}

export const UniversalPlotlyChart: React.FC<UniversalPlotlyChartProps> = ({
  rawContent,
  chartType = 'plotly'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;

    loadPlotlyLibrary()
      .then((Plotly) => {
        if (!isMounted || !containerRef.current) return;

        // Parse and normalize data
        const cleanRaw = (rawContent || '').trim();
        let parsedData: any[] = [];
        let parsedLayout: Record<string, any> = {};

        // 1. Try parsing full Plotly JSON { data: [...], layout: {...} }
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
                  hole: chartType === 'donut' ? 0.45 : 0,
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
                  marker: { color: '#6366f1' }
                }];
              } else if (chartType === 'line') {
                parsedData = [{
                  type: 'scatter',
                  mode: 'lines+markers',
                  x: labels,
                  y: values,
                  line: { color: '#10b981', width: 3 }
                }];
              } else {
                parsedData = [{
                  type: 'bar',
                  x: labels,
                  y: values,
                  marker: { color: '#3b82f6' }
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
                  hole: chartType === 'donut' ? 0.45 : 0,
                  labels,
                  values
                }];
              } else if (chartType === 'bar-horizontal' || chartType === 'horizontal' || labels.some(l => l.length > 15)) {
                parsedData = [{
                  type: 'bar',
                  orientation: 'h',
                  x: values,
                  y: labels,
                  marker: { color: '#6366f1' }
                }];
              } else {
                parsedData = [{
                  type: 'bar',
                  x: labels,
                  y: values,
                  marker: { color: '#3b82f6' }
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
              marker: { color: '#6366f1' }
            }];
            parsedLayout = { title };
          }
        }

        if (parsedData.length === 0) {
          setError('Format data visualisasi tidak dapat diterjemahkan ke Plotly chart.');
          setLoading(false);
          return;
        }

        // Check dark mode
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        // Merge Layout styling
        const finalLayout: Record<string, any> = {
          autosize: true,
          margin: { t: 40, r: 25, l: 45, b: 40 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: {
            family: 'Plus Jakarta Sans, system-ui, sans-serif',
            size: 11,
            color: textColor
          },
          xaxis: {
            gridcolor: gridColor,
            zerolinecolor: gridColor,
            automargin: true,
            ...(parsedLayout.xaxis || {})
          },
          yaxis: {
            gridcolor: gridColor,
            zerolinecolor: gridColor,
            automargin: true,
            ...(parsedLayout.yaxis || {})
          },
          ...parsedLayout
        };

        // If orientation is horizontal, ensure left margin handles long vendor/category names
        if (parsedData.some(d => d.orientation === 'h')) {
          finalLayout.margin = { ...finalLayout.margin, l: 140 };
        }

        const config = {
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          toImageButtonOptions: {
            format: 'png',
            filename: 'blonjo-analytics-chart',
            height: 500,
            width: 700,
            scale: 2
          }
        };

        Plotly.newPlot(containerRef.current, parsedData, finalLayout, config);
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
        setError(err.message || 'Gagal memuat visualisasi Plotly');
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

  if (error) {
    return (
      <div className="my-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">{error}</p>
          <pre className="p-2 rounded bg-black/10 text-[10px] overflow-x-auto">{rawContent}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800/60 text-xs">
        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold">
          <BarChart3 className="w-4 h-4" />
          <span>Visualisasi Interaktif (Plotly Engine)</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="Lihat Data Mentah"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Raw JSON toggle */}
      {showRaw && (
        <pre className="p-3 text-[11px] font-mono bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 overflow-x-auto text-slate-700 dark:text-slate-300">
          {rawContent}
        </pre>
      )}

      {/* Plotly Canvas Container */}
      <div className="relative p-2 min-h-[320px] flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-xs z-10 gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Merender grafik Plotly interaktif...</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-[320px]" />
      </div>
    </div>
  );
};
