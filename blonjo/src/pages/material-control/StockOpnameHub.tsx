import React, { useState, useEffect } from 'react';
import {
  FileText, Upload, CheckCircle2, AlertTriangle, RefreshCw, Calculator,
  Layers, PackageCheck, HelpCircle, ArrowRight, Save, Database, Sparkles, FileSpreadsheet, History as HistoryIcon, FileEdit
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';

interface ParsedOpnameItem {
  alias_input: string;
  product_id: number | null;
  official_item_name: string;
  category_name: string;
  match_score: number;
  physical_qty: number;
  system_qty: number;
  variance_qty: number;
  unit: string;
  harga_beli: number;
  total_harga: number;
  variance_amount: number;
}

interface OpnameParseResponse {
  tanggal_opname: string;
  total_items: number;
  items: ParsedOpnameItem[];
}

interface MasterProductAutocompleteProps {
  currentName: string;
  matchScore: number;
  categoryName: string;
  onSelectProduct: (product: any) => void;
}

function MasterProductAutocomplete({ currentName, matchScore, categoryName, onSelectProduct }: MasterProductAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(currentName);
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(currentName);
  }, [currentName]);

  const searchProducts = async (term: string) => {
    if (!term || term.trim().length < 1) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchClient(`/inventory/products?search=${encodeURIComponent(term.trim())}&limit=15`);
      setOptions(res || []);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-w-[210px]">
      <input
        type="text"
        value={query}
        onFocus={() => {
          setIsOpen(true);
          searchProducts(query);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          searchProducts(e.target.value);
          setIsOpen(true);
        }}
        className="w-full p-1.5 text-xs font-semibold border rounded-lg bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500"
        placeholder="Cari Master DB Produk..."
      />
      <div className="text-[10px] text-slate-400 mt-0.5 flex justify-between">
        <span>Match: {Math.round(matchScore * 100)}%</span>
        <span>{categoryName}</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-xs">
          {loading && <div className="p-2 text-slate-400 text-center text-[11px]">Mencari produk...</div>}
          {!loading && options.length === 0 && (
            <div className="p-2 text-slate-400 text-center text-[11px]">Tidak ada produk cocok</div>
          )}
          {!loading && options.map((prod) => (
            <div
              key={prod.id}
              onClick={() => {
                onSelectProduct(prod);
                setQuery(prod.name);
                setIsOpen(false);
              }}
              className="px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer flex justify-between items-center border-b border-slate-100 dark:border-slate-800/50 last:border-0"
            >
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-100">{prod.name}</div>
                <div className="text-[10px] text-slate-400">SKU: {prod.sku} | Unit: {prod.base_unit}</div>
              </div>
              <div className="text-right text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                Rp {(prod.purchase_price || 0).toLocaleString('id-ID')}
              </div>
            </div>
          ))}
          <div className="p-1 border-t border-slate-100 dark:border-slate-800 text-right">
            <button
              onClick={() => setIsOpen(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold px-2 py-0.5"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockOpnameHub() {
  const [activeTab, setActiveTab] = useState<'smartnote' | 'excel' | 'history'>('smartnote');
  const [isMaintenanceStock, setIsMaintenanceStock] = useState<boolean>(false);
  const [loadingTenant, setLoadingTenant] = useState<boolean>(true);

  // SmartNote State
  const [smartnoteContent, setSmartnoteContent] = useState<string>('');
  const [parsing, setParsing] = useState<boolean>(false);

  // Excel Upload State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // History State
  const [historySessions, setHistorySessions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Result & Reconciliation State
  const [opnameResult, setOpnameResult] = useState<OpnameParseResponse | null>(null);
  const [editableItems, setEditableItems] = useState<ParsedOpnameItem[]>([]);
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [reconciliationNotes, setReconciliationNotes] = useState<string>('');

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetchClient('/inventory/stock-opname/history');
      setHistorySessions(res || []);
    } catch {
      setHistorySessions([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // 1. Fetch Maintenance Stock Mode
  useEffect(() => {
    async function fetchTenantMode() {
      try {
        const res = await fetchClient('/settings/maintenance-stock');
        setIsMaintenanceStock(res?.maintenance_stock ?? false);
      } catch {
        setIsMaintenanceStock(false);
      } finally {
        setLoadingTenant(false);
      }
    }
    fetchTenantMode();
  }, []);

  // 2. Parse SmartNote Input
  const handleParseSmartnote = async () => {
    if (!smartnoteContent.trim()) {
      toast.error('Silakan ketik data SmartNote opname terlebih dahulu.');
      return;
    }
    setParsing(true);
    try {
      const res = await fetchClient('/inventory/stock-opname/smartnote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: smartnoteContent })
      });
      setOpnameResult(res);
      setEditableItems(res?.items || []);
      toast.success(`Berhasil Parse SmartNote: Terbaca ${res?.total_items || 0} barang.`);
    } catch (err: any) {
      toast.error(err.message || 'Gagal Parse SmartNote');
    } finally {
      setParsing(false);
    }
  };

  // 3. Upload & Parse Excel File
  const handleUploadExcel = async () => {
    if (!excelFile) {
      toast.error('Silakan pilih file Excel (.xlsx / .csv) terlebih dahulu.');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', excelFile);

    try {
      const token = localStorage.getItem('token');
      const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
      const response = await fetch(`${apiBase}/inventory/stock-opname/upload-xls`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Gagal memproses file Excel.');
      }
      const data: OpnameParseResponse = await response.json();
      setOpnameResult(data);
      setEditableItems(data.items || []);
      toast.success(`Berhasil Parse Excel: Terbaca ${data.total_items} barang opname.`);
    } catch (err: any) {
      toast.error(err.message || 'Gagal Upload Excel');
    } finally {
      setUploading(false);
    }
  };

  // Update item physically in editable table
  const handleItemChange = (index: number, field: keyof ParsedOpnameItem, value: any) => {
    const updated = [...editableItems];
    const target = { ...updated[index] };

    if (field === 'physical_qty') {
      const numVal = parseFloat(value) || 0;
      target.physical_qty = numVal;
      target.variance_qty = roundToTwo(numVal - target.system_qty);
      target.total_harga = roundToTwo(numVal * target.harga_beli);
      target.variance_amount = roundToTwo(target.variance_qty * target.harga_beli);
    } else if (field === 'harga_beli') {
      const numPrice = parseFloat(value) || 0;
      target.harga_beli = numPrice;
      target.total_harga = roundToTwo(target.physical_qty * numPrice);
      target.variance_amount = roundToTwo(target.variance_qty * numPrice);
    } else if (field === 'unit') {
      target.unit = value;
    }

    updated[index] = target;
    setEditableItems(updated);
  };

  const roundToTwo = (num: number) => Math.round(num * 100) / 100;

  // 4. Apply Final Manual Confirmation
  const handleApplyReconciliation = async () => {
    if (editableItems.length === 0) {
      toast.error('Tidak ada item opname yang siap direkonsiliasi.');
      return;
    }

    const confirmMsg = !isMaintenanceStock
      ? 'Perhatian: Mode Non-Tracked Stock aktif. Rekonsiliasi ini akan MENOLKAN seluruh produk di toko yang tidak tercantum dalam daftar opname ini! Lanjutkan?'
      : 'Apakah Anda yakin ingin mengeksekusi rekonsiliasi stok ini? Perubahan stok dan penyesuaian akan langsung dicatat di database.';

    if (!window.confirm(confirmMsg)) return;

    setReconciling(true);
    try {
      const payload = {
        opname_data: editableItems,
        notes: reconciliationNotes || `Stock Opname Tanggal ${opnameResult?.tanggal_opname || new Date().toISOString()}`
      };
      const res = await fetchClient('/inventory/reconciliation/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      toast.success(res?.message || `Rekonsiliasi stok ${res?.updated_products_count || 0} produk berhasil dieksekusi.`);
      // Reset state after success
      setOpnameResult(null);
      setEditableItems([]);
    } catch (err: any) {
      toast.error(err.message || 'Gagal Rekonsiliasi Stok');
    } finally {
      setReconciling(false);
    }
  };

  const handleSelectProduct = (index: number, selectedProd: any) => {
    const updated = [...editableItems];
    const target = { ...updated[index] };

    target.product_id = selectedProd.id;
    target.official_item_name = selectedProd.name;
    target.category_name = selectedProd.category_name || 'Umum';
    target.match_score = 1.0;
    
    if (selectedProd.purchase_price && parseFloat(selectedProd.purchase_price) > 0) {
      target.harga_beli = parseFloat(selectedProd.purchase_price);
      target.total_harga = roundToTwo(target.physical_qty * target.harga_beli);
      target.variance_amount = roundToTwo(target.variance_qty * target.harga_beli);
    }
    if (selectedProd.current_stock !== undefined) {
      target.system_qty = parseFloat(selectedProd.current_stock) || 0;
      target.variance_qty = roundToTwo(target.physical_qty - target.system_qty);
      target.variance_amount = roundToTwo(target.variance_qty * target.harga_beli);
    }

    updated[index] = target;
    setEditableItems(updated);
  };

  const grandTotalPhysicalRp = editableItems.reduce((sum, item) => sum + item.total_harga, 0);
  const totalVarianceAmountRp = editableItems.reduce((sum, item) => sum + item.variance_amount, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PackageCheck className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Stock Opname & Rekonsiliasi Hub
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Input hasil opname fisik via SmartNote Teks atau File Excel, cocokkan alias produk, dan eksekusi penyesuaian stok.
          </p>
        </div>

        {/* Tenant Mode Badge */}
        {!loadingTenant && (
          <div className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border shadow-sm ${
            !isMaintenanceStock 
              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
          }`}>
            <Database className="w-4 h-4" />
            <span>Mode: {!isMaintenanceStock ? 'Non-Tracked Stock (Reset-Zero First Recount)' : 'Tracked Unit Stock (Editable Variance)'}</span>
          </div>
        )}
      </div>

      {/* Input Section Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-6">
          <button
            onClick={() => setActiveTab('smartnote')}
            className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'smartnote'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            SmartNote Text Input
          </button>
          <button
            onClick={() => setActiveTab('excel')}
            className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'excel'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Upload File Excel (.xlsx / .csv)
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <HistoryIcon className="w-4 h-4" />
            Riwayat & Audit Log Opname
          </button>
        </div>

        {/* Tab 1: SmartNote */}
        {activeTab === 'smartnote' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Teks SmartNote / Tabel Opname Fisik:
              </label>
              <textarea
                value={smartnoteContent}
                onChange={(e) => setSmartnoteContent(e.target.value)}
                rows={7}
                className="w-full p-4 rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ketik daftar barang opname..."
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Minimal kolom: Alias Item Name, Qty, Unit. Sistem otomatis mencocokkan alias ke Master DB & membaca harga beli terakhir.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleParseSmartnote}
                disabled={parsing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 shadow-md shadow-indigo-500/20"
              >
                {parsing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Parse & Cocokkan SmartNote
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: Upload Excel File */}
        {activeTab === 'excel' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center bg-slate-50/50 dark:bg-slate-950/50 hover:bg-indigo-50/30 transition-colors">
              <Upload className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Pilih atau Geser File Excel (.xlsx, .xls, .csv)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Format kolom otomatis diselaraskan (Item/Alias Name, Qty, Unit, Harga Beli)
              </p>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                className="mt-4 block mx-auto text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-300 hover:file:bg-indigo-100"
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleUploadExcel}
                disabled={uploading || !excelFile}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 shadow-md shadow-indigo-500/20"
              >
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Unggah & Proses File Excel
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: History & Audit Log */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <HistoryIcon className="w-4 h-4 text-indigo-500" />
                Daftar Sesi Rekonsiliasi Opname Historis
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHistory}
                className="text-xs gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                Segarkan Data
              </Button>
            </div>

            {loadingHistory ? (
              <div className="p-8 text-center text-xs text-slate-400">Memuat riwayat opname...</div>
            ) : historySessions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                Belum ada riwayat sesi opname yang dikonfirmasi.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-800 font-bold uppercase text-[11px] text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="p-3">ID Sesi</th>
                      <th className="p-3">Tanggal Opname</th>
                      <th className="p-3 text-center">Jumlah Barang</th>
                      <th className="p-3 text-right">Total Nilai Fisik</th>
                      <th className="p-3 text-right">Total Selisih Rp</th>
                      <th className="p-3">Catatan</th>
                      <th className="p-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {historySessions.map((session) => (
                      <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">#{session.id}</td>
                        <td className="p-3 font-semibold">{session.opname_date}</td>
                        <td className="p-3 text-center font-bold">{session.total_items} barang</td>
                        <td className="p-3 text-right font-mono">Rp {(session.total_physical_amount || 0).toLocaleString('id-ID')}</td>
                        <td className={`p-3 text-right font-mono font-bold ${
                          session.total_variance_amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          Rp {(session.total_variance_amount || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">{session.notes || '-'}</td>
                        <td className="p-3 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setOpnameResult({
                                tanggal_opname: session.opname_date,
                                total_items: session.total_items,
                                items: session.items || []
                              });
                              setEditableItems(session.items || []);
                              toast.success(`Sesi Opname #${session.id} dimuat ke Tabel Review & Edit.`);
                            }}
                            className="text-[11px] gap-1 px-2.5 py-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            Buka & Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editable Reconciliation Table Section */}
      {editableItems.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Tabel Perbandingan & Rekonsiliasi (Editable Mode)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tanggal Opname: {opnameResult?.tanggal_opname} | Total {editableItems.length} Item Terdeteksi
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                Total Fisik: <strong>Rp {grandTotalPhysicalRp.toLocaleString('id-ID')}</strong>
              </div>
              <div className={`px-3 py-1.5 rounded-xl border ${
                totalVarianceAmountRp < 0 
                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
              }`}>
                Selisih Nominal: <strong>Rp {totalVarianceAmountRp.toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>

          {/* Interactive Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Alias Input</th>
                  <th className="p-3">Master Produk DB (Editable Autocomplete)</th>
                  <th className="p-3 text-center">Qty Fisik</th>
                  <th className="p-3 text-center">Stok Sistem</th>
                  <th className="p-3 text-center">Selisih (+/-)</th>
                  <th className="p-3">Satuan</th>
                  <th className="p-3 text-right">Harga Beli (HPP)</th>
                  <th className="p-3 text-right">Total Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                {editableItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3">{idx + 1}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{item.alias_input}</td>
                    <td className="p-3">
                      <MasterProductAutocomplete
                        currentName={item.official_item_name}
                        matchScore={item.match_score}
                        categoryName={item.category_name}
                        onSelectProduct={(prod) => handleSelectProduct(idx, prod)}
                      />
                    </td>

                    {/* Editable Physical Qty */}
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={item.physical_qty}
                        onChange={(e) => handleItemChange(idx, 'physical_qty', e.target.value)}
                        className="w-20 p-1 text-center font-bold border rounded-lg bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>

                    <td className="p-3 text-center font-semibold text-slate-500">{item.system_qty}</td>

                    {/* Variance Qty Badge */}
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                        item.variance_qty > 0
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : item.variance_qty < 0
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {item.variance_qty > 0 ? `+${item.variance_qty}` : item.variance_qty}
                      </span>
                    </td>

                    {/* Unit */}
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-16 p-1 text-center border rounded-lg bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                      />
                    </td>

                    {/* Editable Purchase Price */}
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        value={item.harga_beli}
                        onChange={(e) => handleItemChange(idx, 'harga_beli', e.target.value)}
                        className="w-28 p-1 text-right font-mono border rounded-lg bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                      />
                    </td>

                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      Rp {item.total_harga.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes & Confirm Actions */}
          <div className="flex flex-col md:flex-row items-end justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="w-full md:w-1/2 space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Catatan Rekonsiliasi (Opsional):</label>
              <input
                type="text"
                placeholder="misal: Opname bulanan September 2026 oleh Staff Kasir"
                value={reconciliationNotes}
                onChange={(e) => setReconciliationNotes(e.target.value)}
                className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <Button
              onClick={handleApplyReconciliation}
              disabled={reconciling}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 px-6 py-3 shadow-lg shadow-emerald-500/20"
            >
              {reconciling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Konfirmasi & Eksekusi Rekonsiliasi Stok
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
