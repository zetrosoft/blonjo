import React from 'react';
import { useAuthStore } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { ModeToggle } from '../theme-toggle';
import { LanguageToggle } from '../lang-toggle';
import { LogOut, User } from 'lucide-react';

export function Header() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { t } = useTranslation();

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center">
        {/* Mobile menu button could go here */}
        <h2 className="text-lg font-semibold md:hidden text-primary">Blonjo</h2>
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
