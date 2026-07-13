import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { Target, TrendingUp, TrendingDown, RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface AccuracyRow {
  target_date: string;
  projection_date: string;
  projected_inflow: number;
  projected_outflow: number;
  projected_net: number;
  actual_inflow: number | null;
  actual_outflow: number | null;
  actual_net: number | null;
  accuracy_inflow_pct: number | null;
  accuracy_outflow_pct: number | null;
  note: string | null;
}

function AccuracyBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <Badge variant="outline" className="text-[10px] text-zinc-400">Menunggu data</Badge>;
  if (pct >= 90) return <Badge className="text-[10px] bg-green-500 hover:bg-green-600">{pct.toFixed(1)}%</Badge>;
  if (pct >= 75) return <Badge className="text-[10px] bg-amber-500 hover:bg-amber-600">{pct.toFixed(1)}%</Badge>;
  return <Badge className="text-[10px] bg-red-500 hover:bg-red-600">{pct.toFixed(1)}%</Badge>;
}

function AccuracyMeter({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const color = pct >= 90 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444';
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}

export default function ProjectionAccuracyPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<AccuracyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchClient(`/material-control/cashflow-projection/accuracy?days=${days}`);
      setData(Array.isArray(res) ? res.reverse() : []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  // Statistik ringkasan
  const withActual = data.filter(d => d.actual_inflow !== null);
  const avgInflowAcc = withActual.length
    ? withActual.reduce((s, d) => s + (d.accuracy_inflow_pct ?? 0), 0) / withActual.length
    : null;
  const avgOutflowAcc = withActual.length
    ? withActual.reduce((s, d) => s + (d.accuracy_outflow_pct ?? 0), 0) / withActual.length
    : null;
  const daysEvaluated = withActual.length;

  return (
    <div className="space-y-6 p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Target className="w-7 h-7 text-indigo-500" />
            {t('mc_accuracy_title')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('mc_accuracy_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 60].map(d => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              className="text-xs h-8"
              onClick={() => setDays(d)}
            >
              {d} {t('mc_accuracy_days')}
            </Button>
          ))}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('mc_accuracy_avg_inflow')}</p>
                <div className="text-3xl font-extrabold mt-1 text-green-600 dark:text-green-400">
                  {avgInflowAcc !== null ? `${avgInflowAcc.toFixed(1)}%` : '—'}
                </div>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400 opacity-30" />
            </div>
            <AccuracyMeter pct={avgInflowAcc} />
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('mc_accuracy_avg_outflow')}</p>
                <div className="text-3xl font-extrabold mt-1 text-red-500 dark:text-red-400">
                  {avgOutflowAcc !== null ? `${avgOutflowAcc.toFixed(1)}%` : '—'}
                </div>
              </div>
              <TrendingDown className="w-8 h-8 text-red-400 opacity-30" />
            </div>
            <AccuracyMeter pct={avgOutflowAcc} />
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('mc_accuracy_days_evaluated')}</p>
                <div className="text-3xl font-extrabold mt-1 text-indigo-600 dark:text-indigo-400">
                  {daysEvaluated}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('mc_accuracy_from_days', { total: days })}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-indigo-400 opacity-30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-xs text-blue-700 dark:text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>{t('mc_accuracy_info')}</p>
      </div>

      {/* Detail Table */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">{t('mc_accuracy_table_title')}</CardTitle>
          <CardDescription className="text-xs">{t('mc_accuracy_table_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 border-t">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-10 text-center gap-2">
              <AlertCircle className="w-7 h-7 text-red-400" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center gap-2">
              <Target className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm text-zinc-500">{t('mc_accuracy_empty')}</p>
              <p className="text-xs text-zinc-400">{t('mc_accuracy_empty_hint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50/60 dark:bg-zinc-900/40 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">{t('mc_accuracy_col_date')}</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">{t('mc_accuracy_col_proj_inflow')}</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">{t('mc_accuracy_col_actual_inflow')}</th>
                    <th className="text-center px-3 py-3 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{t('mc_accuracy_col_acc_inflow')}</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">{t('mc_accuracy_col_proj_outflow')}</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">{t('mc_accuracy_col_actual_outflow')}</th>
                    <th className="text-center px-3 py-3 font-semibold text-red-500 dark:text-red-400 whitespace-nowrap">{t('mc_accuracy_col_acc_outflow')}</th>
                    <th className="px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">{t('mc_accuracy_col_note')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.map((row, idx) => {
                    const hasActual = row.actual_inflow !== null;
                    return (
                      <tr key={idx} className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors ${!hasActual ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                          {row.target_date}
                          {!hasActual && (
                            <Badge variant="outline" className="ml-1.5 text-[9px] px-1">Belum ada aktual</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-green-600 dark:text-green-400">
                          {formatRp(row.projected_inflow)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {row.actual_inflow !== null ? formatRp(row.actual_inflow) : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <AccuracyBadge pct={row.accuracy_inflow_pct} />
                            <AccuracyMeter pct={row.accuracy_inflow_pct} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-red-500 dark:text-red-400">
                          {formatRp(row.projected_outflow)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {row.actual_outflow !== null ? formatRp(row.actual_outflow) : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <AccuracyBadge pct={row.accuracy_outflow_pct} />
                            <AccuracyMeter pct={row.accuracy_outflow_pct} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-zinc-500 max-w-[180px] truncate" title={row.note || ''}>
                          {row.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> ≥90% {t('mc_accuracy_legend_good')}</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 75–89% {t('mc_accuracy_legend_warn')}</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &lt;75% {t('mc_accuracy_legend_bad')}</div>
      </div>
    </div>
  );
}
