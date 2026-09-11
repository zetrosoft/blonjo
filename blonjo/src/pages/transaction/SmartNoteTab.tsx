import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { SmartTextarea } from '../../components/SmartTextarea';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { ParsePreview } from '../../components/ParsePreview';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import {
  Sparkles, RotateCcw, Wand2, Send, FileText, ChevronRight, Loader2, Plus, AlertCircle, Camera, CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { SmartNoteProps } from './types';
import { CameraModal } from '../../components/CameraModal';
import { toast } from 'sonner';

function DynamicOcrStatus() {
  const { t } = useTranslation();
  const [phase, setPhase] = React.useState(0);
  const phases = React.useMemo(() => [
    { text: t('tx_ocr_phase_1'), icon: "📤" },
    { text: t('tx_ocr_phase_2'), icon: "👁️" },
    { text: t('tx_ocr_phase_3'), icon: "🔍" },
    { text: t('tx_ocr_phase_4'), icon: "🧠" },
    { text: t('tx_ocr_phase_5'), icon: "⚡" },
  ], [t]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => Math.min(p + 1, phases.length - 1));
    }, 2000);
    return () => clearInterval(interval);
  }, [phases.length]);

  return (
    <div className="absolute bottom-2 left-2 z-20 pointer-events-none">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground bg-background/95 px-3 py-1.5 rounded-full shadow-lg border border-primary/40 ring-1 ring-primary/20 animate-in fade-in">
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
        <span className="text-sm">{phases[phase].icon}</span>
        <span className="animate-pulse whitespace-nowrap">{phases[phase].text}</span>
      </div>
    </div>
  );
}

function DynamicParseStatus() {
  const { t } = useTranslation();
  const [phase, setPhase] = React.useState(0);
  const phases = React.useMemo(() => [
    { text: t('tx_parse_phase_1'), icon: "🧠" },
    { text: t('tx_parse_phase_2'), icon: "🔍" },
    { text: t('tx_parse_phase_3'), icon: "🧮" },
    { text: t('tx_parse_phase_4'), icon: "⚡" },
  ], [t]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => Math.min(p + 1, phases.length - 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [phases.length]);

  return (
    <div className="absolute bottom-2 left-2 z-20 pointer-events-none">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground bg-background/95 px-3 py-1.5 rounded-full shadow-lg border border-primary/40 ring-1 ring-primary/20 animate-in fade-in">
        <Wand2 className="w-3.5 h-3.5 text-primary animate-bounce" />
        <span className="text-sm">{phases[phase].icon}</span>
        <span className="animate-pulse whitespace-nowrap">{phases[phase].text}</span>
      </div>
    </div>
  );
}

export function SmartNoteTab({
  noteText,
  setNoteText,
  isParsing,
  isUploading,
  parsedResult,
  onParse,
  onVoiceTranscript,
  onReset,
  onLoadExample,
  onFileUpload,
  onPhotoCaptured,
  fileInputRef,
  onOpenConfirm,
  saving,
  updateParsed,
  ocrSource
}: SmartNoteProps) {
  const { t } = useTranslation();
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Left: Input Area */}
      <div className="lg:col-span-2 space-y-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-primary" />
              {t('tx_note_card_title')}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t('tx_note_card_desc')}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              {/* ── Wrapper textarea + overlay animasi (terpisah dari tombol) ── */}
              <div className="relative">
                <SmartTextarea
                  value={noteText}
                  onChange={(val) => {
                    setNoteText(val);
                    // Parent will handle resetting parsedResult if needed
                  }}
                  placeholder={t('tx_note_placeholder')}
                  className="min-h-[140px] pb-14"
                />

                {(isUploading || isParsing) && (
                  <div className="absolute inset-0 z-10 bg-transparent rounded-md overflow-hidden border border-primary/30 cursor-wait pointer-events-none">
                    {/* Laser scan animation overlay */}
                    <div className="absolute left-0 w-full h-[2px] bg-primary shadow-[0_0_15px_rgba(34,197,94,1)] animate-scan pointer-events-none" />
                    {/* Dynamic Status Component positioned at bottom-left */}
                    {isUploading ? <DynamicOcrStatus /> : <DynamicParseStatus />}
                  </div>
                )}
              </div>

              {/* Tombol-tombol (terpisah dari overlay, selalu di atas) */}
              <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-2.5">
                <TooltipProvider>
                  {/* Tombol Kamera */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative group">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-11 w-11 rounded-full border-2 border-primary/40 bg-background/95 backdrop-blur-sm transition-all duration-300 shadow-lg hover:border-primary hover:scale-110 active:scale-95 group-hover:shadow-primary/20"
                          onClick={() => setIsCameraOpen(true)}
                          disabled={isUploading}
                        >
                          <Camera className="h-5 w-5 text-primary" />
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="bg-zinc-900 text-white border-zinc-800">
                      <p className="font-bold">{t('tx_tooltip_camera_title')}</p>
                      <p className="text-[10px] opacity-70">{t('tx_tooltip_camera_desc')}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Tombol Upload */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative group">
                        <input
                          id="receipt-upload-input"
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx"
                          onChange={onFileUpload}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-11 w-11 rounded-full border-2 border-primary/40 bg-background/95 backdrop-blur-sm transition-all duration-300 shadow-lg hover:border-primary hover:scale-110 active:scale-95 group-hover:shadow-primary/20"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          <Plus className="h-6 w-6 text-primary group-hover:rotate-90 transition-transform duration-300" />
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="bg-zinc-900 text-white border-zinc-800">
                      <p className="font-bold">{t('tx_tooltip_upload_title')}</p>
                      <p className="text-[10px] opacity-70">{t('tx_tooltip_upload_desc')}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Tombol Voice Record */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative group">
                        <VoiceRecorder 
                          onTranscript={onVoiceTranscript} 
                          disabled={isParsing || saving || isUploading} 
                          initialText={noteText} 
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="bg-zinc-900 text-white border-zinc-800">
                      <p className="font-bold">{t('tx_tooltip_voice_title')}</p>
                      <p className="text-[10px] opacity-70">{t('tx_tooltip_voice_desc')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={onParse}
                disabled={!noteText.trim() || isParsing}
                className="gap-2"
              >
                {isParsing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isParsing ? t('tx_btn_parsing') : t('tx_btn_parse')}
              </Button>

              <Button
                variant="outline"
                onClick={onLoadExample}
                className="gap-2 text-xs"
                size="sm"
              >
                <ChevronRight className="w-3 h-3" />
                {t('tx_btn_example')}
              </Button>

              {noteText && (
                <Button
                  variant="ghost"
                  onClick={onReset}
                  className="gap-1 text-muted-foreground text-xs"
                  size="sm"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('tx_btn_reset')}
                </Button>
              )}
            </div>

            {/* Keyword Guide */}
            <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{t('tx_keyword_guide')}</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: t('tx_kw_purchase'), color: 'bg-rose-500/15 text-rose-400' },
                  { label: t('tx_kw_income'), color: 'bg-emerald-500/15 text-emerald-400' },
                  { label: t('tx_kw_operational'), color: 'bg-orange-500/15 text-orange-400' },
                  { label: t('tx_kw_transfer_out'), color: 'bg-violet-500/15 text-violet-400' },
                  { label: t('tx_kw_transfer_in'), color: 'bg-cyan-500/15 text-cyan-400' },
                  { label: t('tx_kw_capital'), color: 'bg-sky-500/15 text-sky-400' },
                ].map((kw) => (
                  <span
                    key={kw.label}
                    className={cn('text-xs px-2 py-0.5 rounded-full border border-current/20 font-medium', kw.color)}
                  >
                    {kw.label}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Preview & Submit */}
      <div className="lg:col-span-3 space-y-3">
        <Card className={cn(
          'border-border/60 transition-all duration-300',
          parsedResult ? 'border-primary/30 bg-primary/3' : ''
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                {t('tx_preview_title')}
              </div>
              {parsedResult && (() => {
                const confMap: Record<string, { label: string; icon: any; cls: string }> = {
                  high:   { label: t('tx_accuracy_high'),  icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
                  medium: { label: t('tx_accuracy_medium'),  icon: AlertCircle,  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
                  low:    { label: t('tx_accuracy_low'),  icon: AlertCircle,  cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
                };
                const conf = confMap[parsedResult.confidence] || confMap.medium;
                const ConfIcon = conf.icon;
                return (
                  <span className={cn(
                    'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                    conf.cls
                  )}>
                    <ConfIcon className="w-3 h-3" />
                    {conf.label}
                  </span>
                );
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!parsedResult ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                  <Wand2 className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('tx_preview_empty')}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {t('tx_preview_empty_desc')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <ParsePreview parsed={parsedResult} onUpdate={updateParsed} ocrSource={ocrSource} />

                <Button
                  onClick={onOpenConfirm}
                  disabled={saving || parsedResult.total_amount <= 0}
                  className="w-full gap-2"
                  size="lg"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {saving ? t('tx_btn_saving') : t('tx_btn_save_tx')}
                </Button>

                {parsedResult.total_amount <= 0 && (
                  <p className="text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {t('tx_err_amount_not_detected')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={(file) => onPhotoCaptured?.(file)}
        onBarcodeScanned={(code) => {
          setNoteText(noteText ? `${noteText}\nBarcode: ${code}` : `Barcode: ${code}`);
          toast.success('Barcode disalin ke catatan', { description: code });
        }}
      />
    </div>
  );
}
