'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import AdminLogin from './AdminLogin';

interface ProtectedAdminLayoutProps {
  children: ReactNode;
}

export default function ProtectedAdminLayout({
  children,
}: ProtectedAdminLayoutProps) {
  const { isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto'></div>
          <p className='mt-4 text-gray-600'>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Admin Header */}
      <header className='bg-white shadow'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center py-6'>
            <div className='flex items-center'>
              <h1 className='text-2xl font-bold text-gray-900'>
                Wallet Watcher Admin
              </h1>
            </div>
            <nav className='flex space-x-4'>
              <Link
                href='/admin/companies'
                className='text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium'
              >
                Companies
              </Link>
              <Link
                href='/upload'
                className='text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium'
              >
                Upload
              </Link>
              <button
                onClick={logout}
                className='bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium'
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className='py-6'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>{children}</div>
      </main>
    </div>
  );
}
