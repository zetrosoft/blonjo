import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TerminalLogs } from '../TerminalLogs';

export default function DashboardLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isChatPage = location.pathname.startsWith('/insights/sajen-intelligence') || location.pathname.startsWith('/insights/vibes-chat');

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden w-full max-w-[100vw]">
      <Sidebar 
        mobileOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full h-full">
        <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
        <main className={`flex-1 min-w-0 w-full ${isChatPage ? 'h-[calc(100vh-4rem)] overflow-hidden p-2 md:p-3' : 'overflow-y-auto overflow-x-hidden p-4 md:p-6 md:pt-5'}`}>
          <Outlet />
        </main>
      </div>
      <TerminalLogs />
    </div>
  );
}
