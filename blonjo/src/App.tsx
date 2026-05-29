import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './components/layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import ChartOfAccounts from './pages/ChartOfAccounts';
import OCRScan from './pages/OCRScan';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import Reports from './pages/Reports';

// New transaction pages
import InputTransaksiPage from './pages/transaction/input-transaksi';
import DaftarInputPage from './pages/transaction/daftar-input';
import TransactionHub from './pages/TransactionHub';

// New master data pages
import MasterDataLayout from './pages/master-data/layout';
import ItemPage from './pages/master-data/ItemPage';
import SupplierPage from './pages/master-data/SupplierPage';
import CustomerPage from './pages/master-data/CustomerPage';
import UomPage from './pages/master-data/UomPage';
import MasterDataHub from './pages/master-data/MasterDataHub';

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
          
          {/* Transactions Submenus */}
          <Route path="/transactions" element={<TransactionHub />} />
          <Route path="/transactions/input-transaksi" element={<InputTransaksiPage />} />
          <Route path="/transactions/daftar-input" element={<DaftarInputPage />} />
          
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/journals" element={<Reports />} />
          
          {/* Master Data nested routes */}
          <Route path="/master-data" element={<MasterDataLayout />}>
            <Route index element={<MasterDataHub />} />
            <Route path="item" element={<ItemPage />} />
            <Route path="supplier" element={<SupplierPage />} />
            <Route path="customer" element={<CustomerPage />} />
            <Route path="uom" element={<UomPage />} />
          </Route>
          
          <Route path="/insights" element={<div className="p-4">Insights Page</div>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:tab" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
