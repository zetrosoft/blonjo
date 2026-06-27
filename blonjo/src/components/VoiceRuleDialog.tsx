import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { Info, HelpCircle } from 'lucide-react';
import { defaultVoiceRules } from '../lib/voiceRules';
import { Button } from './ui/button';

export function VoiceRuleDialog() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Panduan Perintah Suara</AlertDialogTitle>
          <AlertDialogDescription>
            Gunakan kata kunci berikut saat merekam suara untuk otomatisasi pengetikan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="my-4 max-h-[300px] overflow-y-auto pr-2">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="text-left pb-2 font-semibold">Ucapkan</th>
                <th className="text-left pb-2 font-semibold">Hasil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {defaultVoiceRules.map((rule, idx) => (
                <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 font-medium text-primary">
                    {rule.pattern.split('|').map((p, i) => (
                      <code key={i} className="bg-muted px-1 rounded text-[11px] mr-1 border border-border/50">
                        {p.replace('\\d+', 'N')}
                      </code>
                    ))}
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold text-xs border border-emerald-500/20">
                      {rule.replacement === '\n' ? 'Line Break' : rule.replacement}
                    </span>
                    {rule.description && (
                      <div className="text-[10px] mt-1 opacity-70 italic">{rule.description}</div>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="group hover:bg-muted/30 transition-colors">
                <td className="py-2.5 font-medium text-primary">
                  <code className="bg-muted px-1 rounded text-[11px] border border-border/50">hapus [N] kata</code>
                </td>
                <td className="py-2.5 text-muted-foreground">
                  <span className="text-rose-500 text-xs font-semibold italic">Menghapus N kata terakhir</span>
                </td>
              </tr>
              <tr className="group hover:bg-muted/30 transition-colors">
                <td className="py-2.5 font-medium text-primary">
                  <code className="bg-muted px-1 rounded text-[11px] border border-border/50">buat tabel ...</code>
                </td>
                <td className="py-2.5 text-muted-foreground">
                  <span className="text-blue-500 text-xs font-semibold italic">Membuat tabel Markdown</span>
                </td>
              </tr>
              {/* Aturan Tanggal Relatif */}
              <tr className="group hover:bg-muted/30 transition-colors">
                <td className="py-2.5 font-medium text-primary">
                  <div className="flex flex-col gap-1">
                    <code className="bg-muted px-1 rounded text-[11px] border border-border/50 w-fit">hari kemarin</code>
                    <code className="bg-muted px-1 rounded text-[11px] border border-border/50 w-fit">lusa</code>
                    <code className="bg-muted px-1 rounded text-[11px] border border-border/50 w-fit">[N] hari yang lalu</code>
                    <code className="bg-muted px-1 rounded text-[11px] border border-border/50 w-fit">jatuh tempo [N] hari</code>
                  </div>
                </td>
                <td className="py-2.5 text-muted-foreground">
                  <span className="text-indigo-500 text-xs font-semibold italic">Konversi Tanggal Otomatis</span>
                  <div className="text-[10px] mt-1 opacity-70">Contoh: "hari kemarin" jadi "2026-06-02"</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction className="w-full sm:w-auto bg-primary">Saya Mengerti</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
