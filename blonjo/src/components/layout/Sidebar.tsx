import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, ReceiptText, ShoppingCart, TrendingUp, Settings, BookOpen, PieChart } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { icon: LayoutDashboard, label: 'menu_dashboard', path: '/' },
  { icon: ShoppingCart, label: 'menu_transactions', path: '/transactions' },
  { icon: ReceiptText, label: 'menu_ocr', path: '/ocr-receipts' },
  { icon: BookOpen, label: 'menu_coa', path: '/coa' },
  { icon: PieChart, label: 'menu_reports', path: '/reports' },
  { icon: TrendingUp, label: 'menu_insights', path: '/insights' },
  { icon: Settings, label: 'menu_settings', path: '/settings' },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <h1 className="text-xl font-bold text-primary tracking-tight">Blonjo.</h1>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
            {t(item.label)}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
