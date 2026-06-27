import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, ReceiptText, ShoppingCart, TrendingUp, Settings, BookOpen, PieChart, ChevronLeft, ChevronRight, ChevronDown, ChartBar, Package, Users, User, Ruler, Plus, History, Store, Shield, Mic2, Wand2, ShieldCheck, FileText, Receipt, Scale, Landmark, Wallet, GitBranch } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { useTheme } from '../theme-provider';
import { useAuthStore } from '../../store/auth';

interface NavSubItem {
  label: string;
  path: string;
  icon?: React.ComponentType<any>;
}

interface NavItem {
  icon: React.ComponentType<any>;
  label: string;
  path: string;
  subItems?: NavSubItem[];
}

export interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuthStore();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  // Dynamic Settings sub-items based on user superuser permission
  const settingsSubItems = [
    { label: 'setting_store', path: '/settings/store', icon: Store },
    { label: 'setting_users', path: '/settings/users', icon: Users },
    { label: 'setting_roles', path: '/settings/roles', icon: Shield },
    { label: 'setting_voice', path: '/settings/voice', icon: Mic2 },
    { label: 'setting_ai_training', path: '/settings/aitraining', icon: Wand2 },
  ];

  if (user?.is_superuser) {
    settingsSubItems.push({ label: 'setting_saas', path: '/settings/saas', icon: ShieldCheck });
  }

  const menuItems: NavItem[] = [
    { icon: LayoutDashboard, label: 'menu_dashboard', path: '/' },
    {
      icon: ShoppingCart,
      label: 'menu_transactions',
      path: '/transactions',
      subItems: [
        { label: 'menu_input_transaksi', path: '/transactions/input-transaksi', icon: Plus },
        { label: 'menu_daftar_input', path: '/transactions/daftar-input', icon: History }
      ]
    },
    {
      icon: PieChart,
      label: 'menu_reports',
      path: '/reports',
      subItems: [
        { label: 'menu_journal_list', path: '/reports/journals', icon: Receipt },
        { label: 'menu_profit_loss', path: '/reports/profit-loss', icon: TrendingUp },
        { label: 'menu_balance_sheet', path: '/reports/balance-sheet', icon: Scale },
        { label: 'menu_equity_changes', path: '/reports/equity-changes', icon: Landmark },
        { label: 'menu_cash_flow', path: '/reports/cash-flow', icon: Wallet }
      ]
    },
    { icon: TrendingUp, label: 'menu_insights', path: '/insights' },
    {
      icon: Settings,
      label: 'menu_settings',
      path: '/settings',
      subItems: settingsSubItems
    },
    {
      icon: ChartBar,
      label: 'menu_master_data',
      path: '/master-data',
      subItems: [
        { label: 'menu_item', path: '/master-data/item', icon: Package },
        { label: 'menu_supplier', path: '/master-data/supplier', icon: Users },
        { label: 'menu_customer', path: '/master-data/customer', icon: User },
        { label: 'menu_uom', path: '/master-data/uom', icon: Ruler },
        { label: 'menu_journal_mapping', path: '/master-data/journal-mapping', icon: GitBranch },
        { label: 'menu_coa', path: '/coa', icon: BookOpen }
      ]
    }
  ];

  // Auto expand menu based on path
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/reports')) {
      setExpandedMenus(prev => ({ ...prev, '/reports': true }));
    } else if (path.startsWith('/settings')) {
      setExpandedMenus(prev => ({ ...prev, '/settings': true }));
    } else if (path.startsWith('/transactions')) {
      setExpandedMenus(prev => ({ ...prev, '/transactions': true }));
    } else if (path.startsWith('/master-data')) {
      setExpandedMenus(prev => ({ ...prev, '/master-data': true }));
    }
  }, [location.pathname]);

  // Resolve theme secara dinamis untuk mendukung perubahan sistem OS
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      
      const listener = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  const cleanBaseUrl = import.meta.env.BASE_URL.endsWith('/') 
    ? import.meta.env.BASE_URL.slice(0, -1) 
    : import.meta.env.BASE_URL;

  const logoSrc = resolvedTheme === 'dark' 
    ? `${cleanBaseUrl}/logo_blonjo_light.png` 
    : `${cleanBaseUrl}/logo_blonjo_dark.png`;

  const logoSingleSrc = `${cleanBaseUrl}/logo-single.png`;

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    // If we click the parent item, toggle its expanded state
    setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      <aside className={cn(
        "border-r border-border bg-card flex-col relative transition-all duration-300 z-50 print:hidden",
        // Desktop
        "hidden md:flex",
        isCollapsed ? "w-[72px]" : "w-64",
        // Mobile overrides
        mobileOpen ? "fixed inset-y-0 left-0 flex w-64 shadow-2xl" : "hidden md:flex"
      )}>
        {/* Close button for mobile */}
        {mobileOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-3 z-10 md:hidden text-muted-foreground"
            onClick={onClose}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}

        {/* Desktop Collapse Toggle */}
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-3 top-5 z-10 w-6 h-6 rounded-full shadow-sm bg-background"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </Button>

        <div className={cn("h-16 flex items-center border-b border-border/50 transition-all overflow-hidden", isCollapsed ? "px-0 justify-center" : "px-4")}>
          {isCollapsed ? (
            <img src={logoSingleSrc} alt="Blonjo Logo" className="w-10 h-10 object-contain" />
          ) : (
            <img src={logoSrc} alt="Blonjo Logo" className="h-12 w-auto object-contain object-left ml-2" />
          )}
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => (
            <div key={item.path} className="space-y-1">
              <NavLink
                to={item.path}
                end
                onClick={(e) => {
                  if (item.subItems) {
                    toggleExpand(item.path, e);
                  }
                }}
                title={isCollapsed ? t(item.label) : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg text-sm font-medium transition-colors w-full justify-between",
                    isCollapsed ? "justify-center py-3" : "px-3 py-2.5",
                    isActive
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <div className="flex items-center">
                  <item.icon className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-5 h-5 mr-3")} />
                  {!isCollapsed && <span className="truncate">{t(item.label)}</span>}
                </div>
                
                {item.subItems && !isCollapsed && (
                  expandedMenus[item.path] ? (
                    <ChevronDown className="w-4 h-4 ml-2 text-muted-foreground/75" />
                  ) : (
                    <ChevronRight className="w-4 h-4 ml-2 text-muted-foreground/75" />
                  )
                )}
              </NavLink>
              
              {item.subItems && !isCollapsed && expandedMenus[item.path] && (
                <div className="pl-6 space-y-1 mt-1 transition-all duration-200 animate-in slide-in-from-top-1">
                  {item.subItems.map((subItem) => (
                    <NavLink
                      key={subItem.path}
                      to={subItem.path}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center rounded-md text-xs font-semibold py-2 px-3 transition-colors w-full",
                          isActive
                            ? "bg-primary/5 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )
                      }
                    >
                      {subItem.icon ? (
                        <subItem.icon className={cn("flex-shrink-0 w-4 h-4 mr-2")} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-current mr-2.5 opacity-60" />
                      )}
                      <span className="truncate">{t(subItem.label)}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
