import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Store, Save } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { toast } from 'sonner';

interface AppSetting {
  id: number;
  key: string;
  value: string;
  description: string | null;
}

export default function StoreSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const [storeName, setStoreName] = useState<string>('');
  const [storeAddress, setStoreAddress] = useState<string>('');
  const [storePhone, setStorePhone] = useState<string>('');
  const [cogsRate, setCogsRate] = useState<number>(70);
  const [printerWidth, setPrinterWidth] = useState<'58mm' | '80mm'>('58mm');
  const [autoPostJournal, setAutoPostJournal] = useState<boolean>(true);

  useEffect(() => {
    loadStoreSettings();
  }, []);

  async function loadStoreSettings() {
    setLoading(true);
    try {
      const data: AppSetting[] = await fetchClient('/settings');
      data.forEach(item => {
        if (item.key === 'store_name') setStoreName(item.value);
        if (item.key === 'store_address') setStoreAddress(item.value);
        if (item.key === 'store_phone') setStorePhone(item.value);
        if (item.key === 'default_cogs_rate') setCogsRate(Number(item.value));
        if (item.key === 'printer_paper_width') setPrinterWidth(item.value as '58mm' | '80mm');
        if (item.key === 'auto_post_journal') setAutoPostJournal(item.value === 'true');
      });
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_load_store'));
    } finally {
      setLoading(false);
    }
  }

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const settingsToSave = [
        { key: 'store_name', value: storeName, description: 'Nama Toko' },
        { key: 'store_address', value: storeAddress, description: 'Alamat Toko' },
        { key: 'store_phone', value: storePhone, description: 'Nomor Telepon Toko' },
        { key: 'default_cogs_rate', value: cogsRate.toString(), description: 'Estimasi Persentase HPP (%)' },
        { key: 'printer_paper_width', value: printerWidth, description: 'Lebar Kertas Struk Printer Thermal' },
        { key: 'auto_post_journal', value: autoPostJournal.toString(), description: 'Posting Jurnal Otomatis' }
      ];

      for (const item of settingsToSave) {
        await fetchClient('/settings', {
          method: 'POST',
          body: JSON.stringify(item)
        });
      }
      toast.success(t('toast_success_save_store'));
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_save_store'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
        <Store className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">{t('store_profile_and_printer')}</h2>
          <p className="text-sm text-muted-foreground">{t('store_profile_desc')}</p>
        </div>
      </div>

      <form onSubmit={handleSaveStoreSettings} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="store_name" className="text-sm font-semibold">{t('store_name')}</Label>
            <Input
              id="store_name"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Contoh: Kedai Kopi Makmur"
              className="bg-accent/20 focus:ring-primary focus:border-primary"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="store_phone" className="text-sm font-semibold">{t('store_phone')}</Label>
            <Input
              id="store_phone"
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              placeholder="Contoh: 08123456789"
              className="bg-accent/20 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cogs_rate" className="text-sm font-semibold">Estimasi Persentase HPP (%)</Label>
            <div className="relative">
              <Input
                id="cogs_rate"
                type="number"
                value={cogsRate}
                onChange={(e) => setCogsRate(Number(e.target.value))}
                placeholder="70"
                className="bg-accent/20 focus:ring-primary focus:border-primary pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
            </div>
            <p className="text-[10px] text-muted-foreground italic">Digunakan untuk menghitung HPP otomatis jika rincian item tidak diisi.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 bg-primary/5 p-4 rounded-xl border border-primary/10">
          <Checkbox 
            id="auto_post_journal" 
            checked={autoPostJournal} 
            onCheckedChange={(checked) => setAutoPostJournal(checked === true)}
            className="w-5 h-5"
          />
          <div className="grid gap-1 leading-none">
            <label htmlFor="auto_post_journal" className="text-sm font-bold cursor-pointer text-foreground">
              {t('setting_auto_post')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('setting_auto_post_desc')}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="store_address" className="text-sm font-semibold">{t('store_address')}</Label>
          <textarea
            id="store_address"
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
            placeholder="Contoh: Jl. Diponegoro No. 45, Jakarta Pusat"
            rows={3}
            className="w-full flex min-h-[80px] rounded-md border border-input bg-accent/20 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold">{t('printer_paper_width')}</Label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setPrinterWidth('58mm')}
              className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                printerWidth === '58mm'
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border/40 hover:bg-accent/20 text-muted-foreground'
              }`}
            >
              <span className="font-bold text-lg">58 mm</span>
              <span className="text-xs text-muted-foreground mt-1">{t('printer_width_58_desc')}</span>
            </button>

            <button
              type="button"
              onClick={() => setPrinterWidth('80mm')}
              className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                printerWidth === '80mm'
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border/40 hover:bg-accent/20 text-muted-foreground'
              }`}
            >
              <span className="font-bold text-lg">80 mm</span>
              <span className="text-xs text-muted-foreground mt-1">{t('printer_width_80_desc')}</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-border/40 flex justify-end">
          <Button type="submit" className="gap-2 px-6" disabled={loading}>
            <Save className="w-4 h-4" />
            {t('save_changes')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
