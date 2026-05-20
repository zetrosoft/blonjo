import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient, ApiError } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
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
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle, RefreshCcw, Eye, Save, Trash2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface OCRTask {
  id: number;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'corrected';
  extracted_data: any | null;
  error_message: string | null;
  created_at: string;
}

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

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

  useEffect(() => {
    loadTasks();
    loadAccounts();
    const interval = setInterval(() => {
      if (tasks.some(t => t.status === 'pending' || t.status === 'processing')) {
        loadTasks();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [tasks.length]); // Fix: only re-run effect if tasks count changes or initial load

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
    setReviewData(task.extracted_data || {
      transaction_date: new Date().toISOString().split('T')[0],
      reference_no: '',
      description: '',
      total_amount: 0,
      transaction_type: 'purchase',
      items: []
    });
  };

  const handleSaveTransaction = async () => {
    if (!reviewData || !selectedTask) return;
    setSaving(true);
    try {
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

      toast.success("Transaction recorded successfully!");
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
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No recent scans found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{task.file_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className={cn("text-xs font-semibold capitalize", 
                              task.status === 'completed' || task.status === 'corrected' ? "text-emerald-500" : 
                              task.status === 'failed' ? "text-destructive" : 
                              "text-muted-foreground")}>
                              {task.status}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              disabled={task.status !== 'completed' && task.status !== 'corrected'} 
                              onClick={() => openReview(task)}
                              title="Review Data"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="text-destructive hover:bg-destructive/10" 
                              onClick={() => setTaskToDelete(task.id)}
                              title="Delete Task"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
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
                        <TableHead className="w-20 text-center">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewData.items?.length > 0 ? (
                        reviewData.items.map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="py-2">{item.name}</TableCell>
                            <TableCell className="py-2 text-center">{item.qty}</TableCell>
                            <TableCell className="py-2 text-right">{item.price?.toLocaleString()}</TableCell>
                            <TableCell className="py-2 text-right font-semibold">{item.total?.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No items extracted</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
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
