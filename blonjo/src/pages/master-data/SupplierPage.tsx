import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Users, Receipt, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn, formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface Supplier {
  id: number;
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  payment_terms: string;
  outstanding_balance: number;
  status: 'active' | 'inactive';
}

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient('/inventory/contacts?contact_type=supplier');
      if (Array.isArray(data)) {
        const mappedSuppliers: Supplier[] = data.map((supp: any) => {
          const status: Supplier['status'] = 'active';
          
          return {
            id: supp.id,
            code: `SPL-${supp.id.toString().padStart(3, '0')}`,
            name: supp.name,
            contact_person: 'Bagian Penjualan',
            phone: supp.phone || 'Tidak ada telepon',
            address: 'Alamat belum diatur',
            payment_terms: 'Cash on Delivery',
            outstanding_balance: Number(supp.current_balance),
            status,
          };
        });
        setSuppliers(mappedSuppliers);
      } else {
        throw new Error('Format data tidak didukung');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat data pemasok';
      setError(msg);
      toast.error('Error', { description: msg });
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);



  const getStatusBadge = (status: Supplier['status']) => {
    return (
      <Badge variant="outline" className={cn(
        "px-2.5 py-0.5 text-xs font-semibold",
        status === 'active' 
          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
          : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
      )}>
        {status === 'active' ? 'Aktif' : 'Nonaktif'}
      </Badge>
    );
  };

  const filteredSuppliers = suppliers.filter(supplier => 
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.contact_person.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    toast.info('Info', { description: 'Fitur Tambah Supplier baru akan diintegrasikan dengan API backend.' });
  };

  const handleEdit = (code: string) => {
    toast.info('Info', { description: `Ubah supplier ${code} akan diintegrasikan dengan API backend.` });
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Pemasok</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : suppliers.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Users className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pemasok Aktif</p>
              <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-500">
                {loading ? '-' : suppliers.filter(s => s.status === 'active').length}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Utang Dagang</p>
              <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-500">
                {loading ? '-' : formatRp(suppliers.reduce((acc, curr) => acc + curr.outstanding_balance, 0))}
              </p>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Cari pemasok, kontak person, atau kode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadSuppliers} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Pemasok
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat data pemasok...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Gagal Memuat Data</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadSuppliers} className="mt-2">Coba Lagi</Button>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Tidak ada pemasok ditemukan</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">Mulai dengan menambahkan pemasok baru.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">Kode</TableHead>
                    <TableHead>Nama Pemasok</TableHead>
                    <TableHead>Kontak Person</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead>Alamat</TableHead>
                    <TableHead>Termin</TableHead>
                    <TableHead className="text-right">Sisa Utang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                      <TableCell className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{supplier.code}</TableCell>
                      <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{supplier.name}</TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{supplier.contact_person}</TableCell>
                      <TableCell className="text-xs font-mono">{supplier.phone}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-zinc-500">{supplier.address}</TableCell>
                      <TableCell className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{supplier.payment_terms}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-rose-600 dark:text-rose-500">
                        {supplier.outstanding_balance > 0 ? formatRp(supplier.outstanding_balance) : 'Lunas'}
                      </TableCell>
                      <TableCell>{getStatusBadge(supplier.status)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(supplier.code)}
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
