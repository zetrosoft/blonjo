/**
 * ParsePreview — Tampilan hasil parsing transaksi
 * =================================================
 * - Badge akurasi sebaris dengan judul
 * - Tabel item: No | Nama Barang | Jml | Satuan | Harga Satuan | Total Harga
 * - Deskripsi bersih (tanpa angka mentah)
 * - Editable sebelum simpan
 */

import React from 'react';
import { ParsedTransaction, formatRp } from '../lib/smartParser';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CheckCircle2, AlertCircle, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';

interface ParsePreviewProps {
  parsed: ParsedTransaction;
  onUpdate: (updated: Partial<ParsedTransaction>) => void;
}

// ─── Confidence badge ───────────────────────
export const CONFIDENCE_MAP = {
  high:   { label: 'Akurasi Tinggi',  icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  medium: { label: 'Akurasi Sedang',  icon: AlertCircle,  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  low:    { label: 'Akurasi Rendah',  icon: AlertCircle,  cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
};

export function ParsePreview({ parsed, onUpdate }: ParsePreviewProps) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* ── Tipe & Supplier ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <div className={cn(
            'flex items-center px-3 h-9 rounded-md border text-xs font-semibold',
            parsed.type_color
          )}>
            {parsed.type_label}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Supplier Name</Label>
          <Input
            value={parsed.contact_name || ''}
            onChange={e => onUpdate({ contact_name: e.target.value })}
            className="h-9 text-sm"
            placeholder="Nama supplier..."
          />
        </div>
      </div>

      {/* ── Tanggal & Total ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tanggal</Label>
          <Input
            type="date"
            value={parsed.transaction_date}
            onChange={e => onUpdate({ transaction_date: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Total Nominal</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">Rp</span>
            <Input
              type="text"
              value={parsed.total_amount ? formatRp(parsed.total_amount) : ''}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = parseInt(raw, 10);
                onUpdate({ total_amount: isNaN(num) ? 0 : num });
              }}
              className="h-9 text-sm pl-7 font-semibold tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* ── Deskripsi (bersih) ──────────────── */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Deskripsi</Label>
        <Input
          value={parsed.description}
          onChange={e => onUpdate({ description: e.target.value })}
          className="h-9 text-sm"
          placeholder="Deskripsi transaksi..."
        />
      </div>

      {/* ── Tabel Item ──────────────────────── */}
      {parsed.items.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Daftar Item ({parsed.items.length})
          </Label>
          <div className="rounded-xl border border-border/50 overflow-x-auto bg-muted/10">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-border/50 bg-muted/40">
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground w-8">No</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nama Barang</th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-12">Jml</th>
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground w-14">Satuan</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">Harga Satuan</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">Total Harga</th>
                </tr>
              </thead>
              <tbody>
                {parsed.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="text-center px-2 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="text-right px-2 py-2 font-mono tabular-nums">{item.qty}</td>
                    <td className="text-center px-2 py-2 text-muted-foreground">{item.unit || '—'}</td>
                    <td className="text-right px-3 py-2 font-mono tabular-nums text-muted-foreground">
                      {formatRp(item.unit_price)}
                    </td>
                    <td className="text-right px-3 py-2 font-mono tabular-nums font-semibold text-foreground">
                      {formatRp(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* ── Footer total ── */}
              <tfoot>
                <tr className="bg-muted/30 border-t border-border/50">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                    TOTAL
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-sm text-foreground">
                    {formatRp(parsed.items.reduce((s, i) => s + i.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Low confidence warning ──────────── */}
      {parsed.confidence === 'low' && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Tipe transaksi tidak terdeteksi otomatis. Gunakan kata kunci seperti
            <em> "belanja", "pendapatan", "gaji", "transfer masuk"</em>, dst.
          </span>
        </div>
      )}

      {/* ── Edit hint ─────────────────────── */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <Pencil className="w-3 h-3" />
        Semua field di atas bisa diedit sebelum disimpan
      </div>
    </div>
  );
}
