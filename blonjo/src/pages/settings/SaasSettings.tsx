import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { ShieldCheck, Plus } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { toast } from 'sonner';
import { formatNumber } from '../../lib/utils';

interface Tenant {
  id: number;
  name: string;
  subdomain: string | null;
  status: string;
  ocr_quota_monthly: number;
  created_at: string;
}

export default function SaasSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSubdomain, setNewTenantSubdomain] = useState('');
  const [newTenantQuota, setNewTenantQuota] = useState<number>(1000);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/saas');
      setTenants(data);
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_load_tenant'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) {
      toast.error(t('toast_err_tenant_name_required'));
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        name: newTenantName,
        status: 'active',
        ocr_quota_monthly: newTenantQuota
      };
      if (newTenantSubdomain.trim()) {
        payload.subdomain = newTenantSubdomain.toLowerCase();
      }

      await fetchClient('/saas', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toast.success(t('toast_success_create_tenant', { name: newTenantName }));
      setIsTenantModalOpen(false);
      setNewTenantName('');
      setNewTenantSubdomain('');
      setNewTenantQuota(1000);
      loadTenants();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast_err_create_tenant'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="p-8 border-violet-500/20 bg-card/60 backdrop-blur-md shadow-lg shadow-violet-600/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-border/40 gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-violet-500" />
            <div>
              <h2 className="text-xl font-bold text-violet-600">{t('saas_owner_panel')}</h2>
              <p className="text-sm text-muted-foreground">{t('saas_owner_desc')}</p>
            </div>
          </div>
          <Button 
            onClick={() => setIsTenantModalOpen(true)} 
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            {t('register_new_tenant')}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-violet-500/10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-violet-500/5 text-violet-700 text-xs uppercase tracking-wider font-semibold border-b border-border/10">
                <th className="py-4 px-6">{t('table_tenant_name')}</th>
                <th className="py-4 px-6">{t('table_subdomain')}</th>
                <th className="py-4 px-6">{t('table_ocr_quota')}</th>
                <th className="py-4 px-6">{t('table_license_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-500/5 text-sm">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-violet-500/5 transition-colors">
                  <td className="py-4 px-6 font-bold text-foreground">
                    <span className="text-xs text-muted-foreground font-mono mr-2">#{tenant.id}</span>
                    {tenant.name}
                  </td>
                  <td className="py-4 px-6 font-mono text-xs text-primary">
                    {tenant.subdomain ? `${tenant.subdomain}.samkarsa.com` : 'default-routing'}
                  </td>
                  <td className="py-4 px-6 font-semibold">
                    {formatNumber(tenant.ocr_quota_monthly, 0)} {t('pages_unit')}
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      tenant.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {tenant.status === 'active' ? t('status_active') : t('status_inactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isTenantModalOpen} onOpenChange={setIsTenantModalOpen}>
        <DialogContent className="max-w-md bg-card border border-violet-500/20 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-violet-600">
              <ShieldCheck className="w-5 h-5" />
              {t('register_tenant_title')}
            </DialogTitle>
            <DialogDescription>
              {t('register_tenant_desc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRegisterTenant} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="tenant_name" className="text-xs font-bold uppercase tracking-wider text-violet-700">{t('business_name_label')}</Label>
              <Input
                id="tenant_name"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                placeholder="Contoh: CV Elektronik Jaya"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant_sub" className="text-xs font-bold uppercase tracking-wider text-violet-700">{t('subdomain_label')}</Label>
              <div className="flex items-center">
                <Input
                  id="tenant_sub"
                  value={newTenantSubdomain}
                  onChange={(e) => setNewTenantSubdomain(e.target.value)}
                  placeholder="elektronik-jaya"
                  className="rounded-r-none font-mono text-sm"
                />
                <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-input bg-accent/40 px-3 text-xs text-muted-foreground font-mono">
                  .samkarsa.com
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t('subdomain_tip')}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant_quota" className="text-xs font-bold uppercase tracking-wider text-violet-700">{t('ocr_quota_label')}</Label>
              <Input
                id="tenant_quota"
                type="number"
                value={newTenantQuota}
                onChange={(e) => setNewTenantQuota(parseInt(e.target.value) || 0)}
                placeholder="1000"
                min={0}
                required
              />
            </div>

            <DialogFooter className="pt-4 border-t border-violet-500/10">
              <Button type="button" variant="outline" onClick={() => setIsTenantModalOpen(false)}>
                {t('btn_cancel')}
              </Button>
              <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white border-0" disabled={loading}>
                {t('btn_register_copy_coa')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
