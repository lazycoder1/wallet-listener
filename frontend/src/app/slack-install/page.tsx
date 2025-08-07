'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface SlackConfig {
  id: number;
  channelId?: string | null;
  channelName?: string | null;
  alertThreshold: number | string;
  isEnabled: boolean;
  slackTeamId?: string | null;
  slackTeamName?: string | null;
}

interface Company {
  id: number;
  name: string;
  slackConfiguration?: SlackConfig | null;
  createdAt: string;
  updatedAt: string;
}

interface ToastMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

// Using direct fetch since this is an unauthenticated page
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://api.walletshark.io';

async function fetchCompany(companyId: number): Promise<Company> {
  const response = await fetch(`${API_BASE_URL}/public/companies/${companyId}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Company not found');
    }
    throw new Error('Failed to fetch company information');
  }
  return response.json();
}

async function generateSlackInstallUrl(companyId: number): Promise<{
  success: boolean;
  installUrl?: string;
  message?: string;
  error?: any;
}> {
  const response = await fetch(
    `${API_BASE_URL}/public/slack/generate-install-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ companyId }),
    }
  );

  return response.json();
}

function SlackInstallContent() {
  const searchParams = useSearchParams();
  const companyIdParam = searchParams.get('company-id');
  const companyId = companyIdParam ? parseInt(companyIdParam, 10) : null;

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (!companyId || isNaN(companyId)) {
      setError('Invalid or missing company ID. Please check the URL.');
      setIsLoading(false);
      return;
    }

    fetchCompany(companyId)
      .then((data) => {
        setCompany(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [companyId]);

  const handleInstallSlack = async () => {
    if (!company) return;

    setIsInstalling(true);
    setToast(null);

    try {
      console.log('🔗 Generating Slack install URL for company:', company.id);
      const data = await generateSlackInstallUrl(company.id);

      if (!data.success) {
        throw new Error(
          data.message ||
            data.error?.message ||
            'Failed to generate Slack install link'
        );
      }

      if (data.installUrl) {
        // Open the Slack installation URL in a new tab
        window.open(data.installUrl, '_blank');
        setToast({
          type: 'success',
          message:
            'Slack installation page opened in a new tab. Please complete the installation there.',
        });
      } else {
        throw new Error('Install URL not found in response.');
      }
    } catch (err: any) {
      console.error('Slack installation error:', err);
      setToast({ type: 'error', message: `Error: ${err.message}` });
    } finally {
      setIsInstalling(false);
    }
  };

  const isSlackIntegrated = company?.slackConfiguration?.slackTeamId;

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto'></div>
          <p className='mt-4 text-gray-600'>Loading company information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50'>
        <div className='max-w-md w-full bg-white shadow-lg rounded-lg p-6'>
          <div className='text-center'>
            <div className='mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100'>
              <svg
                className='h-6 w-6 text-red-600'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z'
                />
              </svg>
            </div>
            <h3 className='mt-2 text-sm font-medium text-gray-900'>Error</h3>
            <p className='mt-1 text-sm text-gray-500'>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50 py-12'>
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white z-50 ${
            toast.type === 'success'
              ? 'bg-green-500'
              : toast.type === 'error'
              ? 'bg-red-500'
              : 'bg-blue-500'
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

      <div className='max-w-2xl mx-auto px-4'>
        <div className='bg-white shadow-xl rounded-lg overflow-hidden'>
          {/* Header */}
          <div className='bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-8'>
            <div className='flex items-center'>
              <div className='flex-shrink-0'>
                <svg
                  className='h-12 w-12 text-white'
                  fill='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path d='M5.042 15.165a2.528 2.528 0 0 0 2.5 2.5c1.61 0 2.92-1.66 2.92-3.505C10.462 12.165 9.152 11 7.542 11s-2.92 1.165-2.92 3.165h1.482c0-1.11.463-1.665 1.438-1.665s1.438.555 1.438 1.665-.463 1.665-1.438 1.665a1.035 1.035 0 0 1-1.018-1.11H5.042zM14.55 11c-1.61 0-2.92 1.165-2.92 3.165 0 1.845 1.31 3.505 2.92 3.505s2.92-1.66 2.92-3.505S16.16 11 14.55 11zm0 5.33c-.975 0-1.438-.555-1.438-1.665s.463-1.665 1.438-1.665 1.438.555 1.438 1.665-.463 1.665-1.438 1.665z' />
                </svg>
              </div>
              <div className='ml-4'>
                <h1 className='text-3xl font-bold text-white'>
                  Slack Integration
                </h1>
                <p className='text-blue-100'>Connect your Slack workspace</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className='px-6 py-8'>
            <div className='mb-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-2'>
                Company: {company?.name}
              </h2>
              <p className='text-gray-600'>Company ID: {company?.id}</p>
            </div>

            {isSlackIntegrated ? (
              /* Integration Successful State */
              <div className='text-center'>
                <div className='mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4'>
                  <svg
                    className='h-8 w-8 text-green-600'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M5 13l4 4L19 7'
                    />
                  </svg>
                </div>
                <h3 className='text-lg font-medium text-gray-900 mb-2'>
                  Integration Successful!
                </h3>
                <p className='text-gray-600 mb-4'>
                  Your company is already connected to Slack workspace:{' '}
                  {company?.slackConfiguration?.slackTeamName ||
                    company?.slackConfiguration?.slackTeamId}
                </p>
                <div className='bg-green-50 border border-green-200 rounded-md p-4'>
                  <div className='flex'>
                    <div className='flex-shrink-0'>
                      <svg
                        className='h-5 w-5 text-green-400'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                          clipRule='evenodd'
                        />
                      </svg>
                    </div>
                    <div className='ml-3'>
                      <p className='text-sm text-green-800'>
                        Slack notifications are{' '}
                        {company?.slackConfiguration?.isEnabled
                          ? 'enabled'
                          : 'disabled'}{' '}
                        for this company.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  disabled
                  className='mt-6 w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-400 cursor-not-allowed'
                >
                  Already Integrated
                </button>
              </div>
            ) : (
              /* Install Slack State */
              <div className='text-center'>
                <div className='mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4'>
                  <svg
                    className='h-8 w-8 text-blue-600'
                    fill='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path d='M5.042 15.165a2.528 2.528 0 0 0 2.5 2.5c1.61 0 2.92-1.66 2.92-3.505C10.462 12.165 9.152 11 7.542 11s-2.92 1.165-2.92 3.165h1.482c0-1.11.463-1.665 1.438-1.665s1.438.555 1.438 1.665-.463 1.665-1.438 1.665a1.035 1.035 0 0 1-1.018-1.11H5.042zM14.55 11c-1.61 0-2.92 1.165-2.92 3.165 0 1.845 1.31 3.505 2.92 3.505s2.92-1.66 2.92-3.505S16.16 11 14.55 11zm0 5.33c-.975 0-1.438-.555-1.438-1.665s.463-1.665 1.438-1.665 1.438.555 1.438 1.665-.463 1.665-1.438 1.665z' />
                  </svg>
                </div>
                <h3 className='text-lg font-medium text-gray-900 mb-2'>
                  Connect to Slack
                </h3>
                <p className='text-gray-600 mb-6'>
                  Click the button below to connect your company to a Slack
                  workspace. This will allow you to receive wallet monitoring
                  alerts directly in your Slack channels.
                </p>
                <div className='bg-blue-50 border border-blue-200 rounded-md p-4 mb-6'>
                  <div className='flex'>
                    <div className='flex-shrink-0'>
                      <svg
                        className='h-5 w-5 text-blue-400'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
                          clipRule='evenodd'
                        />
                      </svg>
                    </div>
                    <div className='ml-3'>
                      <p className='text-sm text-blue-800'>
                        You'll be redirected to Slack to authorize the
                        integration. Make sure you have admin permissions in
                        your Slack workspace.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleInstallSlack}
                  disabled={isInstalling}
                  className='w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isInstalling ? (
                    <>
                      <svg
                        className='animate-spin -ml-1 mr-3 h-5 w-5 text-white'
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 24 24'
                      >
                        <circle
                          className='opacity-25'
                          cx='12'
                          cy='12'
                          r='10'
                          stroke='currentColor'
                          strokeWidth='4'
                        ></circle>
                        <path
                          className='opacity-75'
                          fill='currentColor'
                          d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                        ></path>
                      </svg>
                      Opening Slack...
                    </>
                  ) : (
                    'Install Slack Integration'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50'>
      <div className='text-center'>
        <div className='animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto'></div>
        <p className='mt-4 text-gray-600'>Loading...</p>
      </div>
    </div>
  );
}

export default function SlackInstallPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SlackInstallContent />
    </Suspense>
  );
}
