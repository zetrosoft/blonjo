import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient } from '../api/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { BookOpen, List, FolderTree, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_active: boolean;
  parent_id?: number | null;
}

// Virtual node for grouping by type in Tree View
interface TreeNode {
  id: string | number;
  code?: string;
  name: string;
  type: string;
  isGroup: boolean;
  isActive?: boolean;
  children: TreeNode[];
}

export default function ChartOfAccounts() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'group-asset': true,
    'group-liability': true,
    'group-equity': true,
    'group-revenue': true,
    'group-expense': true,
  });

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const data = await fetchClient('/finance/accounts');
        setAccounts(data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch accounts');
      } finally {
        setLoading(false);
      }
    };
    loadAccounts();
  }, []);

  const getAccountTypeBadge = (type: string) => {
    const typeStyles: Record<string, string> = {
      asset: 'bg-emerald-500/10 text-emerald-500',
      liability: 'bg-rose-500/10 text-rose-500',
      equity: 'bg-blue-500/10 text-blue-500',
      revenue: 'bg-violet-500/10 text-violet-500',
      expense: 'bg-orange-500/10 text-orange-500',
    };
    return (
      <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold capitalize", typeStyles[type] || 'bg-muted text-muted-foreground')}>
        {type}
      </span>
    );
  };

  // Build tree data. 
  // Since standard seed data doesn't have parent_ids, we group them virtually by account_type first.
  const buildTree = (): TreeNode[] => {
    const groups: Record<string, TreeNode> = {
      asset: { id: 'group-asset', name: 'Assets (Harta)', type: 'asset', isGroup: true, children: [] },
      liability: { id: 'group-liability', name: 'Liabilities (Kewajiban)', type: 'liability', isGroup: true, children: [] },
      equity: { id: 'group-equity', name: 'Equity (Modal)', type: 'equity', isGroup: true, children: [] },
      revenue: { id: 'group-revenue', name: 'Revenue (Pendapatan)', type: 'revenue', isGroup: true, children: [] },
      expense: { id: 'group-expense', name: 'Expenses (Beban)', type: 'expense', isGroup: true, children: [] },
    };

    const nodeMap = new Map<number, TreeNode>();
    
    // Convert accounts to TreeNodes
    accounts.forEach(acc => {
      nodeMap.set(acc.id, {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.account_type,
        isGroup: false,
        isActive: acc.is_active,
        children: []
      });
    });

    // Attach to parents or virtual groups
    accounts.forEach(acc => {
      const node = nodeMap.get(acc.id)!;
      if (acc.parent_id && nodeMap.has(acc.parent_id)) {
        nodeMap.get(acc.parent_id)!.children.push(node);
      } else {
        // No parent, attach to type group
        if (groups[acc.account_type]) {
          groups[acc.account_type].children.push(node);
        }
      }
    });

    // Only return groups that have children to keep it clean
    return Object.values(groups).filter(g => g.children.length > 0);
  };

  const toggleNode = (nodeId: string | number) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedNodes[node.id];
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.id} className="w-full">
          <div 
            className={cn(
              "flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent",
              node.isGroup ? "bg-muted/30 border-border/50 mb-2 mt-4" : "border-b border-border/30",
              depth > 0 && !node.isGroup && "ml-8"
            )}
          >
            <div className="flex items-center space-x-3">
              {hasChildren ? (
                <button onClick={() => toggleNode(node.id)} className="p-1 rounded-md hover:bg-accent text-muted-foreground transition-colors">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <div className="w-6" /> // Placeholder for alignment
              )}
              
              <div className="flex flex-col">
                <div className="flex items-center space-x-2">
                  <span className={cn("font-semibold", node.isGroup ? "text-primary text-base" : "text-card-foreground text-sm")}>
                    {node.code && <span className="mr-2 text-muted-foreground font-mono">{node.code}</span>}
                    {node.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {!node.isGroup && node.type && getAccountTypeBadge(node.type)}
              {!node.isGroup && (
                <div className="w-16 text-center">
                  {node.isActive ? (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                  ) : (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted"></span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {hasChildren && isExpanded && (
            <div className="flex flex-col w-full">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('menu_coa')}</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Master data for Double-Entry Accounting</p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center p-1 bg-muted/50 border border-border/50 rounded-lg">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              viewMode === 'list' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="w-4 h-4 mr-2" />
            List
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={cn(
              "flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              viewMode === 'tree' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FolderTree className="w-4 h-4 mr-2" />
            Tree
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm font-medium rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
          Loading accounts...
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-xl shadow-sm p-1">
          {viewMode === 'list' ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="w-[150px]">Type</TableHead>
                  <TableHead className="w-[100px] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => (
                    <TableRow key={acc.id} className="border-border/50">
                      <TableCell className="font-semibold text-primary">{acc.code}</TableCell>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell>{getAccountTypeBadge(acc.account_type)}</TableCell>
                      <TableCell className="text-center">
                        {acc.is_active ? (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                        ) : (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted"></span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4 flex flex-col">
              {accounts.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  No accounts found.
                </div>
              ) : (
                renderTree(buildTree())
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}