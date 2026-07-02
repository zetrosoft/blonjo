import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { ModeToggle } from '../theme-toggle';
import { LanguageToggle } from '../lang-toggle';
import { LogOut, User, Menu } from 'lucide-react';
import { useTheme } from '../theme-provider';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { t } = useTranslation();
  const { theme } = useTheme();
  const location = useLocation();
  const path = location.pathname;

  // Resolve theme secara dinamis untuk mendukung perubahan sistem OS
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
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

  const getTabLabel = (tabKey: string) => {
    return t(`setting_${tabKey}`);
  };

  const renderBreadcrumb = () => {
    // Base dashboard link
    const dashboardItem = (
      <BreadcrumbItem>
        <BreadcrumbLink asChild>
          <Link to="/">{t('menu_dashboard')}</Link>
        </BreadcrumbLink>
      </BreadcrumbItem>
    );

    if (path === '/') {
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          <BreadcrumbItem>
            <BreadcrumbPage>{t('menu_dashboard')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      );
    }

    // 1. Transactions
    if (path.startsWith('/transactions')) {
      const isInput = path === '/transactions/input-transaksi';
      const isHistory = path === '/transactions/daftar-input';
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          {isInput || isHistory ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/transactions">{t('menu_transactions')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{isInput ? t('menu_input_transaksi') : t('menu_daftar_input')}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{t('menu_transactions')}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      );
    }

    // 2. Reports
    if (path.startsWith('/reports')) {
      const isJournals = path === '/reports/journals';
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          {isJournals ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/reports">{t('menu_reports')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t('menu_journal_list')}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{t('menu_reports')}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      );
    }

    // 3. Settings
    if (path.startsWith('/settings')) {
      const tabKey = path.split('/')[2];
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          {tabKey ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/settings">{t('menu_settings')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{tabKey === 'aitraining' ? t('setting_ai_training') : t(`setting_${tabKey}`)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{t('menu_settings')}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      );
    }

    // 4. Master Data
    if (path.startsWith('/master-data')) {
      const subKey = path.split('/')[2];
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          {subKey ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/master-data">{t('menu_master_data')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t(`menu_${subKey.replace(/-/g, '_')}`)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{t('menu_master_data')}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      );
    }

    // 4.5. Material Control
    if (path.startsWith('/material-control')) {
      const subKey = path.split('/')[2];
      const materialControlMap: Record<string, string> = {
        'inventory': 'menu_inventory_control',
        'purchases': 'menu_purchasing_history',
        'stock-level': 'menu_stock_level',
        'recommended': 'menu_recommended_purchase'
      };
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          {subKey ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/material-control">{t('menu_material_control')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t(materialControlMap[subKey] || `menu_${subKey.replace(/-/g, '_')}`)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{t('menu_material_control')}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      );
    }

    // 5. OCR Scan
    if (path === '/ocr-receipts') {
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t('menu_ocr')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      );
    }

    // 6. COA
    if (path === '/coa') {
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t('menu_coa')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      );
    }

    // 7. Insights
    if (path === '/insights') {
      return (
        <BreadcrumbList className="bg-transparent px-0 py-0 border-0 shadow-none">
          {dashboardItem}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t('menu_insights')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      );
    }

    // Fallback default
    return null;
  };

  const cleanBaseUrl = import.meta.env.BASE_URL.endsWith('/') 
    ? import.meta.env.BASE_URL.slice(0, -1) 
    : import.meta.env.BASE_URL;
  const logoSrc = resolvedTheme === 'dark' 
    ? `${cleanBaseUrl}/logo_blonjo_light.png` 
    : `${cleanBaseUrl}/logo_blonjo_dark.png`;

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 sticky top-0 z-10 w-full">
      <div className="flex items-center space-x-2 md:space-x-4">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 mr-2 md:hidden text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
        >
          <Menu className="w-6 h-6" />
        </button>
        <img src={logoSrc} alt="Blonjo Logo" className="h-10 w-auto object-contain object-left md:hidden" />
        
        <Breadcrumb className="hidden sm:block md:ml-2">
          {renderBreadcrumb()}
        </Breadcrumb>
      </div>
      
      <div className="flex items-center space-x-4">
        <LanguageToggle />
        <ModeToggle />
        
        <div className="h-8 w-px bg-border mx-2"></div>
        
        <div className="flex items-center space-x-3">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-medium leading-none">{user?.full_name || user?.email}</span>
            <span className="text-xs text-muted-foreground mt-1 capitalize">{user?.role}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <button 
            onClick={logout}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
            title={t('sign_out_button')}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
