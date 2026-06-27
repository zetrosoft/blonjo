/**
 * Transactions Page — Orchestrator
 * ==================================
 * File ini hanya bertanggung jawab pada:
 *  1. Layout halaman (header + tab switcher)
 *  2. Koordinasi antar hook
 *  3. Render child components
 *
 * Business logic sepenuhnya ada di hooks/:
 *  - useAccounts     : fetch COA
 *  - useSmartNote    : state & handler Smart Note
 *  - useOcrUpload    : upload struk foto + polling OCR
 *  - useSmartConfirm : kalkulasi & submit jurnal smart
 *  - useManualEntry  : state & submit jurnal manual
 *
 * @architect Semua perubahan logic → masuk ke hook terkait, bukan di sini
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Table2, Wand2 } from 'lucide-react';
import { cn } from '../lib/utils';

import { SmartNoteTab }        from './transaction/SmartNoteTab';
import { ManualEntryTab }      from './transaction/ManualEntryTab';
import { ConfirmJournalDialog } from './transaction/ConfirmJournalDialog';
import type { InputMode }       from './transaction/types';

import {
  useAccounts,
  useSmartNote,
  useOcrUpload,
  useSmartConfirm,
  useManualEntry,
} from './transaction/hooks';

export default function Transactions() {
  const { t } = useTranslation();
  const [inputMode, setInputMode] = useState<InputMode>('smart');

  // ── Hooks ─────────────────────────────────────────────────────────
  const { accounts, loading }  = useAccounts();
  const smartNote              = useSmartNote();
  const ocr                    = useOcrUpload(smartNote.setNoteText, smartNote.setParsedResult);
  const smartConfirm           = useSmartConfirm(accounts, smartNote.parsedResult, smartNote.handleReset);
  const manual                 = useManualEntry();

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-none px-4 md:px-6 lg:px-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">

      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('menu_transactions')}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t('tx_subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex gap-2 bg-muted/40 p-1 rounded-xl border border-border/50 w-fit">
        {[
          { id: 'smart'  as InputMode, icon: Wand2,   label: t('tx_smart_note'), desc: t('tx_smart_note_desc') },
          { id: 'manual' as InputMode, icon: Table2,  label: t('tx_manual'),     desc: t('tx_manual_desc')     },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setInputMode(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              inputMode === tab.id
                ? 'bg-background text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Smart Note Tab */}
      {inputMode === 'smart' && (
        <SmartNoteTab
          noteText={smartNote.noteText}
          setNoteText={smartNote.setNoteText}
          isParsing={smartNote.isParsing}
          isUploading={ocr.isUploading}
          parsedResult={smartNote.parsedResult}
          onParse={smartNote.handleParse}
          onVoiceTranscript={smartNote.handleVoiceTranscript}
          onReset={smartNote.handleReset}
          onLoadExample={smartNote.handleLoadExample}
          onFileUpload={ocr.handleFileUpload}
          fileInputRef={ocr.fileInputRef}
          onOpenConfirm={smartConfirm.open}
          saving={smartConfirm.saving}
          updateParsed={smartNote.updateParsed}
        />
      )}

      {/* Manual Entry Tab */}
      {inputMode === 'manual' && (
        <ManualEntryTab
          accounts={accounts}
          loading={loading}
          saving={manual.saving}
          date={manual.date}
          setDate={manual.setDate}
          refNo={manual.refNo}
          setRefNo={manual.setRefNo}
          description={manual.description}
          setDescription={manual.setDescription}
          type={manual.type}
          setType={manual.setType}
          entries={manual.entries}
          setEntries={manual.setEntries}
          onSubmit={manual.handleSubmit}
          isBalanced={manual.isBalanced}
          totalDebit={manual.totalDebit}
          totalCredit={manual.totalCredit}
        />
      )}

      {/* Confirm Journal Dialog */}
      <ConfirmJournalDialog
        isOpen={smartConfirm.isOpen}
        onOpenChange={smartConfirm.setIsOpen}
        parsedResult={smartNote.parsedResult}
        smartEntries={smartConfirm.entries}
        accounts={accounts}
        onUpdateEntry={smartConfirm.updateEntry}
        onExecuteSubmit={(status) => smartConfirm.submit(status, ocr.currentOcrTaskId)}
        saving={smartConfirm.saving}
      />
    </div>
  );
}
