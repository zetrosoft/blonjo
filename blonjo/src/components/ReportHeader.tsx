import React, { useState, useEffect } from 'react';
import { fetchClient } from '../api/client';
import { Phone, Mail, MapPin, Globe } from 'lucide-react';

interface AppSetting {
  id: number;
  key: string;
  value: string;
}

export function ReportHeader() {
  const [storeInfo, setStoreInfo] = useState({
    name: 'Blonjo Store',
    address: '',
    phone: '',
    email: '',
    website: ''
  });

  useEffect(() => {
    async function loadInfo() {
      try {
        const data: AppSetting[] = await fetchClient('/settings');
        const info = { ...storeInfo };
        data.forEach(item => {
          if (item.key === 'store_name') info.name = item.value;
          if (item.key === 'store_address') info.address = item.value;
          if (item.key === 'store_phone') info.phone = item.value;
          if (item.key === 'store_email') info.email = item.value;
          if (item.key === 'store_website') info.website = item.value;
        });
        setStoreInfo(info);
      } catch (err) {
        console.error('Failed to load store info for header', err);
      }
    }
    loadInfo();
  }, []);

  return (
    <div className="w-full flex flex-col items-center pb-4 mb-8 text-black bg-white border-b-2 border-zinc-900">
      <h1 className="text-3xl font-black uppercase tracking-tighter mb-1 text-center">{storeInfo.name}</h1>
      
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] font-medium text-zinc-700 mb-2">
        {storeInfo.address && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>{storeInfo.address}</span>
          </div>
        )}
        {storeInfo.phone && (
          <div className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            <span>{storeInfo.phone}</span>
          </div>
        )}
        {storeInfo.email && (
          <div className="flex items-center gap-1">
            <Mail className="w-3 h-3" />
            <span>{storeInfo.email}</span>
          </div>
        )}
        {storeInfo.website && (
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            <span>{storeInfo.website}</span>
          </div>
        )}
      </div>
    </div>
  );
}
