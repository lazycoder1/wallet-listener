'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface SlackConfig {
  id: number;
  channelId?: string | null;
  channelName?: string | null;
  alertThreshold: number | string; // Assuming Decimal is serialized as string or number
  isEnabled: boolean;
}

interface Company {
  id: number;
  name: string;
  slackConfiguration?: SlackConfig | null;
  createdAt: string;
  updatedAt: string;
}

// Ensure this points to your backend. The Slack routes are under /api/v1/slack/
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface ToastMessage {
  type: 'success' | 'error';
  message: string;
}

async function fetchCompanies(): Promise<Company[]> {
  const res = await fetch(`${API_BASE_URL}/companies`); // Assuming this endpoint exists
  if (!res.ok) {
    throw new Error('Failed to fetch companies from backend');
  }
  return res.json();
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    fetchCompanies()
      .then((data) => {
        setCompanies(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(
          err.message +
            '. Ensure the backend server is running and accessible at ' +
            API_BASE_URL
        );
        setIsLoading(false);
      });
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this company?')) {
      try {
        const res = await fetch(`${API_BASE_URL}/companies/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const errorData = await res
            .json()
            .catch(() => ({ message: 'Failed to delete company' }));
          throw new Error(errorData.message || 'Failed to delete company');
        }
        setCompanies(companies.filter((company) => company.id !== id));
        setToast({ type: 'success', message: 'Company deleted successfully.' });
      } catch (err: any) {
        setError(err.message);
        setToast({
          type: 'error',
          message: `Error deleting company: ${err.message}`,
        });
        console.error('Delete error:', err);
      }
    }
  };

  const handleGenerateSlackLink = async (companyId: number) => {
    setToast(null); // Clear previous toast
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/slack/generate-install-url`,
        {
          // Corrected endpoint
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ companyId }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error?.message ||
            'Failed to generate Slack install link'
        );
      }

      if (data.installUrl) {
        await navigator.clipboard.writeText(data.installUrl);
        setToast({
          type: 'success',
          message: 'Slack install link copied to clipboard!',
        });
      } else {
        throw new Error('Install URL not found in response.');
      }
    } catch (err: any) {
      console.error('Generate Slack Link error:', err);
      setToast({ type: 'error', message: `Error: ${err.message}` });
    }
  };

  if (isLoading) return <p>Loading companies...</p>;
  if (error && !toast) {
    // Only show main error if no toast is active
    return (
      <div className='container mx-auto p-4'>
        <div
          className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4'
          role='alert'
        >
          <strong className='font-bold'>Error loading companies: </strong>
          <span className='block sm:inline'>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-4'>
      {/* Toast Notification Display */}
      {toast && (
        <div
          className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
          role='alert'
        >
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className='ml-4 font-bold text-xl align-top'
          >
            &times;
          </button>
        </div>
      )}

      <div className='flex justify-between items-center mb-6'>
        <h1 className='text-2xl font-bold'>Manage Companies</h1>
        <Link
          href='/admin/companies/new'
          className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'
        >
          Add New Company
        </Link>
      </div>

      {companies.length === 0 && !isLoading ? (
        <p>No companies found. Get started by adding one!</p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='min-w-full bg-white shadow-md rounded-lg'>
            <thead className='bg-gray-200'>
              <tr>
                <th className='text-left py-3 px-4'>ID</th>
                <th className='text-left py-3 px-4'>Name</th>
                <th className='text-left py-3 px-4'>Slack Channel</th>
                <th className='text-left py-3 px-4'>Slack Enabled</th>
                <th className='text-left py-3 px-4'>Alert Threshold</th>
                <th className='text-left py-3 px-4'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className='border-b hover:bg-gray-100'>
                  <td className='py-3 px-4'>{company.id}</td>
                  <td className='py-3 px-4'>{company.name}</td>
                  <td className='py-3 px-4'>
                    {company.slackConfiguration?.channelId || 'N/A'}
                    {company.slackConfiguration?.channelName &&
                      ` (${company.slackConfiguration.channelName})`}
                  </td>
                  <td className='py-3 px-4'>
                    {company.slackConfiguration
                      ? company.slackConfiguration.isEnabled
                        ? 'Yes'
                        : 'No'
                      : 'N/A'}
                  </td>
                  <td className='py-3 px-4'>
                    {company.slackConfiguration?.alertThreshold?.toString() ||
                      'N/A'}
                  </td>
                  <td className='py-3 px-4'>
                    <Link
                      href={`/admin/companies/${company.id}/edit`}
                      className='text-blue-500 hover:text-blue-700 mr-3'
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(company.id)}
                      className='text-red-500 hover:text-red-700 mr-3' // Added mr-3 for spacing
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => handleGenerateSlackLink(company.id)}
                      className='text-purple-500 hover:text-purple-700'
                      title='Generate Slack Install Link'
                    >
                      Generate Link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
