import React from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function MasterDataLayout() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t('menu_master_data')}
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
          Kelola data master persediaan, pemasok, pelanggan, dan satuan barang.
        </p>
      </div>

      {/* Page Content */}
      <div className="pt-2 animate-in fade-in-50 duration-200">
        <Outlet />
      </div>
    </div>
  );
}
