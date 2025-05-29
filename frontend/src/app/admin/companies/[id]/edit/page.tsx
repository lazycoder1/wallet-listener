'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation'; // Using next/navigation for App Router
import CompanyForm, {
  CompanyFormData,
} from '../../../../../components/CompanyForm'; // Adjusted path
import Link from 'next/link';

// Interface for the company data expected from the API (including Slack config)
interface CompanyData extends CompanyFormData {
  id: number;
  // Add other fields like createdAt, updatedAt if needed for display or logic
}

const API_BASE_URL = 'http://localhost:3001'; // Your backend URL

async function fetchCompanyById(id: string): Promise<CompanyData | null> {
  const res = await fetch(`${API_BASE_URL}/companies/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Failed to fetch company details from backend');
  }
  return res.json();
}

export default function EditCompanyPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string; // Company ID from URL

  const [company, setCompany] = useState<Partial<CompanyFormData> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchCompanyById(id)
        .then((data) => {
          if (data) {
            // Prepare initialData for the form, ensuring slackConfiguration is an object
            setCompany({
              name: data.name,
              slackConfiguration: data.slackConfiguration || {
                // Ensure object for form
                channelId: '',
                channelName: '',
                alertThreshold: '0',
                isEnabled: true,
              },
            });
          } else {
            setError('Company not found.');
          }
        })
        .catch((err) => {
          setError(
            err.message +
              '. Ensure the backend server is running and accessible at ' +
              API_BASE_URL
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [id]);

  const handleSubmit = async (data: CompanyFormData) => {
    setIsSubmitting(true);
    setError(null);
    try {
      console.log(
        'Sending to API (edit company):',
        JSON.stringify(data, null, 2)
      );
      const response = await fetch(`${API_BASE_URL}/companies/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message:
            'Failed to update company. Please check the details and ensure backend is running.',
        }));
        throw new Error(errorData.message || 'Failed to update company');
      }

      router.push('/admin/companies');
      // You might want to show a success toast/notification here
    } catch (err: any) {
      setError(
        err.message +
          '. Ensure the backend server is running and accessible at ' +
          API_BASE_URL
      );
      console.error('Update company error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <p>Loading company details...</p>;
  if (error && !company) return <p>Error: {error}</p>;
  if (!company && !isLoading)
    return (
      <p>
        Company not found.{' '}
        <Link href='/admin/companies' className='text-blue-500 underline'>
          Go back to list
        </Link>
      </p>
    );

  return (
    <div className='container mx-auto p-4'>
      <h1 className='text-2xl font-bold mb-6'>Edit Company</h1>
      {error && (
        <div
          className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4'
          role='alert'
        >
          <strong className='font-bold'>Error: </strong>
          <span className='block sm:inline'>{error}</span>
        </div>
      )}
      {/* Only render form if company data is loaded successfully */}
      {company && (
        <CompanyForm
          initialData={company}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitButtonText='Save Changes'
        />
      )}
    </div>
  );
}
