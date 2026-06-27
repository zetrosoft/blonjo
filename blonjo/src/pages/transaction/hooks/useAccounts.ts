import { useState, useEffect } from 'react';
import { fetchClient } from '../../../api/client';
import type { Account } from '../types';

/**
 * useAccounts — Fetch Chart of Accounts (COA) sekali saat mount.
 * Dipakai bersama oleh SmartNote dan ManualEntry.
 */
export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchClient('/finance/accounts');
        if (!cancelled) setAccounts(data);
      } catch (err) {
        console.error('[useAccounts] Failed to load COA:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { accounts, loading };
}
