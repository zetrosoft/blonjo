/**
 * SmartTextarea — Auto-bullet nota belanja
 * =========================================
 * - Enter di baris berisi "• " → auto-bullet baris baru
 * - Ketik "- " di awal baris → otomatis ganti jadi "• "
 * - Paste teks biasa → tetap bekerja normal
 */

import React, { useRef, useCallback } from 'react';
import { cn } from '../lib/utils';

interface SmartTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minRows?: number;
}

const BULLET = '• ';

export function SmartTextarea({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  minRows = 10,
}: SmartTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value: val } = ta;

    // ── Enter → auto-bullet ──────────────────
    if (e.key === 'Enter') {
      e.preventDefault();

      // Cari awal baris saat ini
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const currentLine = val.substring(lineStart, start);

      // Apakah baris saat ini diawali bullet?
      const isBullet = currentLine.startsWith(BULLET);
      const lineHasContent = currentLine.replace(BULLET, '').trim().length > 0;

      let insert = '\n';
      if (isBullet && lineHasContent) {
        insert = '\n' + BULLET;
      } else if (isBullet && !lineHasContent) {
        // Baris kosong berisi hanya bullet → hapus bullet, keluar dari mode bullet
        const newVal = val.substring(0, lineStart) + '\n' + val.substring(end);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = lineStart + 1;
        });
        return;
      }

      const newVal = val.substring(0, start) + insert + val.substring(end);
      onChange(newVal);
      const newCursor = start + insert.length;
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = newCursor;
      });
      return;
    }

    // ── Backspace di awal konten bullet → hapus bullet ──
    if (e.key === 'Backspace') {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const currentLine = val.substring(lineStart, start);
      // Jika cursor tepat setelah "• " → hapus bullet sekaligus
      if (currentLine === BULLET && start === lineStart + BULLET.length) {
        e.preventDefault();
        const newVal = val.substring(0, lineStart) + val.substring(start);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = lineStart;
        });
      }
    }
  }, [onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let val = e.target.value;
    const ta = e.target;
    const cursor = ta.selectionStart;

    // Auto-convert "- " di awal baris → "• "
    const lineStart = val.lastIndexOf('\n', cursor - 1) + 1;
    const linePrefix = val.substring(lineStart, lineStart + 2);
    if (linePrefix === '- ' || linePrefix === '* ') {
      val = val.substring(0, lineStart) + BULLET + val.substring(lineStart + 2);
      onChange(val);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = lineStart + BULLET.length;
      });
      return;
    }

    onChange(val);
  }, [onChange]);

  // Hitung tinggi dinamis
  const rowCount = Math.max(minRows, (value.split('\n').length) + 1);

  return (
    <div className="relative group">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rowCount}
        spellCheck={false}
        className={cn(
          // Base
          'w-full rounded-xl border border-input bg-background/60',
          'px-4 py-3 text-sm font-mono leading-relaxed',
          'placeholder:text-muted-foreground/50 placeholder:font-sans',
          // Focus
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary/50',
          // Scrollbar
          'resize-none overflow-y-auto',
          // Transition
          'transition-all duration-200',
          // Disabled
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      />
      {/* Hint di pojok kanan bawah */}
      <div className="absolute bottom-2 right-3 opacity-0 group-focus-within:opacity-100 transition-opacity duration-200">
        <span className="text-[10px] text-muted-foreground/50 select-none">
          Enter = bullet baru
        </span>
      </div>
    </div>
  );
}
