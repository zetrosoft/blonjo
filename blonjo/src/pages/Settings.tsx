import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useTranslation } from 'react-i18next';
import { fetchClient, ApiError } from '../api/client';
import { toast } from 'sonner';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import { 
  Store, Users, Shield, CreditCard, Plus, Trash2, Edit, Save, 
  Settings as SettingsIcon, AlertCircle, RefreshCw, Key, ShieldCheck, ArrowRight, Wand2, Upload
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { VoiceRule, defaultVoiceRules, sanitizeVoiceRules } from '../lib/voiceRules';
import { Mic2 } from 'lucide-react';

// TS Interfaces
interface Employee {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'manager' | 'cashier';
  preferred_language: string;
  is_active: boolean;
}

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

interface Tenant {
  id: number;
  name: string;
  subdomain: string | null;
  status: string;
  ocr_quota_monthly: number;
  created_at: string;
}

interface AppSetting {
  id: number;
  key: string;
  value: string;
  description: string | null;
}

import AITrainingSettings from './settings/AITrainingSettings';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const activeTab = tab as 'store' | 'users' | 'roles' | 'saas' | 'voice' | 'aitraining' | undefined;
  const [loading, setLoading] = useState<boolean>(false);

  // === State Tab Voice Rules ===
  const [voiceRules, setVoiceRules] = useState<VoiceRule[]>([]);
  const [isVoiceRuleModalOpen, setIsVoiceRuleModalOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleReplacement, setNewRuleReplacement] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');

  // === State Tab Store ===
  const [storeName, setStoreName] = useState<string>('');
  const [storeAddress, setStoreAddress] = useState<string>('');
  const [storePhone, setStorePhone] = useState<string>('');
  const [printerWidth, setPrinterWidth] = useState<'58mm' | '80mm'>('58mm');

  // === State Tab Users ===
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeRole, setEmployeeRole] = useState<'admin' | 'manager' | 'cashier'>('cashier');
  const [employeePassword, setEmployeePassword] = useState('');

  // === State Tab Roles ===
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [masterPermissions, setMasterPermissions] = useState<Permission[]>([]);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // === State Tab SaaS Tenants ===
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSubdomain, setNewTenantSubdomain] = useState('');
  const [newTenantQuota, setNewTenantQuota] = useState<number>(1000);

  // === State Tab AI Training ===
  const [trainingTemplates, setTrainingTemplates] = useState<any[]>([]);
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [trainingFileName, setTrainingFileName] = useState('');
  const [trainingRawText, setTrainingRawText] = useState('');
  const [trainingExpectedJson, setTrainingExpectedJson] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const trainingFileRef = React.useRef<HTMLInputElement>(null);

  // === State Global Confirmation ===
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {}
  });

  const confirmAction = (title: string, description: string, onConfirm: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      onConfirm
    });
  };

  // Initialize data based on active tab
  useEffect(() => {
    if (activeTab === 'store') {
      loadStoreSettings();
    } else if (activeTab === 'users') {
      loadEmployees();
    } else if (activeTab === 'roles') {
      loadRoles();
      loadMasterPermissions();
    } else if (activeTab === 'saas' && user?.role === 'superadmin') {
      loadTenants();
    } else if (activeTab === 'voice') {
      loadVoiceRules();
    } else if (activeTab === 'aitraining') {
      loadTrainingTemplates();
    }
    }, [activeTab]);

    const loadTrainingTemplates = async () => {
    try {
      const data = await fetchClient('/ocr/training-templates');
      setTrainingTemplates(data);
    } catch (error) {
      console.error(error);
    }
    };
  // ==========================================
  // TAB VOICE RULES LOGIC
  // ==========================================
  const loadVoiceRules = async () => {
    setLoading(true);
    try {
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
  };

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
    setIsVoiceRuleModalOpen(true);
  };

  const handleSaveSingleVoiceRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern || !newRuleReplacement) return;
    
    // Save as standard global regex string when serialized, or just the string pattern
    const rule: VoiceRule = {
      pattern: newRulePattern,
      replacement: newRuleReplacement,
      description: newRuleDesc
    };

    let newRules = [...voiceRules];
    if (editingRuleIndex !== null) {
      newRules[editingRuleIndex] = rule;
    } else {
      newRules.push(rule);
    }
    
    setIsVoiceRuleModalOpen(false);
    handleSaveVoiceRules(newRules);
  };

  const handleDeleteVoiceRule = (index: number) => {
    confirmAction(
      t('confirm_title_delete_filter'),
      t('confirm_desc_delete_filter'),
      () => {
        const newRules = voiceRules.filter((_, i) => i !== index);
        handleSaveVoiceRules(newRules);
      }
    );
  };

  const resetVoiceRules = () => {
    confirmAction(
      t('confirm_title_reset_filter'),
      t('confirm_desc_reset_filter'),
      () => {
        handleSaveVoiceRules(defaultVoiceRules);
      }
    );
  };

  // ==========================================
  // TAB AI TRAINING LOGIC
  // ==========================================
  const handleTrainingFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await fetchClient('/ocr/training-templates/extract-raw', {
        method: 'POST',
        body: formData
      });
      setTrainingFileName(result.file_name);
      setTrainingRawText(result.raw_text);
      setTrainingExpectedJson('{\n  "transaction": {\n    "date": "YYYY-MM-DD",\n    "invoice_number": ""\n  },\n  "merchant": {\n    "brand_name": "",\n    "address": ""\n  },\n  "summary": {\n    "grand_total": 0\n  },\n  "transaction_type": "purchase",\n  "items": [\n    {\n      "product_name": "Nama Barang",\n      "quantity": 1,\n      "unit_price": 0,\n      "subtotal": 0\n    }\n  ]\n}');
    } catch (error: any) {
      toast.error(t('toast_err_extract_failed'), { description: error.message });
    } finally {
      setIsExtracting(false);
      if (trainingFileRef.current) trainingFileRef.current.value = '';
    }
  };

  const handleSaveTrainingTemplate = async () => {
    if (!trainingRawText || !trainingExpectedJson) {
      toast.error(t('toast_err_json_required'));
      return;
    }
    
    // Validasi JSON ringan
    try {
      JSON.parse(trainingExpectedJson);
    } catch (e) {
      toast.error(t('toast_err_json_invalid'));
      return;
    }

    try {
      await fetchClient('/ocr/training-templates', {
        method: 'POST',
        body: JSON.stringify({
          file_name: trainingFileName,
          raw_ocr_text: trainingRawText,
          expected_output: trainingExpectedJson
        })
      });
      toast.success(t('toast_success_save_template'));
      setIsTrainingModalOpen(false);
      loadTrainingTemplates();
    } catch (error: any) {
      toast.error(t('toast_err_save_template'), { description: error.message });
    }
  };

  const handleDeleteTrainingTemplate = async (id: number) => {
    try {
      await fetchClient(`/ocr/training-templates/${id}`, { method: 'DELETE' });
      toast.success(t('toast_success_delete_template'));
      loadTrainingTemplates();
    } catch (error: any) {
      toast.error(t('toast_err_delete_template'), { description: error.message });
    }
  };

  // ==========================================
  // TAB STORE LOGIC
  // ==========================================
  const loadStoreSettings = async () => {
    setLoading(true);
    try {
      const data: AppSetting[] = await fetchClient('/settings');
      // Map key-values
      data.forEach(item => {
        if (item.key === 'store_name') setStoreName(item.value);
        if (item.key === 'store_address') setStoreAddress(item.value);
        if (item.key === 'store_phone') setStorePhone(item.value);
        if (item.key === 'printer_paper_width') setPrinterWidth(item.value as '58mm' | '80mm');
      });
    } catch (err: any) {
      console.error(err);
      toast.error(t('toast_err_load_store'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const settingsToSave = [
        { key: 'store_name', value: storeName, description: 'Nama Toko' },
        { key: 'store_address', value: storeAddress, description: 'Alamat Toko' },
        { key: 'store_phone', value: storePhone, description: 'Nomor Telepon Toko' },
        { key: 'printer_paper_width', value: printerWidth, description: 'Lebar Kertas Struk Printer Thermal' }
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

  // ==========================================
  // TAB EMPLOYEES LOGIC
  // ==========================================
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
      setEmployeePassword(''); // Jangan tampilkan password lama
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
        // Edit Mode
        const updateData: any = {
          full_name: employeeName,
          role: employeeRole
        };
        if (employeePassword.trim()) {
          updateData.password = employeePassword;
        }
        await fetchClient(`/users/${editingEmployee.id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData)
        });
        toast.success(t('toast_success_update_employee', { name: employeeName }));
      } else {
        // Create Mode
        if (!employeePassword) {
          toast.error(t('toast_err_password_required'));
          setLoading(false);
          return;
        }
        await fetchClient('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: employeeEmail,
            full_name: employeeName,
            role: employeeRole,
            password: employeePassword,
            preferred_language: 'ID'
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
        method: 'PUT',
        body: JSON.stringify({
          is_active: !emp.is_active
        })
      });
      toast.success(t('toast_success_toggle_employee', { name: emp.full_name || emp.email }));
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast_err_toggle_employee'));
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    confirmAction(
      t('confirm_title_delete_user'),
      t('confirm_desc_delete_user', { name: emp.full_name || emp.email }),
      async () => {
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
      }
    );
  };

  // ==========================================
  // TAB ROLES & PERMISSIONS LOGIC
  // ==========================================
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
    if (!roleName.trim()) {
      toast.error(t('toast_err_role_name_required'));
      return;
    }
    setLoading(true);
    try {
      if (editingRole) {
        // Edit Mode
        await fetchClient(`/roles/${editingRole.id}`, {
          method: 'PUT',
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
    confirmAction(
      t('confirm_title_delete_role'),
      t('confirm_desc_delete_role', { name: role.name }),
      async () => {
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
      }
    );
  };

  // ==========================================
  // TAB SAAS TENANTS LOGIC
  // ==========================================
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

  const getTabLabel = (tKey: string) => {
    return t(`setting_${tKey}`);
  };

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-border/40 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary animate-spin-slow" />
            {tab ? getTabLabel(tab) : t('settings_title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {tab 
              ? t('settings_subtitle_tab', { tab: getTabLabel(tab).toLowerCase() })
              : t('settings_subtitle_main')
            }
          </p>
        </div>
      </div>

      <div className="w-full">
        {/* Right Content Panel - Full Width */}
        <div className="w-full">
          {/* loading overlay */}
          {loading && (
            <div className="flex items-center justify-center p-12 bg-card/50 rounded-2xl border border-border/40 backdrop-blur-sm">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mr-3" />
              <span className="font-semibold text-muted-foreground">Memproses data...</span>
            </div>
          )}

          {!loading && (
            <div className="transition-all duration-300">
              
              {/* Settings Introduction Page */}
              {!activeTab && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Hero Banner */}
                  <div className="relative overflow-hidden rounded-2xl border border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-zinc-500/5 dark:to-zinc-500/10 p-8 shadow-inner">
                    <div className="max-w-2xl space-y-4">
                      <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        {t('settings_control_center')}
                      </span>
                      <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                        {t('settings_hero_title')}
                      </h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {t('settings_hero_desc')}
                      </p>
                    </div>
                    <div className="absolute right-0 bottom-0 w-48 h-48 bg-primary/10 rounded-full filter blur-3xl pointer-events-none" />
                  </div>

                  {/* Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Profil Toko */}
                    <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/store')}>
                      <CardHeader className="space-y-2 pb-2">
                        <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                          <Store className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-md font-bold mt-2">{t('settings_hub_store_title')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {t('settings_hub_store_desc')}
                        </p>
                        <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                          <span>{t('setting_store_btn')}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardContent>
                    </Card>

                    {/* 2. Manajemen Karyawan */}
                    <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/users')}>
                      <CardHeader className="space-y-2 pb-2">
                        <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                          <Users className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-md font-bold mt-2">{t('settings_hub_users_title')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {t('settings_hub_users_desc')}
                        </p>
                        <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                          <span>{t('setting_users_btn')}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardContent>
                    </Card>

                    {/* 3. Kustom Roles */}
                    <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/roles')}>
                      <CardHeader className="space-y-2 pb-2">
                        <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                          <Shield className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-md font-bold mt-2">{t('settings_hub_roles_title')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {t('settings_hub_roles_desc')}
                        </p>
                        <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                          <span>{t('setting_roles_btn')}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardContent>
                    </Card>

                    {/* 4. Voice AI Customization */}
                    <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/voice')}>
                      <CardHeader className="space-y-2 pb-2">
                        <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                          <Mic2 className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-md font-bold mt-2">{t('settings_hub_voice_title')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {t('settings_hub_voice_desc')}
                        </p>
                        <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                          <span>{t('setting_voice_btn')}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardContent>
                    </Card>

                    {/* 6. AI Training */}
                    <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer" onClick={() => navigate('/settings/aitraining')}>
                      <CardHeader className="space-y-2 pb-2">
                        <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl">
                          <Wand2 className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-md font-bold mt-2">{t('setting_ai_training')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {t('ai_training_desc')}
                        </p>
                        <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-zinc-200 dark:border-zinc-800 mt-4 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                          <span>{t('setting_ai_training')}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardContent>
                    </Card>

                    {/* 5. SaaS Admin Control (Only for superuser) */}
                    {user?.is_superuser && (
                      <Card className="border-violet-200/80 dark:border-violet-900/40 bg-card hover:shadow-md transition-all duration-300 flex flex-col group cursor-pointer col-span-1 md:col-span-2" onClick={() => navigate('/settings/saas')}>
                        <CardHeader className="space-y-2 pb-2">
                          <div className="p-3 bg-violet-500/10 text-violet-500 w-fit rounded-xl">
                            <ShieldCheck className="w-6 h-6" />
                          </div>
                          <CardTitle className="text-md font-bold mt-2 text-violet-700 dark:text-violet-400">{t('settings_hub_saas_title')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            {t('settings_hub_saas_desc')}
                          </p>
                          <Button variant="ghost" className="w-full flex items-center justify-between text-xs font-bold border border-violet-200 dark:border-violet-900/40 text-violet-600 hover:bg-violet-600 hover:text-white mt-4 transition-all">
                            <span>{t('setting_saas_btn')}</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              )}

              {/* ========================================== */}
              {/* TAB VOICE RULES CONTENT */}
              {/* ========================================== */}
              {activeTab === 'voice' && (
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
                                  <Button variant="ghost" size="icon" onClick={() => openVoiceRuleModal(idx)} className="h-8 w-8 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteVoiceRule(idx)} className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600">
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
              )}

              {/* ========================================== */}
              {/* TAB STORE CONTENT */}
              {/* ========================================== */}
              {activeTab === 'store' && (
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
                      <Button type="submit" className="gap-2 px-6">
                        <Save className="w-4 h-4" />
                        {t('save_changes')}
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              {/* ========================================== */}
              {/* TAB EMPLOYEES CONTENT */}
              {/* ========================================== */}
              {activeTab === 'users' && (
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
              )}

              {/* ========================================== */}
              {/* TAB ROLES & PERMISSIONS CONTENT */}
              {/* ========================================== */}
              {activeTab === 'roles' && (
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
              )}

              {/* ========================================== */}
              {/* TAB AI TRAINING CONTENT (REFACTORED) */}
              {/* ========================================== */}
              {activeTab === 'aitraining' && <AITrainingSettings />}

              {/* ========================================== */}
              {/* TAB SAAS GLOBAL CONTROL */}
              {/* ========================================== */}
              {activeTab === 'saas' && user?.is_superuser && (
                <Card className="p-8 border-violet-500/20 bg-card/60 backdrop-blur-md shadow-lg shadow-violet-600/5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-violet-500/10 gap-4">
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
                        <tr className="bg-violet-500/5 text-violet-700 text-xs uppercase tracking-wider font-semibold border-b border-violet-500/10">
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
                              {tenant.ocr_quota_monthly.toLocaleString()} {t('pages_unit')}
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* DIALOG / MODAL FOR NEW/EDIT EMPLOYEE */}
      {/* ========================================== */}
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
              <Button type="submit">
                {editingEmployee ? t('btn_save_submit') : t('btn_register_submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG / MODAL FOR NEW/EDIT CUSTOM ROLE */}
      {/* ========================================== */}
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
              <Button type="submit">
                {editingRole ? t('btn_save_submit') : t('btn_create_role')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG / MODAL FOR NEW/EDIT VOICE RULE */}
      {/* ========================================== */}
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

      {/* ========================================== */}
      {/* DIALOG / MODAL FOR NEW TENANT (SAAS CONTROL) */}
      {/* ========================================== */}
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
              <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white border-0">
                {t('btn_register_copy_coa')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* GLOBAL ALERT DIALOG (CONFIRMATION) */}
      {/* ========================================== */}
      <AlertDialog open={confirmDialog.isOpen} onOpenChange={(isOpen) => setConfirmDialog(prev => ({ ...prev, isOpen }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDialog.onConfirm}>{t('btn_confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
