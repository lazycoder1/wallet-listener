'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';

function toIsoDateInputValue(d: Date) {
  const tzLess = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  return tzLess.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { isAuthenticated } = useAuth();
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState<string>(
    toIsoDateInputValue(yesterday)
  );
  const [endDate, setEndDate] = useState<string>(toIsoDateInputValue(today));
  const [companyId, setCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated)
    return <p className='p-6'>Please login to access reports.</p>;

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);
      const startIso = new Date(startDate + 'T00:00:00.000Z').toISOString();
      const endIso = new Date(endDate + 'T23:59:59.999Z').toISOString();
      const params = new URLSearchParams({ start: startIso, end: endIso });
      if (companyId) params.append('companyId', companyId);

      const apiBase =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('auth_token');

      const res = await fetch(
        `${apiBase}/api/v1/reports/notifications?${params.toString()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to generate report');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notifications_${startDate}_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='max-w-3xl mx-auto p-6'>
      <h1 className='text-2xl font-bold mb-4'>Notifications Report</h1>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
        <div>
          <label className='block text-sm font-medium text-gray-700'>
            Start Date (UTC)
          </label>
          <input
            type='date'
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className='mt-1 block w-full border rounded p-2'
          />
        </div>
        <div>
          <label className='block text-sm font-medium text-gray-700'>
            End Date (UTC)
          </label>
          <input
            type='date'
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className='mt-1 block w-full border rounded p-2'
          />
        </div>
        <div>
          <label className='block text-sm font-medium text-gray-700'>
            Company ID (optional)
          </label>
          <input
            type='number'
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder='e.g., 3'
            className='mt-1 block w-full border rounded p-2'
          />
        </div>
      </div>
      {error && <p className='text-red-600 mb-2'>{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className='bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded'
      >
        {loading ? 'Generating...' : 'Generate CSV'}
      </button>
    </div>
  );
}
