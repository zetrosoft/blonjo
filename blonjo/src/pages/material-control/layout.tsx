import React from 'react';
import { Outlet } from 'react-router-dom';

export default function MaterialControlLayout() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in-50 duration-200">
      <Outlet />
    </div>
  );
}
