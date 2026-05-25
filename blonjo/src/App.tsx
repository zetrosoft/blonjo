import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './components/layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import ChartOfAccounts from './pages/ChartOfAccounts';
import OCRScan from './pages/OCRScan';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/coa" element={<ChartOfAccounts />} />
          <Route path="/ocr-receipts" element={<OCRScan />} />
          <Route path="/transactions" element={<Transactions />} />
          {/* Future routes will go here */}
          <Route path="/insights" element={<div className="p-4">Insights Page</div>} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
