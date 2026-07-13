/**
 * SmartTextarea — Auto-bullet nota belanja & Autocomplete
 * =========================================================
 * - Enter di baris berisi "• " → auto-bullet baris baru
 * - Ketik "- " di awal baris → otomatis ganti jadi "• "
 * - Paste teks biasa → tetap bekerja normal
 * - Autocomplete item dengan trigger "\" atau "item"
 * - Autocomplete supplier dengan trigger setelah "toko", "supplier", atau "di"
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { fetchClient } from '../api/client';

interface SmartTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minRows?: number;
  processor?: "local" | "gemini" | "ollama" | null;
}

interface Suggestion {
  type: 'product' | 'supplier';
  id: number;
  name: string;
  trigger?: string;
  matchStart: number;
  matchEnd: number;
}

const BULLET = '• ';

export function SmartTextarea({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  minRows = 10,
  processor = null,
}: SmartTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  
  // Autocomplete data states
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Load products and suppliers for autocompletion
  useEffect(() => {
    const loadAutocompleteData = async () => {
      try {
        const prodData = await fetchClient('/inventory/products');
        if (Array.isArray(prodData)) {
          setProducts(prodData);
        }
        const suppData = await fetchClient('/inventory/contacts?contact_type=supplier&limit=200');
        if (Array.isArray(suppData)) {
          setSuppliers(suppData);
        }
      } catch (err) {
        console.error('Error loading autocomplete data:', err);
      }
    };
    loadAutocompleteData();
  }, []);

  const handleSelectProduct = useCallback((productName: string, matchStart: number, matchEnd: number) => {
    const before = value.substring(0, matchStart);
    const after = value.substring(matchEnd);
    const newVal = before + productName + ' ' + after;
    onChange(newVal);
    setSuggestions([]);
    setActiveIndex(0);
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        const newCursor = matchStart + productName.length + 1;
        ref.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  }, [value, onChange]);

  const handleSelectSupplier = useCallback((supplierName: string, triggerWord: string, matchStart: number, matchEnd: number) => {
    const beforeTrigger = value.substring(0, matchStart);
    const after = value.substring(matchEnd);
    let replacement = '';
    // Prevent duplicate trigger word if selected supplier already starts with it (case-insensitive)
    if (supplierName.toLowerCase().startsWith(triggerWord.toLowerCase())) {
      replacement = supplierName;
    } else {
      replacement = triggerWord + ' ' + supplierName;
    }
    const newVal = beforeTrigger + replacement + ' ' + after;
    onChange(newVal);
    setSuggestions([]);
    setActiveIndex(0);
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        const newCursor = matchStart + replacement.length + 1;
        ref.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  }, [value, onChange]);

  const checkAutocomplete = useCallback((text: string, cursor: number) => {
    const textBeforeCursor = text.substring(0, cursor);
    
    // Pattern triggers
    const itemRegex1 = /(?:^|[\s\n])\\([^\s\\]*)$/;
    const itemRegex2 = /(?:^|[\s\n])item\s+([^\s]*)$/i;
    const supplierRegex = /(?:^|[\s\n])(toko|supplier|di)\s+([^\s]*)$/i;
    
    let match: RegExpExecArray | null = null;
    
    if ((match = itemRegex1.exec(textBeforeCursor)) !== null) {
      const query = match[1].toLowerCase();
      const matchStart = cursor - match[0].length;
      const matchEnd = cursor;
      
      const filtered = products
        .filter(p => p.name.toLowerCase().includes(query))
        .slice(0, 5)
        .map(p => ({
          type: 'product' as const,
          id: p.id,
          name: p.name,
          matchStart,
          matchEnd
        }));
      setSuggestions(filtered);
      setActiveIndex(0);
      return;
    }
    
    if ((match = itemRegex2.exec(textBeforeCursor)) !== null) {
      const query = match[1].toLowerCase();
      const matchStart = cursor - match[0].trimStart().length;
      const matchEnd = cursor;
      
      const filtered = products
        .filter(p => p.name.toLowerCase().includes(query))
        .slice(0, 5)
        .map(p => ({
          type: 'product' as const,
          id: p.id,
          name: p.name,
          matchStart,
          matchEnd
        }));
      setSuggestions(filtered);
      setActiveIndex(0);
      return;
    }
    
    if ((match = supplierRegex.exec(textBeforeCursor)) !== null) {
      const triggerWord = match[1];
      const query = match[2].toLowerCase();
      const matchStart = cursor - match[0].trimStart().length;
      const matchEnd = cursor;
      
      const filtered = suppliers
        .filter(s => s.name.toLowerCase().includes(query))
        .slice(0, 5)
        .map(s => ({
          type: 'supplier' as const,
          id: s.id,
          name: s.name,
          trigger: triggerWord,
          matchStart,
          matchEnd
        }));
      setSuggestions(filtered);
      setActiveIndex(0);
      return;
    }
    
    setSuggestions([]);
  }, [products, suppliers]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value: val } = ta;

    // ── Autocomplete Navigation ───────────────
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const active = suggestions[activeIndex];
        if (active.type === 'product') {
          handleSelectProduct(active.name, active.matchStart, active.matchEnd);
        } else {
          handleSelectSupplier(active.name, active.trigger || '', active.matchStart, active.matchEnd);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions([]);
        return;
      }
    }

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
  }, [onChange, suggestions, activeIndex, handleSelectProduct, handleSelectSupplier]);

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
        checkAutocomplete(val, lineStart + BULLET.length);
      });
      return;
    }

    onChange(val);
    checkAutocomplete(val, cursor);
  }, [onChange, checkAutocomplete]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      checkAutocomplete(ta.value, ta.selectionStart);
    }
  }, [checkAutocomplete]);

  // Hitung tinggi dinamis
  const rowCount = Math.max(minRows, (value.split('\n').length) + 1);

  return (
    <div className="relative group">
      {processor && (
        <div 
          className={cn(
            "absolute top-3 right-3 w-3 h-3 rounded-full z-10 shadow-sm border border-black/10 transition-colors",
            processor === 'ollama' ? "bg-blue-500" : 
            processor === 'gemini' ? "bg-rose-500" : "bg-yellow-400"
          )}
          title={`Processor: ${processor.toUpperCase()}`}
        />
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
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
      
      {/* Suggestions Overlay */}
      {suggestions.length > 0 && (
        <div className="absolute left-4 z-50 min-w-[260px] max-w-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden p-1 bottom-12 transition-all">
          <div className="px-2 py-1.5 text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-900 mb-1">
            Rekomendasi {suggestions[0].type === 'product' ? 'Item' : 'Supplier'}
          </div>
          {suggestions.map((s, idx) => (
            <button
              key={`${s.type}-${s.id}`}
              type="button"
              onClick={() => {
                if (s.type === 'product') {
                  handleSelectProduct(s.name, s.matchStart, s.matchEnd);
                } else {
                  handleSelectSupplier(s.name, s.trigger || '', s.matchStart, s.matchEnd);
                }
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between",
                idx === activeIndex
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              )}
            >
              <span className="truncate mr-2">{s.name}</span>
              {idx === activeIndex && (
                <span className="text-[9px] opacity-60 font-semibold px-1 py-0.5 bg-zinc-200/50 dark:bg-zinc-800/80 rounded font-sans shrink-0">Enter</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Hint di pojok kanan bawah */}
      <div className="absolute bottom-2 right-3 opacity-0 group-focus-within:opacity-100 transition-opacity duration-200">
        <span className="text-[10px] text-muted-foreground/50 select-none">
          Enter = bullet baru | \ = item | toko/supplier/di = supplier
        </span>
      </div>
    </div>
  );
}
