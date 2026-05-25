import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { fetchClient, ApiError } from '../api/client';
import { toast } from 'sonner';
import { 
  Store, Users, Shield, CreditCard, Plus, Trash2, Edit, Save, 
  Settings as SettingsIcon, AlertCircle, RefreshCw, Key, ShieldCheck 
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '../components/ui/dialog';

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

export default function Settings() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'store' | 'users' | 'roles' | 'saas'>('store');
  const [loading, setLoading] = useState<boolean>(false);

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

  // Initialize data based on active tab
  useEffect(() => {
    if (activeTab === 'store') {
      loadStoreSettings();
    } else if (activeTab === 'users') {
      loadEmployees();
    } else if (activeTab === 'roles') {
      loadRolesAndPermissions();
    } else if (activeTab === 'saas' && user?.is_superuser) {
      loadTenants();
    }
  }, [activeTab]);

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
      toast.error('Gagal memuat pengaturan toko.');
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
      toast.success('Pengaturan toko berhasil disimpan!');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan pengaturan toko.');
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
      toast.error('Gagal memuat daftar karyawan.');
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
        toast.success(`Data karyawan '${employeeName}' berhasil diperbarui!`);
      } else {
        // Create Mode
        if (!employeePassword) {
          toast.error('Kata sandi wajib diisi untuk karyawan baru.');
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
        toast.success(`Karyawan baru '${employeeName}' berhasil didaftarkan!`);
      }
      setIsEmployeeModalOpen(false);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menyimpan data karyawan.');
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
      toast.success(`Status keaktifan karyawan '${emp.full_name}' berhasil diubah!`);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status keaktifan.');
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus akun karyawan '${emp.full_name}'? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    try {
      await fetchClient(`/users/${emp.id}`, {
        method: 'DELETE'
      });
      toast.success(`Karyawan '${emp.full_name}' berhasil dihapus.`);
      loadEmployees();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus karyawan.');
    }
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
      toast.error('Gagal memuat data roles/permissions.');
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
      toast.error('Nama role kustom wajib diisi.');
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
        toast.success(`Kustom Role '${roleName}' berhasil diperbarui!`);
      } else {
        // Create Mode
        await fetchClient('/roles', {
          method: 'POST',
          body: JSON.stringify({
            name: roleName,
            permissions: selectedPermissions
          })
        });
        toast.success(`Kustom Role baru '${roleName}' berhasil dibuat!`);
      }
      setIsRoleModalOpen(false);
      loadRolesAndPermissions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menyimpan kustom role.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role: CustomRole) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus kustom role '${role.name}'?`)) {
      return;
    }
    try {
      await fetchClient(`/roles/${role.id}`, {
        method: 'DELETE'
      });
      toast.success(`Role '${role.name}' berhasil dihapus.`);
      loadRolesAndPermissions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus role.');
    }
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
      toast.error('Gagal memuat daftar tenant SaaS.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) {
      toast.error('Nama bisnis tenant wajib diisi.');
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

      toast.success(`Tenant '${newTenantName}' terdaftar sukses & 22 COA PSAK EMKM otomatis disalin!`);
      setIsTenantModalOpen(false);
      setNewTenantName('');
      setNewTenantSubdomain('');
      setNewTenantQuota(1000);
      loadTenants();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal mendaftarkan tenant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-6 border-b border-border/40">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary animate-spin-slow" />
            Pengaturan Toko & Hak Akses
          </h1>
          <p className="text-muted-foreground mt-2">
            Kelola profil toko, printer, manajemen karyawan, kustom roles, dan lisensi SaaS Anda.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sidebar Navigation Tabs */}
        <div className="lg:col-span-1 space-y-2">
          <button
            onClick={() => setActiveTab('store')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === 'store'
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            }`}
          >
            <Store className="w-5 h-5" />
            Profil & Printer Toko
          </button>
          
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === 'users'
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            }`}
          >
            <Users className="w-5 h-5" />
            Manajemen Karyawan
          </button>
          
          <button
            onClick={() => setActiveTab('roles')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === 'roles'
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            }`}
          >
            <Shield className="w-5 h-5" />
            Kustom Roles & Izin
          </button>

          {user?.is_superuser && (
            <button
              onClick={() => setActiveTab('saas')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold border border-primary/20 transition-all duration-300 ${
                activeTab === 'saas'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20 scale-[1.02]'
                  : 'text-violet-500 bg-violet-500/5 hover:bg-violet-500/10'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
              SaaS Admin Control
            </button>
          )}
        </div>

        {/* Right Content Panel */}
        <div className="lg:col-span-3">
          {/* loading overlay */}
          {loading && (
            <div className="flex items-center justify-center p-12 bg-card/50 rounded-2xl border border-border/40 backdrop-blur-sm">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mr-3" />
              <span className="font-semibold text-muted-foreground">Memproses data...</span>
            </div>
          )}

          {!loading && (
            <div className="transition-all duration-300">
              {/* ========================================== */}
              {/* TAB STORE CONTENT */}
              {/* ========================================== */}
              {activeTab === 'store' && (
                <Card className="p-8 border-border/40 bg-card/60 backdrop-blur-md shadow-lg shadow-black/5">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
                    <Store className="w-6 h-6 text-primary" />
                    <div>
                      <h2 className="text-xl font-bold">Profil Toko & Printer Struk</h2>
                      <p className="text-sm text-muted-foreground">Kustomisasi identitas toko untuk struk transaksi dan nota cetak.</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveStoreSettings} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="store_name" className="text-sm font-semibold">Nama Toko / UMKM</Label>
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
                        <Label htmlFor="store_phone" className="text-sm font-semibold">Nomor Telepon Toko</Label>
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
                      <Label htmlFor="store_address" className="text-sm font-semibold">Alamat Lengkap Toko</Label>
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
                      <Label className="text-sm font-semibold">Lebar Kertas Printer Thermal Struk</Label>
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
                          <span className="text-xs text-muted-foreground mt-1">Ukuran standar printer bluetooth portabel</span>
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
                          <span className="text-xs text-muted-foreground mt-1">Ukuran printer kasir meja POS desktop</span>
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40 flex justify-end">
                      <Button type="submit" className="gap-2 px-6">
                        <Save className="w-4 h-4" />
                        Simpan Perubahan
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
                        <h2 className="text-xl font-bold">Manajemen Karyawan</h2>
                        <p className="text-sm text-muted-foreground">Kelola akun karyawan kasir, manajer, atau administrator toko Anda.</p>
                      </div>
                    </div>
                    <Button onClick={() => handleOpenEmployeeModal(null)} className="gap-2 self-start md:self-auto">
                      <Plus className="w-4 h-4" />
                      Tambah Karyawan
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border/30">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-accent/30 text-muted-foreground text-xs uppercase tracking-wider font-semibold border-b border-border/30">
                          <th className="py-4 px-6">Nama & Email</th>
                          <th className="py-4 px-6">Jabatan (Role)</th>
                          <th className="py-4 px-6">Status Akun</th>
                          <th className="py-4 px-6 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20 text-sm">
                        {employees.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-muted-foreground">
                              Tidak ada karyawan terdaftar. Mulai dengan menambahkan karyawan baru.
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
                                  {emp.is_active ? 'AKTIF' : 'NONAKTIF'}
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
                        <h2 className="text-xl font-bold">Kustom Roles & Izin Izin</h2>
                        <p className="text-sm text-muted-foreground">Definisikan setelan hak akses dinamis dan kustomisasi otorisasi per-jabatan.</p>
                      </div>
                    </div>
                    <Button onClick={() => handleOpenRoleModal(null)} className="gap-2 self-start md:self-auto">
                      <Plus className="w-4 h-4" />
                      Buat Role Kustom
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {roles.length === 0 ? (
                      <div className="md:col-span-2 py-8 text-center text-muted-foreground">
                        Belum ada kustom role yang dibuat di toko Anda. Buat satu untuk membatasi akses ke menu tertentu.
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
                            Role ini terikat secara aman pada token isolasi database tenant Anda.
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              )}

              {/* ========================================== */}
              {/* TAB SAAS GLOBAL CONTROL */}
              {/* ========================================== */}
              {activeTab === 'saas' && user?.is_superuser && (
                <Card className="p-8 border-violet-500/20 bg-card/60 backdrop-blur-md shadow-lg shadow-violet-600/5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-violet-500/10 gap-4">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-6 h-6 text-violet-500" />
                      <div>
                        <h2 className="text-xl font-bold text-violet-600">SaaS Owner Control Panel</h2>
                        <p className="text-sm text-muted-foreground">Kelola pendaftaran merchant tenant baru dan kuota pemakaian OCR AI.</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => setIsTenantModalOpen(true)} 
                      className="gap-2 bg-violet-600 hover:bg-violet-700 text-white self-start md:self-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Daftarkan Tenant Baru
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-violet-500/10">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-violet-500/5 text-violet-700 text-xs uppercase tracking-wider font-semibold border-b border-violet-500/10">
                          <th className="py-4 px-6">ID & Nama Tenant (Merchant)</th>
                          <th className="py-4 px-6">Subdomain</th>
                          <th className="py-4 px-6">Kuota OCR Bulanan</th>
                          <th className="py-4 px-6">Status Lisensi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-violet-500/5 text-sm">
                        {tenants.map((t) => (
                          <tr key={t.id} className="hover:bg-violet-500/5 transition-colors">
                            <td className="py-4 px-6 font-bold text-foreground">
                              <span className="text-xs text-muted-foreground font-mono mr-2">#{t.id}</span>
                              {t.name}
                            </td>
                            <td className="py-4 px-6 font-mono text-xs text-primary">
                              {t.subdomain ? `${t.subdomain}.samkarsa.com` : 'default-routing'}
                            </td>
                            <td className="py-4 px-6 font-semibold">
                              {t.ocr_quota_monthly.toLocaleString()} lembar
                            </td>
                            <td className="py-4 px-6">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                t.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-rose-500/10 text-rose-500'
                              }`}>
                                {t.status.toUpperCase()}
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
              {editingEmployee ? 'Edit Data Karyawan' : 'Daftarkan Karyawan Baru'}
            </DialogTitle>
            <DialogDescription>
              {editingEmployee 
                ? 'Perbarui detail jabatan, nama, atau reset kata sandi karyawan.' 
                : 'Daftarkan kasir atau manajer baru. Akun akan langsung terisolasi di dalam basis data toko Anda.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp_email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alamat Email</Label>
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
              <Label htmlFor="emp_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nama Lengkap</Label>
              <Input
                id="emp_name"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp_role" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Jabatan Hak Akses</Label>
              <select
                id="emp_role"
                value={employeeRole}
                onChange={(e) => setEmployeeRole(e.target.value as any)}
                className="w-full flex h-10 rounded-md border border-input bg-accent/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="cashier">CASHIER (Staf Kasir)</option>
                <option value="manager">MANAGER (Pengelola Stok & Keuangan)</option>
                <option value="admin">ADMIN (Pemilik Toko - Akses Penuh)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp_pass" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Kata Sandi {editingEmployee && '(Isi untuk reset password)'}
              </Label>
              <Input
                id="emp_pass"
                type="password"
                value={employeePassword}
                onChange={(e) => setEmployeePassword(e.target.value)}
                placeholder={editingEmployee ? 'Biarkan kosong jika tidak ingin diubah' : 'Minimal 6 karakter'}
                minLength={6}
                required={!editingEmployee}
              />
            </div>

            <DialogFooter className="pt-4 border-t border-border/20">
              <Button type="button" variant="outline" onClick={() => setIsEmployeeModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit">
                {editingEmployee ? 'Simpan Perubahan' : 'Daftarkan Karyawan'}
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
              {editingRole ? 'Edit Kustom Role' : 'Buat Role Kustom Baru'}
            </DialogTitle>
            <DialogDescription>
              Tentukan nama jabatan kustom dan batasi fitur yang boleh diakses.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRole} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="role_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nama Role Jabatan</Label>
              <Input
                id="role_name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Contoh: Staf Gudang, Auditor Keuangan"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Pilih Hak Izin Akses (Permissions)</Label>
              
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
                Batal
              </Button>
              <Button type="submit">
                {editingRole ? 'Simpan Perubahan' : 'Buat Role'}
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
              Daftarkan Toko (Tenant) Baru
            </DialogTitle>
            <DialogDescription>
              Mendaftarkan merchant bisnis baru di sistem Blonjo SaaS. 
              Sistem akan otomatis menyalin 22 COA template standar PSAK EMKM.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRegisterTenant} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="tenant_name" className="text-xs font-bold uppercase tracking-wider text-violet-700">Nama Bisnis Toko</Label>
              <Input
                id="tenant_name"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                placeholder="Contoh: CV Elektronik Jaya"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant_sub" className="text-xs font-bold uppercase tracking-wider text-violet-700">Subdomain Toko</Label>
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
                Subdomain ini akan dihubungkan secara dinamis melalui router tunnel/reverse proxy Anda.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tenant_quota" className="text-xs font-bold uppercase tracking-wider text-violet-700">Kuota OCR AI Bulanan</Label>
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
                Batal
              </Button>
              <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white border-0">
                Daftarkan & Salin COA
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
