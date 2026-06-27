import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Printer, FileText, Download, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface A4PaperProps {
  title: string;
  pdfUrl?: string; // Optional: if provided, will show PDF viewer
  onRefresh?: () => void;
  children?: React.ReactNode;
}

export function A4Paper({ title, pdfUrl, onRefresh, children }: A4PaperProps) {
  const { t } = useTranslation();

  const handlePrint = () => {
    if (pdfUrl) {
      // Create a temporary iframe to print the PDF
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Remove iframe after short delay to allow print dialog to open
        setTimeout(() => document.body.removeChild(iframe), 1000);
      };
    } else {
      window.print();
    }
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `${title.replace(/\s+/g, '_')}.pdf`;
      link.click();
    }
  };

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-zinc-100 dark:bg-zinc-950 py-10 px-4">
      {/* PDF Toolbar */}
      <div className="w-[210mm] mb-6 flex justify-between items-center bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="text-[10px] text-zinc-500">Pratinjau PDF Instan</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} title={t('refresh_data')} className="h-9 w-9 p-0">
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload}
            disabled={!pdfUrl}
            className="gap-2 font-bold h-9 border-zinc-200"
          >
            <Download className="w-4 h-4" />
            {t('btn_download_pdf')}
          </Button>
          <Button 
            onClick={handlePrint}
            disabled={!pdfUrl && !children}
            className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold h-9 shadow-lg"
          >
            <Printer className="w-4 h-4" />
            {t('btn_print')}
          </Button>
        </div>
      </div>

      {/* PDF Canvas Container */}
      <div className="relative group shadow-2xl">
        <div className={cn(
          "relative w-[210mm] min-h-[297mm] bg-white text-black overflow-hidden flex flex-col",
          "print:shadow-none print:w-full print:min-h-0 print:p-0"
        )}>
          {pdfUrl ? (
            /* REAL PDF VIEWER */
            <iframe 
              src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
              className="w-full h-[297mm] border-none"
              title="PDF Preview"
            />
          ) : (
            /* FALLBACK / HTML VIEW */
            <div className="p-[20mm] flex-1 flex flex-col print:p-0">
              {children}
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            background: white !important;
            margin: 0;
            padding: 0;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
