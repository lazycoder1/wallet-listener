'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; // Using next/navigation for App Router
import CompanyForm, {
  CompanyFormData,
} from '../../../../components/CompanyForm'; // Adjusted path
import Link from 'next/link';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://api.walletshark.io'; // Your backend URL

// Define the expected API response structure for creating a company
interface CompanyApiResponse {
  id: number;
  name: string;
  // include other fields if your API returns them
}

export default function NewCompanyPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CompanyFormData) => {
    setIsSubmitting(true);
    setError(null);
    try {
      console.log(
        'Sending to API (new company):',
        JSON.stringify(data, null, 2)
      );
      const response = await fetch(`${API_BASE_URL}/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message:
            'Failed to create company. Please check the details and ensure backend is running.',
        }));
        throw new Error(errorData.message || 'Failed to create company');
      }

      // Optionally, you can use the response data if needed
      // const newCompany: CompanyApiResponse = await response.json();

      // Redirect to the companies list page on success
      router.push('/admin/companies');
      // You might want to show a success toast/notification here
    } catch (err: any) {
      setError(
        err.message +
          '. Ensure the backend server is running and accessible at ' +
          API_BASE_URL
      );
      console.error('Create company error:', err);
      // You might want to show an error toast/notification here
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className='text-2xl font-bold mb-6'>Add New Company</h1>
      {error && (
        <div
          className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4'
          role='alert'
        >
          <strong className='font-bold'>Error: </strong>
          <span className='block sm:inline'>{error}</span>
        </div>
      )}
      <CompanyForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitButtonText='Create Company'
      />
    </div>
  );
}
