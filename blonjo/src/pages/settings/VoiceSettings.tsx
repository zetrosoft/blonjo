import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Mic2, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { toast } from 'sonner';
import { VoiceRule, defaultVoiceRules, sanitizeVoiceRules } from '../../lib/voiceRules';

interface AppSetting {
  id: number;
  key: string;
  value: string;
  description: string | null;
}

export default function VoiceSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [voiceRules, setVoiceRules] = useState<VoiceRule[]>([]);
  const [isVoiceRuleModalOpen, setIsVoiceRuleModalOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleReplacement, setNewRuleReplacement] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');

  useEffect(() => {
    loadVoiceRules();
  }, []);

  async function loadVoiceRules() {
    setLoading(true);
    try {
      // Backend returns 404 if not found, we handle it as empty/default
      const data: AppSetting = await fetchClient('/settings/voice_rules').catch(() => null);
      if (data && data.value) {
        setVoiceRules(sanitizeVoiceRules(JSON.parse(data.value)));
      } else {
        setVoiceRules(sanitizeVoiceRules(defaultVoiceRules));
      }
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_load_voice'));
    } finally {
      setLoading(false);
    }
  }

  const handleSaveVoiceRules = async (rulesToSave: VoiceRule[]) => {
    setLoading(true);
    try {
      const sanitized = sanitizeVoiceRules(rulesToSave);
      await fetchClient('/settings', {
        method: 'POST',
        body: JSON.stringify({
          key: 'voice_rules',
          value: JSON.stringify(sanitized),
          description: 'Pengaturan Kustomisasi Voice AI'
        })
      });
      setVoiceRules(sanitized);
      toast.success(t('toast_success_save_voice'));
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_save_voice'));
    } finally {
      setLoading(false);
    }
  };

  const openVoiceRuleModal = (index: number | null = null) => {
    if (index !== null) {
      const rule = voiceRules[index];
      const patternStr = rule.pattern ? String(rule.pattern) : '';
      const replacementStr = rule.replacement ? String(rule.replacement) : '';
      setNewRulePattern(patternStr.replace(/^\/|\/gi?$/g, ''));
      setNewRuleReplacement(replacementStr);
      setNewRuleDesc(rule.description || '');
      setEditingRuleIndex(index);
    } else {
      setNewRulePattern('');
      setNewRuleReplacement('');
      setNewRuleDesc('');
      setEditingRuleIndex(null);
    }
    setIsVoiceRuleModalOpen(false); // Close current first to reset
    setTimeout(() => setIsVoiceRuleModalOpen(true), 10);
  };

  const handleSaveSingleVoiceRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern || !newRuleReplacement) return;
    
    const rule: VoiceRule = {
      pattern: newRulePattern,
      replacement: newRuleReplacement,
      description: newRuleDesc
    };

    let updatedRules = [...voiceRules];
    if (editingRuleIndex !== null) {
      updatedRules[editingRuleIndex] = rule;
    } else {
      updatedRules.push(rule);
    }

    handleSaveVoiceRules(updatedRules);
    setIsVoiceRuleModalOpen(false);
  };

  const handleDeleteVoiceRule = (index: number) => {
    if (!confirm(t('confirm_delete_voice_rule'))) return;
    const updatedRules = voiceRules.filter((_, i) => i !== index);
    handleSaveVoiceRules(updatedRules);
  };

  const resetVoiceRules = () => {
    if (!confirm(t('confirm_reset_voice_rules'))) return;
    handleSaveVoiceRules(defaultVoiceRules);
  };

  return (
    <>
      <Card className="p-8 border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-border/40 gap-4">
          <div className="flex items-center gap-3">
            <Mic2 className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">{t('setting_voice')}</h2>
              <p className="text-sm text-muted-foreground">{t('voice_rules_desc')}</p>
            </div>
          </div>
          <div className="flex gap-2 self-start md:self-auto">
            <Button variant="outline" onClick={resetVoiceRules} className="gap-2 text-xs">
              <RefreshCw className="w-3 h-3" />
              {t('reset_defaults')}
            </Button>
            <Button onClick={() => openVoiceRuleModal(null)} className="gap-2 text-xs">
              <Plus className="w-4 h-4" />
              {t('add_rule')}
            </Button>
          </div>
        </div>

        {voiceRules.length === 0 ? (
          <div className="text-center py-8 bg-accent/20 rounded-xl border border-dashed border-border">
            <Mic2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground font-medium">{t('no_custom_filters')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('no_custom_filters_desc')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/30 mt-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-accent/40 text-muted-foreground text-xs uppercase tracking-wider font-semibold border-b border-border/40">
                  <th className="py-3 px-4">{t('table_input_pattern')}</th>
                  <th className="py-3 px-4">{t('table_output_replacement')}</th>
                  <th className="py-3 px-4 hidden md:table-cell">{t('table_description')}</th>
                  <th className="py-3 px-4 text-right">{t('table_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-sm">
                {voiceRules.map((rule, idx) => (
                  <tr key={idx} className="hover:bg-accent/20 transition-colors group">
                    <td className="py-3 px-4">
                      <span className="font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded text-sm whitespace-nowrap">
                        {typeof rule.pattern === 'string' ? rule.pattern : String(rule.pattern || '')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded text-sm whitespace-nowrap">
                        {typeof rule.replacement === 'string' ? rule.replacement : String(rule.replacement || '')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                      {rule.description || '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => openVoiceRuleModal(idx)} className="h-8 w-8 text-blue-500 hover:bg-blue-500/10">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteVoiceRule(idx)} className="h-8 w-8 text-rose-500 hover:bg-rose-500/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={isVoiceRuleModalOpen} onOpenChange={setIsVoiceRuleModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border/40 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Mic2 className="w-5 h-5 text-primary" />
              {editingRuleIndex !== null ? t('edit_word_filter') : t('add_word_filter')}
            </DialogTitle>
            <DialogDescription>
              {t('word_filter_desc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSingleVoiceRule} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule_pattern" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('detected_word_label')}</Label>
              <Input
                id="rule_pattern"
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                placeholder='Contoh: "a keong" atau "saunya"'
                required
              />
              <p className="text-[10px] text-muted-foreground">{t('detected_word_tip')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule_replacement" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('replacement_text_label')}</Label>
              <Input
                id="rule_replacement"
                value={newRuleReplacement}
                onChange={(e) => setNewRuleReplacement(e.target.value)}
                placeholder='Contoh: "@" atau "\n" untuk enter'
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule_desc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('filter_desc_label')}</Label>
              <Input
                id="rule_desc"
                value={newRuleDesc}
                onChange={(e) => setNewRuleDesc(e.target.value)}
                placeholder={t('filter_desc_placeholder')}
              />
            </div>

            <DialogFooter className="pt-4 border-t border-border/20">
              <Button type="button" variant="outline" onClick={() => setIsVoiceRuleModalOpen(false)}>
                {t('btn_cancel')}
              </Button>
              <Button type="submit">
                {t('btn_save_filter')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
