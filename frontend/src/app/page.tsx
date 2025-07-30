'use client';

import Link from 'next/link';
import ProtectedAdminLayout from '@/components/ProtectedAdminLayout';

export default function Home() {
  return (
    <ProtectedAdminLayout>
      <div className='container mx-auto p-4'>
        <h1 className='text-2xl font-bold mb-6 text-center'>
          Welcome to Wallet Watcher
        </h1>
        <nav className='flex flex-col items-center space-y-4 md:flex-row md:space-y-0 md:space-x-6 md:justify-center'>
          <Link
            href='/upload'
            className='px-6 py-2 text-lg text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-md transition-colors duration-150'
          >
            Upload Wallet Addresses
          </Link>
          <Link
            href='/admin/companies'
            className='px-6 py-2 text-lg text-white bg-green-600 hover:bg-green-700 rounded-md shadow-md transition-colors duration-150'
          >
            Manage Companies
          </Link>
          {/* Add other primary navigation links here if needed */}
        </nav>
        {/* You can add more content to your home page below */}
      </div>
    </ProtectedAdminLayout>
  );
}
