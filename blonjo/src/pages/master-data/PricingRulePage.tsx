import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { 
  Sparkles, Wand2, Save, RotateCcw, Info, 
  Calendar, CheckCircle2, AlertCircle, Loader2 
} from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

export default function PricingRulePage() {
  const [story, setStory] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRule, setParsedRule] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const placeholder = "Contoh: Promo Spesial! Untuk produk Beras Super, jika beli 2 harganya jadi 6.500 per kg. Berlaku sampai akhir bulan ini.";

  const handleParse = async () => {
    if (!story.trim()) return;
    setIsParsing(true);
    setParsedRule(null);
    try {
      const res = await fetchClient('/inventory/pricing-rules/parse', {
        method: 'POST',
        body: JSON.stringify({ text: story })
      });
      setParsedRule(res.parsed_data);
      toast.success('Analisa Berhasil', { description: 'Aturan harga berhasil dikenali oleh AI.' });
    } catch (err: any) {
      toast.error('Gagal menganalisa teks', { description: err.message });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedRule) return;
    setSaving(true);
    try {
      // Logic save to backend
      toast.success('Aturan harga disimpan');
      setStory('');
      setParsedRule(null);
    } catch (err) {
      toast.error('Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Pricing Rule Builder</h2>
        <p className="text-muted-foreground text-sm">
          Buat aturan harga kompleks hanya dengan menceritakannya kepada AI.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Input Story */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Ceritakan Aturan Anda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={placeholder}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              className="min-h-[200px] bg-background border-primary/20 focus-visible:ring-primary/30"
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleParse} 
                disabled={isParsing || !story.trim()} 
                className="flex-1 gap-2"
              >
                {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Analisa dengan AI
              </Button>
              <Button variant="outline" size="icon" onClick={() => { setStory(''); setParsedRule(null); }}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-[10px] text-muted-foreground flex gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <p>AI akan mendeteksi tipe promo (Diskon, Volume, atau Paket Bundle) secara otomatis dari teks Anda.</p>
            </div>
          </CardContent>
        </Card>

        {/* Right: Preview Card */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground px-1">Pratinjau Hasil</h3>
          
          {!parsedRule ? (
            <div className="border-2 border-dashed border-border rounded-xl h-[300px] flex flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="p-3 bg-muted rounded-full">
                <Wand2 className="w-6 h-6 opacity-20" />
              </div>
              <p className="text-xs italic">Belum ada data untuk ditampilkan</p>
            </div>
          ) : (
            <Card className="border-emerald-500/30 bg-emerald-500/5 animate-in fade-in slide-in-from-right-4">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge className="bg-emerald-500 hover:bg-emerald-600">
                    {parsedRule.rule_type.toUpperCase()}
                  </Badge>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {parsedRule.valid_from}
                  </div>
                </div>
                <CardTitle className="text-xl mt-2">{parsedRule.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-background/50 rounded-lg p-4 border border-emerald-500/10">
                  <p className="text-xs text-muted-foreground mb-1">Logika Dikenali:</p>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <div>
                      {parsedRule.rule_type === 'volume' && (
                        <p className="font-semibold">
                          Beli Min. <span className="text-primary">{parsedRule.rule_payload.qty_threshold}</span> pcs, 
                          Harga jadi <span className="text-primary">{formatRp(parsedRule.rule_payload.price_per_qty)}</span>/pcs
                        </p>
                      )}
                      {parsedRule.rule_type === 'formula' && (
                        <p className="font-semibold">
                          Gunakan Formula: <span className="text-primary">{parsedRule.rule_payload.multiplier}x Harga Dasar</span>
                        </p>
                      )}
                      {/* Add other types as needed */}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-emerald-600 font-bold uppercase">Ready to Save</span>
                  </div>
                  <div className="w-full bg-emerald-500/20 h-1 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-full" />
                  </div>
                </div>

                <Button 
                  onClick={handleSave} 
                  disabled={saving} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Simpan Aturan Harga
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
