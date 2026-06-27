import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Shield, Plus, Edit, Trash2, Key, AlertCircle } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { toast } from 'sonner';

interface Permission {
  id: number;
  name: string;
  description: string;
}

interface CustomRole {
  id: number;
  name: string;
  permissions: Permission[];
}

export default function RoleSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [masterPermissions, setMasterPermissions] = useState<Permission[]>([]);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  useEffect(() => {
    loadRolesAndPermissions();
  }, []);

  const loadRolesAndPermissions = async () => {
    setLoading(true);
    try {
      const rolesData = await fetchClient('/roles');
      const permsData = await fetchClient('/roles/permissions');
      setRoles(rolesData);
      setMasterPermissions(permsData);
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_load_roles'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRoleModal = (role: CustomRole | null = null) => {
    setEditingRole(role);
    if (role) {
      setRoleName(role.name);
      setSelectedPermissions(role.permissions.map(p => p.name));
    } else {
      setRoleName('');
      setSelectedPermissions([]);
    }
    setIsRoleModalOpen(true);
  };

  const handleTogglePermission = (permName: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permName) 
        ? prev.filter(p => p !== permName) 
        : [...prev, permName]
    );
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingRole) {
        // Update Mode
        await fetchClient(`/roles/${editingRole.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: roleName,
            permissions: selectedPermissions
          })
        });
        toast.success(t('toast_success_update_role', { name: roleName }));
      } else {
        // Create Mode
        await fetchClient('/roles', {
          method: 'POST',
          body: JSON.stringify({
            name: roleName,
            permissions: selectedPermissions
          })
        });
        toast.success(t('toast_success_create_role', { name: roleName }));
      }
      setIsRoleModalOpen(false);
      loadRolesAndPermissions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast_err_save_role'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role: CustomRole) => {
    if (!confirm(t('confirm_delete_role', { name: role.name }))) return;
    
    try {
      await fetchClient(`/roles/${role.id}`, {
        method: 'DELETE'
      });
      toast.success(t('toast_success_delete_role', { name: role.name }));
      loadRolesAndPermissions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast_err_delete_role'));
    }
  };

  return (
    <>
      <Card className="p-8 border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-border/40 gap-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">{t('setting_roles')}</h2>
              <p className="text-sm text-muted-foreground">{t('roles_management_desc')}</p>
            </div>
          </div>
          <Button onClick={() => handleOpenRoleModal(null)} className="gap-2 self-start md:self-auto">
            <Plus className="w-4 h-4" />
            {t('create_custom_role')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.length === 0 ? (
            <div className="md:col-span-2 py-8 text-center text-muted-foreground">
              {t('no_custom_roles')}
            </div>
          ) : (
            roles.map((role) => (
              <div 
                key={role.id}
                className="flex flex-col justify-between p-6 rounded-2xl border border-border/30 bg-accent/10 hover:border-primary/30 transition-all duration-300"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Key className="w-4 h-4 text-primary" />
                      {role.name}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenRoleModal(role)}
                        className="h-8 px-2 text-primary hover:bg-primary/5"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role)}
                        className="h-8 px-2 text-rose-500 hover:bg-rose-500/5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {role.permissions.map(p => (
                      <span 
                        key={p.id}
                        className="px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-[11px] font-medium border border-primary/10"
                      >
                        {p.name}
                      </span>
                    ))}
                    {role.permissions.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">Tidak memiliki hak akses apa pun.</span>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground border-t border-border/20 pt-3 mt-3 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/60" />
                  {t('roles_db_disclaimer')}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Dialog open={isRoleModalOpen} onOpenChange={setIsRoleModalOpen}>
        <DialogContent className="max-w-lg bg-card border border-border/40 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {editingRole ? t('edit_custom_role') : t('create_custom_role_title')}
            </DialogTitle>
            <DialogDescription>
              {t('role_dialog_desc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRole} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="role_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('role_name_label')}</Label>
              <Input
                id="role_name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Contoh: Staf Gudang, Auditor Keuangan"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">{t('select_permissions')}</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto p-3 rounded-xl border border-border/30 bg-accent/15">
                {masterPermissions.map((perm) => {
                  const isChecked = selectedPermissions.includes(perm.name);
                  return (
                    <label 
                      key={perm.id} 
                      className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all hover:bg-accent/40 ${
                        isChecked ? 'bg-primary/5 border border-primary/20' : 'border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleTogglePermission(perm.name)}
                        className="mt-1 w-4 h-4 text-primary bg-accent border-border rounded focus:ring-primary"
                      />
                      <div>
                        <div className="text-xs font-bold text-foreground">{perm.name}</div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{perm.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-border/20">
              <Button type="button" variant="outline" onClick={() => setIsRoleModalOpen(false)}>
                {t('btn_cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {editingRole ? t('btn_save_submit') : t('btn_create_role')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
