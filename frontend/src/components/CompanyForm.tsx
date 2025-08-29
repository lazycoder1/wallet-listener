'use client';

import React, { useState, useEffect } from 'react';

interface SlackConfigData {
  channelId?: string | null;
  channelName?: string | null;
  alertThreshold?: string; // Input as string, will be parsed to number/Decimal on backend
  isEnabled?: boolean;
}

export interface CompanyFormData {
  name: string;
  slackConfiguration?: SlackConfigData;
  dailyReportsEnabled?: boolean;
  dailyReportsEmail?: string | null;
}

interface CompanyFormProps {
  initialData?: Partial<CompanyFormData>;
  onSubmit: (data: CompanyFormData) => Promise<void>;
  isSubmitting: boolean;
  submitButtonText?: string;
}

const CompanyForm: React.FC<CompanyFormProps> = ({
  initialData = {
    name: '',
    slackConfiguration: {
      channelId: '',
      channelName: '',
      alertThreshold: '0',
      isEnabled: true,
    },
    dailyReportsEnabled: false,
    dailyReportsEmail: '',
  },
  onSubmit,
  isSubmitting,
  submitButtonText = 'Submit',
}) => {
  const [formData, setFormData] = useState<CompanyFormData>({
    name: initialData.name || '',
    slackConfiguration: {
      channelId: initialData.slackConfiguration?.channelId || '',
      channelName: initialData.slackConfiguration?.channelName || '',
      alertThreshold:
        initialData.slackConfiguration?.alertThreshold?.toString() || '0',
      isEnabled:
        initialData.slackConfiguration?.isEnabled === undefined
          ? true
          : initialData.slackConfiguration.isEnabled,
    },
    dailyReportsEnabled: initialData.dailyReportsEnabled ?? false,
    dailyReportsEmail: initialData.dailyReportsEmail ?? '',
  });

  useEffect(() => {
    // Ensure formData is updated if initialData changes (e.g., for edit form after data fetch)
    setFormData({
      name: initialData.name || '',
      slackConfiguration: {
        channelId: initialData.slackConfiguration?.channelId || '',
        channelName: initialData.slackConfiguration?.channelName || '',
        alertThreshold:
          initialData.slackConfiguration?.alertThreshold?.toString() || '0',
        isEnabled:
          initialData.slackConfiguration?.isEnabled === undefined
            ? true
            : initialData.slackConfiguration.isEnabled,
      },
      dailyReportsEnabled: initialData.dailyReportsEnabled ?? false,
      dailyReportsEmail: initialData.dailyReportsEmail ?? '',
    });
  }, [
    initialData.name,
    initialData.slackConfiguration?.channelId,
    initialData.slackConfiguration?.channelName,
    initialData.slackConfiguration?.alertThreshold,
    initialData.slackConfiguration?.isEnabled,
    initialData.dailyReportsEnabled,
    initialData.dailyReportsEmail,
  ]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    if (name.startsWith('slackConfiguration.')) {
      const key = name.split('.')[1] as keyof SlackConfigData;
      setFormData((prev) => ({
        ...prev,
        slackConfiguration: {
          ...prev.slackConfiguration,
          [key]:
            type === 'checkbox'
              ? (e.target as HTMLInputElement).checked
              : value,
        },
      }));
    } else if (name === 'dailyReportsEnabled') {
      setFormData((prev) => ({
        ...prev,
        dailyReportsEnabled: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === 'dailyReportsEmail') {
      setFormData((prev) => ({
        ...prev,
        dailyReportsEmail: value,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dataToSubmit: CompanyFormData = {
      ...formData,
      slackConfiguration: {
        ...formData.slackConfiguration,
        alertThreshold:
          formData.slackConfiguration?.alertThreshold?.toString() || '0',
        channelId: formData.slackConfiguration?.channelId || null,
        channelName: formData.slackConfiguration?.channelName || null,
      },
    };
    console.log(
      'Submitting from CompanyForm:',
      JSON.stringify(dataToSubmit, null, 2)
    );
    onSubmit(dataToSubmit);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-6 bg-white p-8 shadow-md rounded-lg'
    >
      <div>
        <label
          htmlFor='name'
          className='block text-sm font-medium text-gray-700'
        >
          Company Name
        </label>
        <input
          type='text'
          name='name'
          id='name'
          value={formData.name}
          onChange={handleChange}
          required
          className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
        />
      </div>

      <fieldset className='border p-4 rounded-md'>
        <legend className='text-lg font-medium text-gray-900 px-1'>
          Slack Configuration
        </legend>
        <div className='space-y-4 mt-2'>
          <div>
            <label
              htmlFor='slackConfiguration.channelId'
              className='block text-sm font-medium text-gray-700'
            >
              Channel ID
            </label>
            <input
              type='text'
              name='slackConfiguration.channelId'
              id='slackConfiguration.channelId'
              value={formData.slackConfiguration?.channelId || ''}
              onChange={handleChange}
              className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
            />
          </div>
          <div>
            <label
              htmlFor='slackConfiguration.channelName'
              className='block text-sm font-medium text-gray-700'
            >
              Channel Name (Optional)
            </label>
            <input
              type='text'
              name='slackConfiguration.channelName'
              id='slackConfiguration.channelName'
              value={formData.slackConfiguration?.channelName || ''}
              onChange={handleChange}
              className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
            />
          </div>
          <div>
            <label
              htmlFor='slackConfiguration.alertThreshold'
              className='block text-sm font-medium text-gray-700'
            >
              Alert Threshold
            </label>
            <input
              type='number'
              name='slackConfiguration.alertThreshold'
              id='slackConfiguration.alertThreshold'
              value={formData.slackConfiguration?.alertThreshold || '0'}
              onChange={handleChange}
              min='0'
              step='any' // Allows decimals
              className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
            />
          </div>
          <div className='flex items-center'>
            <input
              type='checkbox'
              name='slackConfiguration.isEnabled'
              id='slackConfiguration.isEnabled'
              checked={formData.slackConfiguration?.isEnabled || false}
              onChange={handleChange}
              className='h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500'
            />
            <label
              htmlFor='slackConfiguration.isEnabled'
              className='ml-2 block text-sm text-gray-900'
            >
              Enable Slack Notifications
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className='border p-4 rounded-md'>
        <legend className='text-lg font-medium text-gray-900 px-1'>
          Daily Reports
        </legend>
        <div className='space-y-4 mt-2'>
          <div className='flex items-center'>
            <input
              type='checkbox'
              name='dailyReportsEnabled'
              id='dailyReportsEnabled'
              checked={!!formData.dailyReportsEnabled}
              onChange={handleChange}
              className='h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500'
            />
            <label
              htmlFor='dailyReportsEnabled'
              className='ml-2 block text-sm text-gray-900'
            >
              Enable Daily Email Report
            </label>
          </div>
          <div>
            <label
              htmlFor='dailyReportsEmail'
              className='block text-sm font-medium text-gray-700'
            >
              Recipient Email
            </label>
            <input
              type='email'
              name='dailyReportsEmail'
              id='dailyReportsEmail'
              value={formData.dailyReportsEmail || ''}
              onChange={handleChange}
              placeholder='reports@company.com'
              className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
              disabled={!formData.dailyReportsEnabled}
            />
          </div>
        </div>
      </fieldset>

      <div>
        <button
          type='submit'
          disabled={isSubmitting}
          className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400'
        >
          {isSubmitting ? 'Submitting...' : submitButtonText}
        </button>
      </div>
    </form>
  );
};

export default CompanyForm;
