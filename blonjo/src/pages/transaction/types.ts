import { ParsedTransaction } from '../../lib/smartParser';

// ── Daftar Input types ───────────────────────────────────────────────
export interface TransactionEntry {
  id: number;
  account_id: number;
  debit: number;
  credit: number;
  account?: {
    name: string;
    code: string;
    account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  };
}

export interface InventoryLog {
  id: number;
  product_id: number;
  quantity: number;
  price_per_unit: number;
  log_type: 'in' | 'out';
  product?: { name: string; unit: string };
  contact?: { name: string; contact_type: string };
}

export interface Transaction {
  id: number;
  transaction_date: string;
  reference_no: string | null;
  description: string;
  transaction_type: string;
  total_amount: number;
  status: 'draft' | 'posted';
  created_at: string;
  entries: TransactionEntry[];
  inventory_logs: InventoryLog[];
}

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

export interface JournalEntry {
  account_id: string;
  debit: number;
  credit: number;
  // Bab 10.1: Enrichment data for display
  account?: {
    id: number;
    code: string;
    name: string;
  };
}

export type InputMode = 'smart' | 'voice' | 'manual';

export interface SmartNoteProps {
  noteText: string;
  setNoteText: (val: string) => void;
  isParsing: boolean;
  isUploading: boolean;
  parsedResult: ParsedTransaction | null;
  onParse: () => void;
  onVoiceTranscript: (text: string, isInterim: boolean) => void;
  onReset: () => void;
  onLoadExample: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoCaptured?: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenConfirm: () => void;
  saving: boolean;
  updateParsed: (updates: Partial<ParsedTransaction>) => void;
}

export interface ManualEntryProps {
  accounts: Account[];
  loading: boolean;
  saving: boolean;
  date: string;
  setDate: (val: string) => void;
  refNo: string;
  setRefNo: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  type: string;
  setType: (val: string) => void;
  entries: JournalEntry[];
  setEntries: (val: JournalEntry[]) => void;
  onSubmit: () => void;
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
}
