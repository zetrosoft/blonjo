import { create } from 'zustand';
import { fetchClient } from '@/api/client';

interface AccountingState {
  summary: any | null;
  transactions: any[];
  accounts: any[];
  isLoading: boolean;
  
  // Actions
  fetchSummary: () => Promise<void>;
  fetchTransactions: (skip?: number, limit?: number) => Promise<void>;
  fetchAccounts: () => Promise<void>;
  
  // Refresh all (Universal Sync)
  refreshAll: () => Promise<void>;
}

export const useAccountingStore = create<AccountingState>((set, get) => ({
  summary: null,
  transactions: [],
  accounts: [],
  isLoading: false,

  fetchSummary: async () => {
    set({ isLoading: true });
    try {
      const data = await fetchClient('/finance/dashboard/summary');
      set({ summary: data });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTransactions: async (skip = 0, limit = 50) => {
    set({ isLoading: true });
    try {
      const data = await fetchClient(`/finance/transactions?skip=${skip}&limit=${limit}`);
      set({ transactions: data });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchAccounts: async () => {
    set({ isLoading: true });
    try {
      const data = await fetchClient('/finance/accounts');
      set({ accounts: data });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshAll: async () => {
    await Promise.all([
      get().fetchSummary(),
      get().fetchTransactions(),
      get().fetchAccounts()
    ]);
  }
}));
