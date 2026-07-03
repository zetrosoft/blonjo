import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';
import MasterDataLayout from './pages/master-data/layout';
import MaterialControlLayout from './pages/material-control/layout';

// Lazy Loaded Pages
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChartOfAccounts = lazy(() => import('./pages/ChartOfAccounts'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const LiquidDashboard = lazy(() => import('./pages/vibe/LiquidDashboard'));

// Transaction pages
const InputTransaksiPage = lazy(() => import('./pages/transaction/input-transaksi'));
const DaftarInputPage = lazy(() => import('./pages/transaction/daftar-input'));
const TransactionHub = lazy(() => import('./pages/TransactionHub'));

// Material Control pages
const InventoryControlPage = lazy(() => import('./pages/material-control/InventoryControl'));
const PurchasingHistoryPage = lazy(() => import('./pages/material-control/PurchasingHistory'));
const StockLevelPage = lazy(() => import('./pages/material-control/StockLevel'));
const RecommendedPurchasePage = lazy(() => import('./pages/material-control/RecommendedPurchase'));
const MaterialControlHub = lazy(() => import('./pages/material-control/MaterialControlHub'));

// Master data pages
const ItemPage = lazy(() => import('./pages/master-data/ItemPage'));
const MyCatalogPage = lazy(() => import('./pages/master-data/MyCatalogPage'));
const SupplierPage = lazy(() => import('./pages/master-data/SupplierPage'));
const CustomerPage = lazy(() => import('./pages/master-data/CustomerPage'));
const UomPage = lazy(() => import('./pages/master-data/UomPage'));
const JournalMappingPage = lazy(() => import('./pages/master-data/JournalMappingPage'));
const MasterDataHub = lazy(() => import('./pages/master-data/MasterDataHub'));
const PricingRulePage = lazy(() => import('./pages/master-data/PricingRulePage'));
const PriceListPage = lazy(() => import('./pages/master-data/PriceListPage'));


// Report pages
const ReportsHub = lazy(() => import('./pages/reports/ReportsHub'));
const ProfitLossReport = lazy(() => import('./pages/reports/ProfitLossReport'));
const BalanceSheetReport = lazy(() => import('./pages/reports/BalanceSheetReport'));
const EquityChangesReport = lazy(() => import('./pages/reports/EquityChangesReport'));
const CashFlowReport = lazy(() => import('./pages/reports/CashFlowReport'));

// Simple loading fallback
const PageLoader = () => (
  <div className="flex h-[60vh] w-full items-center justify-center">
    <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
  </div>
);

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/coa" element={<ChartOfAccounts />} />
            
            {/* Transactions Submenus */}
            <Route path="/transactions" element={<TransactionHub />} />
            <Route path="/transactions/input-transaksi" element={<InputTransaksiPage />} />
            <Route path="/transactions/daftar-input" element={<DaftarInputPage />} />
            
            {/* Material Control nested routes */}
            <Route path="/material-control" element={<MaterialControlLayout />}>
              <Route index element={<MaterialControlHub />} />
              <Route path="inventory" element={<InventoryControlPage />} />
              <Route path="purchases" element={<PurchasingHistoryPage />} />
              <Route path="stock-level" element={<StockLevelPage />} />
              <Route path="recommended" element={<RecommendedPurchasePage />} />
            </Route>
            
            <Route path="/reports" element={<ReportsHub />} />
            <Route path="/reports/journals" element={<Reports />} />
            <Route path="/reports/profit-loss" element={<ProfitLossReport />} />
            <Route path="/reports/balance-sheet" element={<BalanceSheetReport />} />
            <Route path="/reports/equity-changes" element={<EquityChangesReport />} />
            <Route path="/reports/cash-flow" element={<CashFlowReport />} />
            
            {/* Master Data nested routes */}
            <Route path="/master-data" element={<MasterDataLayout />}>
              <Route index element={<MasterDataHub />} />
              <Route path="item" element={<ItemPage />} />
              <Route path="supplier" element={<SupplierPage />} />
              <Route path="customer" element={<CustomerPage />} />
              <Route path="uom" element={<UomPage />} />
              <Route path="journal-mapping" element={<JournalMappingPage />} />
            </Route>

            
            <Route path="/insights" element={<div className="p-4">Insights Page</div>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:tab" element={<Settings />} />
            <Route path="/vibe" element={<LiquidDashboard />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
