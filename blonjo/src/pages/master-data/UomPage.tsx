import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Edit2, Trash2, Ruler, ClipboardList, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { fetchClient } from '../../api/client';

interface Uom {
  id: string | number;
  code: string;
  name: string;
  category: 'weight' | 'volume' | 'count' | 'length';
  description: string;
  status: 'active' | 'inactive';
}

const DEFAULT_UOMS: Uom[] = [
  { id: 'def-1', code: 'pcs', name: 'Pieces / Biji', category: 'count', description: 'Satuan hitung barang eceran satuan tunggal', status: 'active' },
  { id: 'def-2', code: 'kg', name: 'Kilogram', category: 'weight', description: 'Satuan standar untuk berat/massa sembako', status: 'active' },
  { id: 'def-3', code: 'ltr', name: 'Liter', category: 'volume', description: 'Satuan volume zat cair seperti minyak goreng', status: 'active' },
  { id: 'def-4', code: 'box', name: 'Kotak / Dus', category: 'count', description: 'Satuan kemasan karton/dus isi banyak', status: 'active' },
];

export default function UomPage() {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadUoms = async () => {
    setLoading(true);
    setError(null);
    try {
      const products = await fetchClient('/inventory/products');
      if (Array.isArray(products)) {
        // Ekstrak unit unik dari produk
        const uniqueUnits = Array.from(new Set(products.map((p: any) => p.unit))).filter(Boolean);
        
        // Map ke format Uom
        const mappedUoms: Uom[] = uniqueUnits.map((unit: any, index: number) => {
          const lowerUnit = unit.toLowerCase();
          let category: Uom['category'] = 'count';
          if (['kg', 'gr', 'gram'].includes(lowerUnit)) category = 'weight';
          if (['ltr', 'ml', 'liter'].includes(lowerUnit)) category = 'volume';
          if (['m', 'cm'].includes(lowerUnit)) category = 'length';

          return {
            id: `api-${index}`,
            code: unit,
            name: unit.toUpperCase(),
            category,
            description: `Satuan resmi dari database produk`,
            status: 'active'
          };
        });

        // Gabungkan dengan default jika belum ada
        const finalUoms = [...mappedUoms];
        DEFAULT_UOMS.forEach(def => {
          if (!finalUoms.some(u => u.code.toLowerCase() === def.code.toLowerCase())) {
            finalUoms.push(def);
          }
        });

        setUoms(finalUoms);
      } else {
        throw new Error('Format data tidak didukung');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal memuat data satuan';
      setError(msg);
      toast.error('Error', { description: msg });
      setUoms([]); // JANGAN FALLBACK KE MOCK!
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUoms();
  }, []);

  const getCategoryBadge = (category: Uom['category']) => {
    const configs = {
      weight: { label: 'Berat', class: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      volume: { label: 'Volume', class: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
      count: { label: 'Jumlah / Kuantitas', class: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      length: { label: 'Panjang', class: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
    };
    const conf = configs[category];
    return (
      <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-semibold", conf.class)}>
        {conf.label}
      </Badge>
    );
  };

  const filteredUoms = uoms.filter(uom => 
    uom.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    uom.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    uom.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    toast.info('Info', { description: 'Fitur Tambah Satuan (UoM) baru akan diintegrasikan dengan API backend.' });
  };

  const handleEdit = (code: string) => {
    toast.info('Info', { description: `Ubah satuan ${code} akan diintegrasikan dengan API backend.` });
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Satuan (UoM)</p>
              <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                {loading ? '-' : uoms.length}
              </p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Ruler className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/60 dark:border-zinc-800/60 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Kategori Satuan</p>
              <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-500">
                {loading ? '-' : `${new Set(uoms.map(u => u.category)).size} Kategori`}
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <ClipboardList className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* UoM Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Cari kode satuan, nama, atau deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={loadUoms} disabled={loading} className="h-9 w-9">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={handleAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Satuan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat data satuan...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Gagal Memuat Data</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">{error}</p>
              <Button variant="outline" onClick={loadUoms} className="mt-2">Coba Lagi</Button>
            </div>
          ) : filteredUoms.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Ruler className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">Tidak ada satuan ditemukan</h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">Satuan akan muncul otomatis dari produk terdaftar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">Kode</TableHead>
                    <TableHead>Nama Satuan</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUoms.map((uom) => (
                    <TableRow key={uom.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                      <TableCell className="font-mono text-xs font-bold text-primary">{uom.code}</TableCell>
                      <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{uom.name}</TableCell>
                      <TableCell>{getCategoryBadge(uom.category)}</TableCell>
                      <TableCell className="text-xs text-zinc-500 max-w-xs truncate">{uom.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "px-2.5 py-0.5 text-xs font-semibold",
                          uom.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                            : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                        )}>
                          {uom.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(uom.code)}
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
