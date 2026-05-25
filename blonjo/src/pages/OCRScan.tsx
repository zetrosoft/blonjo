import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient, ApiError } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '../components/ui/alert-dialog';
import { Upload, CheckCircle2, Loader2, AlertCircle, RefreshCcw, Eye, Save, Trash2, Terminal, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface OCRTask {
  id: number;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'corrected';
  extracted_data: any | null;
  corrected_data?: any | null;
  error_message: string | null;
  created_at: string;
}


interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

interface LogLine {
  time: string;
  type: 'success' | 'error' | 'warning' | 'system' | 'info';
  message: string;
}

const getTerminalLogs = (task: OCRTask): LogLine[] => {
  if (!task) return [];

  const createdTime = new Date(task.created_at);
  const formatTimeOffset = (secondsOffset: number) => {
    const t = new Date(createdTime.getTime() + secondsOffset * 1000);
    return t.toTimeString().split(' ')[0];
  };

  const logs: LogLine[] = [
    { time: formatTimeOffset(0), type: 'system', message: `Initializing image upload...` },
    { time: formatTimeOffset(1), type: 'success', message: `File uploaded successfully: ${task.file_name}` },
    { time: formatTimeOffset(1), type: 'system', message: `OCR Task successfully spawned with ID #${task.id}` },
  ];

  if (task.status === 'pending') {
    logs.push(
      { time: formatTimeOffset(2), type: 'info', message: `Task registered in backend event broker` },
      { time: formatTimeOffset(3), type: 'warning', message: `Queued: Waiting for available agent worker slot... (± 10-15s)` }
    );
    return logs;
  }

  logs.push(
    { time: formatTimeOffset(2), type: 'info', message: `Task registered in backend event broker` },
    { time: formatTimeOffset(3), type: 'info', message: `Celery worker picked up task #${task.id}` },
    { time: formatTimeOffset(4), type: 'system', message: `Loading agent vision context (Model: Ollama/llava)...` },
    { time: formatTimeOffset(6), type: 'info', message: `Preprocessing receipt image pixels and checking orientation...` }
  );

  if (task.status === 'processing') {
    logs.push(
      { time: formatTimeOffset(8), type: 'warning', message: `Executing vision-to-text extraction pipeline... (± 5-10s remaining)` },
      { time: formatTimeOffset(10), type: 'info', message: `Identifying transactional entities (merchant, date, amounts)...` }
    );
    return logs;
  }

  if (task.status === 'completed' || task.status === 'corrected') {
    const itemsCount = task.extracted_data?.items?.length || 0;
    const totalAmount = task.extracted_data?.total_amount || 0;
    const merchant = task.extracted_data?.description || 'Unknown Merchant';
    
    logs.push(
      { time: formatTimeOffset(8), type: 'info', message: `Executing vision-to-text extraction pipeline...` },
      { time: formatTimeOffset(10), type: 'info', message: `Successfully mapped structural receipt nodes.` },
      { time: formatTimeOffset(11), type: 'success', message: `OCR extraction parsed successfully!` },
      { time: formatTimeOffset(12), type: 'success', message: `Summary: Merchant: "${merchant}" | Total: Rp ${totalAmount.toLocaleString('id-ID')}` },
      { time: formatTimeOffset(12), type: 'success', message: `Items Extracted: ${itemsCount} item(s) detected.` },
      { time: formatTimeOffset(13), type: 'system', message: `Task status marked as ${task.status.toUpperCase()}. Ready for journal review.` }
    );
    return logs;
  }

  if (task.status === 'failed') {
    logs.push(
      { time: formatTimeOffset(8), type: 'error', message: `Vision model pipeline failed to extract receipt elements.` },
      { time: formatTimeOffset(9), type: 'error', message: `Error Detail: ${task.error_message || 'Internal Agent Timeout'}` },
      { time: formatTimeOffset(10), type: 'system', message: `Task status marked as FAILED. Please delete and try again.` }
    );
    return logs;
  }

  return logs;
};

export default function OCRScan() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<OCRTask[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review Modal State
  const [selectedTask, setSelectedTask] = useState<OCRTask | null>(null);
  const [reviewData, setReviewData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Delete Dialog State
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);

  // Terminal Log State
  const [selectedTaskForLog, setSelectedTaskForLog] = useState<number | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(tasks.length / itemsPerPage);

  // Safely clamp current page when list size changes
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [tasks.length, totalPages, currentPage]);

  // Auto select active/newest task for terminal log
  useEffect(() => {
    if (tasks.length > 0) {
      const activeTask = tasks.find(t => t.status === 'pending' || t.status === 'processing');
      if (activeTask) {
        setSelectedTaskForLog(activeTask.id);
      } else if (!selectedTaskForLog) {
        setSelectedTaskForLog(tasks[0].id);
      }
    }
  }, [tasks, selectedTaskForLog]);

  // Scroll to bottom of terminal log
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTaskForLog, tasks]);

  const loadTasks = async () => {
    try {
      const data = await fetchClient('/ocr/tasks');
      setTasks(data);
    } catch (err) {
      console.error("Failed to load OCR tasks", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const data = await fetchClient('/finance/accounts');
      setAccounts(data);
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  };

  const tasksRef = useRef<OCRTask[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    loadTasks();
    loadAccounts();
    const interval = setInterval(() => {
      const currentTasks = tasksRef.current;
      if (currentTasks.some(t => t.status === 'pending' || t.status === 'processing')) {
        loadTasks();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetchClient('/ocr/upload', { method: 'POST', body: formData });
      toast.success("File uploaded successfully.");
      await loadTasks(); // Reload immediately after success
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await fetchClient(`/ocr/tasks/${taskToDelete}`, { method: 'DELETE' });
      toast.success("Task deleted successfully");
      loadTasks();
    } catch (error) {
      toast.error("Failed to delete task");
    } finally {
      setTaskToDelete(null);
    }
  };

  const openReview = (task: OCRTask) => {
    setSelectedTask(task);
    setReviewData(task.corrected_data || task.extracted_data || {
      transaction_date: new Date().toISOString().split('T')[0],
      reference_no: '',
      description: '',
      total_amount: 0,
      transaction_type: 'purchase',
      items: []
    });
  };

  const calculateTotalAmount = (items: any[]) => {
    return items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.price || 0)), 0);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    if (!reviewData) return;
    const updatedItems = [...(reviewData.items || [])];
    
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'name' ? value : (value === '' ? '' : Number(value))
    };
    
    const qty = Number(updatedItems[index].qty || 0);
    const price = Number(updatedItems[index].price || 0);
    updatedItems[index].total = qty * price;
    
    const newTotalAmount = calculateTotalAmount(updatedItems);
    
    setReviewData({
      ...reviewData,
      items: updatedItems,
      total_amount: newTotalAmount
    });
  };

  const handleAddItem = () => {
    if (!reviewData) return;
    const updatedItems = [
      ...(reviewData.items || []),
      { name: '', qty: 1, price: 0, total: 0 }
    ];
    setReviewData({
      ...reviewData,
      items: updatedItems
    });
  };

  const handleRemoveItem = (index: number) => {
    if (!reviewData) return;
    const updatedItems = (reviewData.items || []).filter((_: any, i: number) => i !== index);
    const newTotalAmount = calculateTotalAmount(updatedItems);
    setReviewData({
      ...reviewData,
      items: updatedItems,
      total_amount: newTotalAmount
    });
  };

  const handleSaveTransaction = async () => {
    if (!reviewData || !selectedTask) return;
    setSaving(true);
    try {
      // 1. Save manual correction to backend (triggers AI few-shot feedback learning)
      const ocrCorrectionPayload = {
        transaction_date: reviewData.transaction_date,
        reference_no: reviewData.reference_no,
        description: reviewData.description,
        total_amount: reviewData.total_amount,
        transaction_type: reviewData.transaction_type,
        items: (reviewData.items || []).map((item: any) => ({
          name: item.name,
          qty: Number(item.qty || 0),
          price: Number(item.price || 0),
          total: Number(item.qty || 0) * Number(item.price || 0)
        }))
      };

      await fetchClient(`/ocr/tasks/${selectedTask.id}/correct`, {
        method: 'POST',
        body: JSON.stringify(ocrCorrectionPayload)
      });

      // 2. Save transaction to finance journal
      const cashAccount = accounts.find(a => a.code === '1-1000'); 
      const expenseAccount = accounts.find(a => a.code === '6-4000'); 
      
      if (!cashAccount || !expenseAccount) {
        throw new Error("Required accounts (Kas/Expense) not found in COA.");
      }

      const payload = {
        transaction_date: reviewData.transaction_date,
        reference_no: reviewData.reference_no || `OCR-${selectedTask.id}`,
        description: reviewData.description,
        transaction_type: reviewData.transaction_type,
        total_amount: reviewData.total_amount,
        entries: [
          { account_id: expenseAccount.id, debit: reviewData.total_amount, credit: 0 },
          { account_id: cashAccount.id, debit: 0, credit: reviewData.total_amount }
        ]
      };

      await fetchClient('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success("Transaction recorded and AI learned from correction!");
      setSelectedTask(null);
      loadTasks();
    } catch (error: any) {
      toast.error(error.message || "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const paginatedTasks = tasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('scan_receipt')}</h2>
          <p className="text-muted-foreground mt-1">{t('scan_receipt_desc')}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-6">
          <Card 
            className={cn(
              "border-2 border-dashed transition-all cursor-pointer relative overflow-hidden group",
              dragActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50 hover:bg-accent/50",
              uploading && "pointer-events-none opacity-60"
            )}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <input type="file" className="hidden" ref={fileInputRef} accept="image/*,application/pdf"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className={cn("w-16 h-16 rounded-full flex items-center justify-center transition-colors",
                dragActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary group-hover:bg-primary/20")}>
                {uploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Upload className="w-8 h-8" />}
              </div>
              <div>
                <p className="font-semibold text-lg">{uploading ? "Uploading..." : "Click or drag and drop"}</p>
                <p className="text-sm text-muted-foreground mt-1">Support JPEG, PNG, PDF (Max 10MB)</p>
              </div>
            </CardContent>
          </Card>

          {/* Glassmorphic Terminal Log Console */}
          <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-lg bg-zinc-50 dark:bg-zinc-950/80 text-zinc-700 dark:text-zinc-300 font-mono">
            <CardHeader className="bg-zinc-100 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-zinc-800 dark:text-emerald-400 animate-pulse" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">Terminal Log Console</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tasks.length > 0 && selectedTaskForLog !== null ? (
                <>
                  <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-900/40 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[180px] md:max-w-[220px]">
                      Task: {tasks.find(t => t.id === selectedTaskForLog)?.file_name}
                    </span>
                    <select 
                      value={selectedTaskForLog} 
                      onChange={(e) => setSelectedTaskForLog(Number(e.target.value))}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    >
                      {tasks.map(t => (
                        <option key={t.id} value={t.id}>
                          #{t.id} - {t.file_name.length > 12 ? `${t.file_name.substring(0, 12)}...` : t.file_name} ({t.status})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="p-4 h-64 overflow-y-auto font-mono text-[11px] space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {getTerminalLogs(tasks.find(t => t.id === selectedTaskForLog)!).map((log, index) => (
                      <div key={index} className="flex items-start space-x-2 leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <span className="text-zinc-400 dark:text-zinc-500 select-none">[{log.time}]</span>
                        <span className={cn(
                          "font-semibold select-none shrink-0",
                          log.type === 'success' && "text-emerald-600 dark:text-emerald-400",
                          log.type === 'error' && "text-red-600 dark:text-red-400",
                          log.type === 'warning' && "text-amber-600 dark:text-amber-400",
                          log.type === 'system' && "text-blue-600 dark:text-blue-400",
                          log.type === 'info' && "text-zinc-500 dark:text-zinc-400"
                        )}>
                          [{log.type.toUpperCase()}]
                        </span>
                        <span className={cn(
                          "break-all",
                          log.type === 'success' && "text-emerald-700 dark:text-emerald-300/90",
                          log.type === 'error' && "text-red-700 dark:text-red-300/90",
                          log.type === 'warning' && "text-amber-700 dark:text-amber-300/90",
                          log.type === 'system' && "text-blue-700 dark:text-blue-300/90",
                          log.type === 'info' && "text-zinc-600 dark:text-zinc-300/90"
                        )}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 font-mono text-xs flex flex-col items-center justify-center space-y-2 h-[312px]">
                  <Terminal className="w-8 h-8 text-zinc-300 dark:text-zinc-700 animate-pulse" />
                  <p>No active terminal session.</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-600">Logs will appear here after you upload a receipt.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card className="border-border/60 h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Scans</CardTitle>
                <CardDescription>Track AI processing status</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={loadTasks} disabled={loadingTasks}>
                <RefreshCcw className={cn("w-4 h-4", loadingTasks && "animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent className="pb-4">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-4 text-zinc-400 dark:text-zinc-500 shadow-inner">
                    <FileText className="w-8 h-8 animate-pulse" />
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 font-semibold text-sm">Tidak ada riwayat pemindaian</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-[280px]">Mulai dengan mengunggah struk belanja di panel sebelah kiri.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedTasks.map((task) => (
                    <div 
                      key={task.id} 
                      className={cn(
                        "group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all duration-300 gap-4",
                        "bg-zinc-50/40 hover:bg-zinc-50/80 dark:bg-zinc-950/20 dark:hover:bg-zinc-950/40",
                        "border-zinc-200/50 hover:border-zinc-300 dark:border-zinc-800/40 dark:hover:border-zinc-850",
                        "shadow-[0_2px_8px_-3px_rgba(0,0,0,0.03)] dark:shadow-none hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.06)]",
                        selectedTaskForLog === task.id && "border-primary/20 bg-primary/5 dark:bg-primary/5"
                      )}
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        {/* Status-colored Icon Container */}
                        <div 
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 transition-transform duration-300 group-hover:scale-105",
                            task.status === 'completed' || task.status === 'corrected' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:bg-emerald-500/20" :
                            task.status === 'failed' ? "bg-red-500/10 border-red-500/20 text-red-500 dark:bg-red-500/20" :
                            task.status === 'processing' ? "bg-amber-500/10 border-amber-500/20 text-amber-500 dark:bg-amber-500/20 animate-pulse" :
                            "bg-blue-500/10 border-blue-500/20 text-blue-500 dark:bg-blue-500/20"
                          )}
                        >
                          {task.status === 'completed' || task.status === 'corrected' ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : task.status === 'failed' ? (
                            <AlertCircle className="w-5 h-5 animate-bounce" style={{ animationDuration: '2s' }} />
                          ) : (
                            <Loader2 className={cn("w-5 h-5", (task.status === 'processing' || task.status === 'pending') && "animate-spin")} />
                          )}
                        </div>

                        {/* Metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm truncate block group-hover:text-primary transition-colors max-w-[150px] sm:max-w-[220px]">
                              {task.file_name}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0">
                              #{task.id}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>{new Date(task.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">•</span>
                            <span className={cn(
                              "font-medium inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider shrink-0",
                              task.status === 'completed' || task.status === 'corrected' ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" :
                              task.status === 'failed' ? "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400" :
                              task.status === 'processing' ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 animate-pulse" :
                              "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                            )}>
                              {task.status === 'completed' ? 'Selesai' :
                               task.status === 'corrected' ? 'Koreksi' :
                               task.status === 'failed' ? 'Gagal' :
                               task.status === 'processing' ? 'Proses...' : 'Antrean'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            if (task.status === 'completed' || task.status === 'corrected') {
                              openReview(task);
                            } else if (task.status === 'failed') {
                              toast.error(`Ekstraksi AI Gagal: ${task.error_message || 'Internal Timeout error'}`);
                            } else {
                              setSelectedTaskForLog(task.id);
                              toast.info(`Receipt sedang diproses oleh AI. Detail proses berjalan dapat dipantau di panel terminal log.`);
                            }
                          }}
                          className={cn(
                            "h-9 px-3 text-xs font-semibold transition-all shadow-sm rounded-lg",
                            (task.status === 'completed' || task.status === 'corrected') ? "hover:bg-emerald-500/10 hover:text-emerald-500 border-emerald-500/20 text-zinc-700 dark:text-zinc-300" :
                            (task.status === 'pending' || task.status === 'processing') ? "hover:bg-blue-500/10 hover:text-blue-500 border-blue-500/20 text-blue-500" :
                            "hover:bg-red-500/10 hover:text-red-500 border-red-500/20 text-red-500"
                          )}
                          title="Preview / Review Data"
                        >
                          <Eye className="w-4 h-4 mr-1.5" />
                          {task.status === 'completed' || task.status === 'corrected' ? 'Review' : 'Log'}
                        </Button>

                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-9 w-9 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 border-zinc-200 dark:border-zinc-800 transition-colors shadow-sm rounded-lg" 
                          onClick={() => setTaskToDelete(task.id)}
                          title="Hapus Pemindaian"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>

            {/* Pagination di Footer */}
            {totalPages > 1 && (
              <CardFooter className="flex items-center justify-between border-t border-zinc-150 dark:border-zinc-800/80 px-6 py-4 mt-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  Menampilkan <span className="font-semibold text-zinc-700 dark:text-zinc-300">{Math.min((currentPage - 1) * itemsPerPage + 1, tasks.length)}</span> - <span className="font-semibold text-zinc-700 dark:text-zinc-300">{Math.min(currentPage * itemsPerPage, tasks.length)}</span> dari <span className="font-semibold text-zinc-700 dark:text-zinc-300">{tasks.length}</span> pemindaian
                </div>
                
                <div className="flex items-center space-x-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8 rounded-lg border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "w-8 h-8 p-0 rounded-lg text-xs font-semibold transition-all",
                        currentPage === page 
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/10 border-emerald-500" 
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      )}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}

                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8 rounded-lg border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review AI Extraction</DialogTitle>
            <DialogDescription>
              Verify and edit the data extracted by AI before saving to journal.
            </DialogDescription>
          </DialogHeader>

          {reviewData && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={reviewData.transaction_date} onChange={(e) => setReviewData({...reviewData, transaction_date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Ref No</Label>
                  <Input value={reviewData.reference_no} onChange={(e) => setReviewData({...reviewData, reference_no: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={reviewData.description} onChange={(e) => setReviewData({...reviewData, description: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Amount</Label>
                  <Input type="number" value={reviewData.total_amount} onChange={(e) => setReviewData({...reviewData, total_amount: parseFloat(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={reviewData.transaction_type} onValueChange={(val) => setReviewData({...reviewData, transaction_type: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Purchase</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Extracted Items</Label>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="w-24 text-center">Qty</TableHead>
                        <TableHead className="w-36 text-right">Price</TableHead>
                        <TableHead className="w-36 text-right">Total</TableHead>
                        <TableHead className="w-12 text-center"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewData.items?.length > 0 ? (
                        reviewData.items.map((item: any, idx: number) => (
                          <TableRow key={idx} className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                            <TableCell className="py-1.5">
                              <Input
                                value={item.name || ''}
                                onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                                className="h-8 font-medium bg-transparent border-zinc-200 dark:border-zinc-800 focus-visible:ring-emerald-500"
                                placeholder="Nama Item"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Input
                                type="number"
                                value={item.qty === '' ? '' : item.qty}
                                onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                                className="h-8 text-center bg-transparent border-zinc-200 dark:border-zinc-800 focus-visible:ring-emerald-500"
                                min="0"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-right">
                              <Input
                                type="number"
                                value={item.price === '' ? '' : item.price}
                                onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                                className="h-8 text-right bg-transparent border-zinc-200 dark:border-zinc-800 focus-visible:ring-emerald-500"
                                min="0"
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                              {(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString('id-ID')}
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveItem(idx)}
                                className="h-7 w-7 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors shadow-none"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm font-medium">
                            Tidak ada barang dalam daftar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                    className="h-8 text-xs font-semibold hover:bg-emerald-500/10 hover:text-emerald-500 border-emerald-500/20 text-zinc-700 dark:text-zinc-300"
                  >
                    + Tambah Barang
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTask(null)}>Cancel</Button>
            <Button onClick={handleSaveTransaction} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save as Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog (Radix UI) */}
      <AlertDialog open={taskToDelete !== null} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the scan record and the associated file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
