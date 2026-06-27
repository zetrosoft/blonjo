import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, UserCheck, CreditCard, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface Customer {
  id: number;
  code: string;
  name: string;
  phone: string;
  tier: 'retail' | 'reseller' | 'agent';
  total_spent: number;
  receivable_balance: number; // Piutang
  status: 'active' | 'inactive';
}

export default function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient('/inventory/contacts?contact_type=customer');
      if (Array.isArray(data)) {
        const mappedCustomers: Customer[] = data.map((cust: any) => {
          const lowerName = cust.name.toLowerCase();
          let tier: Customer['tier'] = 'retail';
          if (lowerName.includes('warung')) {
            tier = 'agent';
          } else if (lowerName.includes('toko') || lowerName.includes('kantin')) {
            tier = 'reseller';
          }

          const status: Customer['status'] = 'active';

          return {
            id: cust.id,
            code: `CST-${cust.id.toString().padStart(3, '0')}`,
            name: cust.name,
            phone: cust.phone || 'Tidak ada telepon',
            tier,
            total_spent: 0, // Data total belanja tidak ada di model Contact
            receivable_balance: Number(cust.current_balance),
            status,
          };
        });
        setCustomers(mappedCustomers);
      } else {
        throw new Error('Format data tidak didukung');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat data pelanggan';
      setError(msg);
      toast.error('Error', { description: msg });
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);



  const getTierBadge = (tier: Customer['tier']) => {
    const configs = {
      agent: { label: 'Agen', class: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
      reseller: { label: 'Reseller', class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      retail: { label: 'Eceran / Retail', class: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
    };
    const conf = configs[tier];
    return (
      <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-semibold", conf.class)}>
        {conf.label}
      </Badge>
    );
  };

  const filteredCustomers = customers.filter(cust => 
    cust.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cust.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cust.phone.includes(searchQuery)
  );

  const handleAdd = () => {
    toast.info('Info', { description: 'Fitur Tambah Pelanggan baru akan diintegrasikan dengan API backend.' });
  };

  const handleEdit = (code: string) => {
    toast.info('Info', { description: `Ubah pelanggan ${code} akan diintegrasikan dengan API backend.` });
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Pelanggan</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : customers.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <UserCheck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Penjualan Kotor</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-500">
                {loading ? '-' : formatRp(customers.reduce((acc, curr) => acc + curr.total_spent, 0))}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Piutang Berjalan</p>
              <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-500">
                {loading ? '-' : formatRp(customers.reduce((acc, curr) => acc + curr.receivable_balance, 0))}
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <CreditCard className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Cari pelanggan, telepon, atau kode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadCustomers} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Pelanggan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat data pelanggan...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Gagal Memuat Data</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadCustomers} className="mt-2">Coba Lagi</Button>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <UserCheck className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Tidak ada pelanggan ditemukan</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">Mulai dengan menambahkan pelanggan baru.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">Kode</TableHead>
                    <TableHead>Nama Pelanggan</TableHead>
                    <TableHead>Kategori Tier</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead className="text-right">Total Belanja</TableHead>
                    <TableHead className="text-right">Piutang Toko</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((cust) => (
                    <TableRow key={cust.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                      <TableCell className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{cust.code}</TableCell>
                      <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{cust.name}</TableCell>
                      <TableCell>{getTierBadge(cust.tier)}</TableCell>
                      <TableCell className="text-xs font-mono">{cust.phone}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-500">{formatRp(cust.total_spent)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-500">
                        {cust.receivable_balance > 0 ? formatRp(cust.receivable_balance) : 'Lunas'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "px-2.5 py-0.5 text-xs font-semibold",
                          cust.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                            : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                        )}>
                          {cust.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(cust.code)}
                            className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => toast.error('Hapus', { description: 'Operasi destruktif memerlukan verifikasi backend API.' })}
                            className="h-8 w-8 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
