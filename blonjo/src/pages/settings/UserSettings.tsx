import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Users, Plus, Edit, Trash2 } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/auth';

interface Employee {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'manager' | 'cashier';
  preferred_language: string;
  is_active: boolean;
}

export default function UserSettings() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeRole, setEmployeeRole] = useState<'admin' | 'manager' | 'cashier'>('cashier');
  const [employeePassword, setEmployeePassword] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/users');
      setEmployees(data);
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_load_employee'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmployeeModal = (emp: Employee | null = null) => {
    setEditingEmployee(emp);
    if (emp) {
      setEmployeeEmail(emp.email);
      setEmployeeName(emp.full_name || '');
      setEmployeeRole(emp.role);
      setEmployeePassword('');
    } else {
      setEmployeeEmail('');
      setEmployeeName('');
      setEmployeeRole('cashier');
      setEmployeePassword('');
    }
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingEmployee) {
        // Update
        const payload: any = {
          full_name: employeeName,
          role: employeeRole,
        };
        if (employeePassword) payload.password = employeePassword;

        await fetchClient(`/users/${editingEmployee.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        toast.success(t('toast_success_update_employee', { name: employeeName }));
      } else {
        // Create
        await fetchClient('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: employeeEmail,
            full_name: employeeName,
            role: employeeRole,
            password: employeePassword
          })
        });
        toast.success(t('toast_success_create_employee', { name: employeeName }));
      }
      setIsEmployeeModalOpen(false);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast_err_save_employee'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEmployeeActive = async (emp: Employee) => {
    try {
      await fetchClient(`/users/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !emp.is_active })
      });
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_update_employee'));
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!confirm(t('confirm_delete_employee', { name: emp.full_name || emp.email }))) return;
    
    try {
      await fetchClient(`/users/${emp.id}`, {
        method: 'DELETE'
      });
      toast.success(t('toast_success_delete_employee', { name: emp.full_name || emp.email }));
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast_err_delete_employee'));
    }
  };

  return (
    <>
      <Card className="p-8 border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-border/40 gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">{t('setting_users')}</h2>
              <p className="text-sm text-muted-foreground">{t('employee_management_desc')}</p>
            </div>
          </div>
          <Button onClick={() => handleOpenEmployeeModal(null)} className="gap-2 self-start md:self-auto">
            <Plus className="w-4 h-4" />
            {t('add_employee')}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/30">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-accent/30 text-muted-foreground text-xs uppercase tracking-wider font-semibold border-b border-border/30">
                <th className="py-4 px-6">{t('table_name_email')}</th>
                <th className="py-4 px-6">{t('table_role')}</th>
                <th className="py-4 px-6">{t('table_status')}</th>
                <th className="py-4 px-6 text-right">{t('table_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 text-sm">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    {t('no_employees_registered')}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-accent/10 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-foreground">{emp.full_name || 'Tanpa Nama'}</div>
                      <div className="text-xs text-muted-foreground">{emp.email}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        emp.role === 'admin' ? 'bg-rose-500/10 text-rose-500' :
                        emp.role === 'manager' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {emp.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <button
                        type="button"
                        onClick={() => handleToggleEmployeeActive(emp)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                          emp.is_active 
                            ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' 
                            : 'bg-muted text-muted-foreground hover:bg-accent/40'
                        }`}
                      >
                        {emp.is_active ? t('status_active') : t('status_inactive')}
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEmployeeModal(emp)}
                        className="h-8 px-2"
                      >
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteEmployee(emp)}
                        className="h-8 px-2 border-rose-500/20 hover:bg-rose-500/5"
                        disabled={emp.id === user?.id}
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isEmployeeModalOpen} onOpenChange={setIsEmployeeModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border/40 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {editingEmployee ? t('edit_employee') : t('register_employee')}
            </DialogTitle>
            <DialogDescription>
              {editingEmployee 
                ? t('edit_employee_desc') 
                : t('register_employee_desc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp_email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('email_address')}</Label>
              <Input
                id="emp_email"
                type="email"
                value={employeeEmail}
                onChange={(e) => setEmployeeEmail(e.target.value)}
                placeholder="email@toko.com"
                disabled={!!editingEmployee}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('full_name')}</Label>
              <Input
                id="emp_name"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp_role" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('role_privilege')}</Label>
              <select
                id="emp_role"
                value={employeeRole}
                onChange={(e) => setEmployeeRole(e.target.value as any)}
                className="w-full flex h-10 rounded-md border border-input bg-accent/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="cashier">{t('role_cashier')}</option>
                <option value="manager">{t('role_manager')}</option>
                <option value="admin">{t('role_admin')}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp_pass" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {editingEmployee ? t('password_reset_tip') : t('password_label')}
              </Label>
              <Input
                id="emp_pass"
                type="password"
                value={employeePassword}
                onChange={(e) => setEmployeePassword(e.target.value)}
                placeholder={editingEmployee ? t('password_leave_blank') : t('password_min_tip')}
                minLength={6}
                required={!editingEmployee}
              />
            </div>

            <DialogFooter className="pt-4 border-t border-border/20">
              <Button type="button" variant="outline" onClick={() => setIsEmployeeModalOpen(false)}>
                {t('btn_cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {editingEmployee ? t('btn_save_submit') : t('btn_register_submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
