'use client';

import { useState, useEffect } from 'react';
import Papa, { ParseResult } from 'papaparse';
import ProtectedAdminLayout from '@/components/ProtectedAdminLayout';
import { apiClient } from '@/lib/api';

// Define types for what we expect from the backend
interface BackendImportResponse {
  message: string;
  batchId: number;
  companyId: number;
  companyName?: string; // Re-added for frontend summary display purposes
  mode: string;
  totalSubmitted: number;
  validAddresses: number;
  invalidAddresses: number;
}

// Add interface for parsed address with threshold
interface ParsedAddress {
  address: string;
  chain_type: 'EVM' | 'TRON';
  threshold?: number;
  accountName?: string;
  accountManager?: string;
}

// Define a type for the Company data we expect from the /companies endpoint
interface CompanyWithSlackConfig {
  id: number;
  name: string;
  slackConfiguration?: {
    channelId?: string | null;
    isEnabled?: boolean;
    // Add other slack config fields if needed for filtering/display
  } | null;
  // Add other company fields if needed
}

export default function UploadPage() {
  // const [companyName, setCompanyName] = useState(''); // Replaced by selectedCompanyId
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(''); // Store as string for select, parse to int on submit
  const [allCompanies, setAllCompanies] = useState<CompanyWithSlackConfig[]>(
    []
  );
  const [filteredCompanies, setFilteredCompanies] = useState<
    CompanyWithSlackConfig[]
  >([]);
  const [companiesLoading, setCompaniesLoading] = useState<boolean>(true);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const [threshold, setThreshold] = useState('');
  const [mode, setMode] = useState('REPLACE');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [displayedInvalidRows, setDisplayedInvalidRows] = useState<any[]>([]);
  const [uploadSummary, setUploadSummary] =
    useState<BackendImportResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      setCompaniesLoading(true);
      setCompaniesError(null);
      try {
        const data: CompanyWithSlackConfig[] = await apiClient.getCompanies();
        setAllCompanies(data);

        // Filter companies that have Slack configured and enabled
        const slackConfiguredCompanies = data.filter(
          (company) =>
            company.slackConfiguration &&
            company.slackConfiguration.channelId && // Ensure channelId is present
            company.slackConfiguration.isEnabled // Ensure Slack is enabled
        );
        setFilteredCompanies(slackConfiguredCompanies);
      } catch (error: any) {
        console.error('Error fetching companies:', error);
        setCompaniesError(error.message || 'Could not load companies.');
      } finally {
        setCompaniesLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadSummary(null);
      setApiError(null);
      setDisplayedInvalidRows([]);
    }
  };

  const validateAddressClientSide = (
    address: string
  ): { valid: boolean; chain: 'EVM' | 'TRON' | null } => {
    const evmRegex = /^0x[a-fA-F0-9]{40}$/;
    // Slightly adjusted Tron regex based on common patterns, backend validator is the source of truth
    const tronRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    if (evmRegex.test(address)) return { valid: true, chain: 'EVM' };
    if (tronRegex.test(address)) return { valid: true, chain: 'TRON' };
    return { valid: false, chain: null };
  };

  const handleUploadAndSubmit = async () => {
    if (!file || !selectedCompanyId) {
      // Changed from companyName
      setApiError('Company and File are required.');
      return;
    }

    setIsProcessing(true);
    setUploadSummary(null);
    setApiError(null);
    setDisplayedInvalidRows([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: ParseResult<any>) => {
        const parsedAddresses: ParsedAddress[] = [];
        const clientSideInvalidRows: any[] = [];
        const companyThreshold = threshold ? parseFloat(threshold) : undefined;

        results.data.forEach((row: any) => {
          const rawAddress = row.address?.trim();
          if (!rawAddress) return;
          const { valid, chain } = validateAddressClientSide(rawAddress);
          if (valid && chain) {
            // Try to get threshold from CSV, fallback to company threshold
            const addressThreshold = row.threshold
              ? parseFloat(row.threshold)
              : companyThreshold;

            let finalAddress = rawAddress;
            if (chain === 'EVM') {
              finalAddress = rawAddress.toLowerCase();
            }
            // For TRON, we use the trimmed address as is.

            // Handle both underscore and camelCase formats for account fields
            const accountName =
              row.account_name?.trim() || row.accountName?.trim() || undefined;
            const accountManager =
              row.account_manager?.trim() ||
              row.accountManager?.trim() ||
              undefined;

            parsedAddresses.push({
              address: finalAddress,
              chain_type: chain,
              threshold: addressThreshold,
              accountName: accountName,
              accountManager: accountManager,
            });
          } else {
            clientSideInvalidRows.push(row);
          }
        });

        setDisplayedInvalidRows(clientSideInvalidRows.slice(0, 10));

        if (parsedAddresses.length === 0) {
          setApiError(
            clientSideInvalidRows.length > 0
              ? 'No valid addresses found in the file to submit after client-side validation.'
              : 'No addresses found in the file.'
          );
          setIsProcessing(false);
          return;
        }

        const requestBody = {
          // companyName: companyName.trim(), // To be replaced by companyId
          companyId: parseInt(selectedCompanyId, 10), // Send companyId
          mode: mode.toUpperCase(),
          addresses: parsedAddresses,
          original_filename: file.name,
          // companyThreshold: companyThreshold, // This was specific to the old setup, review if needed
        };

        // Note: The backend needs to be updated to accept companyId instead of companyName
        // and to handle the threshold logic appropriately if companyThreshold is removed or changed.

        try {
          const responseData = await apiClient.importAddresses(requestBody);

          setUploadSummary(responseData as BackendImportResponse);
          // Update company name in summary from the selected company, if needed
          const selectedCompany = allCompanies.find(
            (c) => c.id === parseInt(selectedCompanyId, 10)
          );
          if (selectedCompany && responseData) {
            (responseData as BackendImportResponse).companyName =
              selectedCompany.name;
          }
          setApiError(null);
        } catch (error: any) {
          console.error('Error submitting addresses:', error);
          setApiError(
            error.message || 'An unexpected error occurred during submission.'
          );
          setUploadSummary(null);
        } finally {
          setIsProcessing(false);
        }
      },
      error: (error: Error) => {
        console.error('Error parsing file:', error);
        setApiError(`Error parsing CSV: ${error.message}`);
        setIsProcessing(false);
      },
    });
  };

  return (
    <ProtectedAdminLayout>
      <div className='container mx-auto p-4'>
        <h1 className='text-2xl font-bold mb-4'>Upload Addresses to Backend</h1>

        <div className='mb-4'>
          <label htmlFor='companyIdSelect' className='block mb-2'>
            Company
          </label>
          {companiesLoading && <p>Loading companies...</p>}
          {companiesError && <p className='text-red-500'>{companiesError}</p>}
          {!companiesLoading && !companiesError && (
            <select
              id='companyIdSelect'
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className='border p-2 w-full'
              disabled={filteredCompanies.length === 0}
            >
              <option value=''>
                {filteredCompanies.length === 0
                  ? 'No companies with Slack configured found'
                  : '-- Select a Company --'}
              </option>
              {filteredCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} (ID: {company.id})
                </option>
              ))}
            </select>
          )}
          {!companiesLoading &&
            filteredCompanies.length === 0 &&
            !companiesError && (
              <p className='text-sm text-yellow-700 mt-1'>
                No companies with active Slack configurations (Channel ID set
                and enabled) were found. Please configure Slack for a company
                before uploading addresses for it.
              </p>
            )}
        </div>

        {/* Threshold input can remain if it's still relevant as a CSV column override */}
        {/* <div className='mb-4'>
        <label className='block mb-2'>
          Company Default Threshold (used if CSV doesn't specify threshold)
        </label>
        <input
          type='number'
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className='border p-2 w-full'
          placeholder='Enter default threshold for all addresses'
          min='0'
          step='0.000000000000000001'
        />
        <p className='text-sm text-gray-500 mt-1'>
          This threshold will be used for addresses that don't have a threshold
          specified in the CSV. If left empty, no default threshold will be set.
        </p>
      </div> */}

        <div className='mb-4'>
          <label className='block mb-2'>Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value.toUpperCase())}
            className='border p-2 w-full'
          >
            <option value='REPLACE'>Replace</option>
            <option value='APPEND'>Append</option>
          </select>
        </div>
        <div className='mb-4'>
          <label className='block mb-2'>
            Upload CSV (max 2k rows for sync import)
          </label>
          <input
            type='file'
            accept='.csv'
            onChange={handleFileChange}
            className='border p-2 w-full'
          />
          <p className='text-sm text-gray-500 mt-1'>
            Expected CSV columns: address, chain_type, threshold (optional),
            account_name (optional), account_manager (optional)
          </p>
        </div>
        <button
          onClick={handleUploadAndSubmit}
          disabled={
            !file ||
            isProcessing ||
            !selectedCompanyId ||
            companiesLoading ||
            filteredCompanies.length === 0
          }
          className='bg-blue-500 text-white p-2 rounded disabled:bg-gray-400'
        >
          {isProcessing
            ? 'Processing & Submitting...'
            : 'Parse, Validate & Submit to Backend'}
        </button>

        {apiError && (
          <div className='mt-4 p-4 bg-red-100 text-red-700 rounded'>
            <h2 className='font-bold'>Error</h2>
            <p>{apiError}</p>
          </div>
        )}

        {/* Displaying companyName in summary needs to be handled carefully as it's not directly in BackendImportResponse now */}
        {uploadSummary && (
          <div className='mt-4 p-4 bg-green-100 text-green-700 rounded'>
            <h2 className='font-bold'>Backend Import Summary</h2>
            <p>Message: {uploadSummary.message}</p>
            <p>Batch ID: {uploadSummary.batchId}</p>
            <p>Company ID: {uploadSummary.companyId}</p>
            {/* <p>Company Name: {uploadSummary.companyName}</p> */}
            {(() => {
              const companyDetails = allCompanies.find(
                (c) => c.id === uploadSummary.companyId
              );
              return companyDetails ? (
                <p>Company Name: {companyDetails.name}</p>
              ) : null;
            })()}
            <p>Mode: {uploadSummary.mode}</p>
            <p>Total Submitted by Client: {uploadSummary.totalSubmitted}</p>
            <p>Valid Addresses (by backend): {uploadSummary.validAddresses}</p>
            <p>
              Invalid Addresses (by backend): {uploadSummary.invalidAddresses}
            </p>
          </div>
        )}

        {displayedInvalidRows.length > 0 && (
          <div className='mt-4 p-4 bg-yellow-100 text-yellow-700 rounded'>
            <h2 className='font-bold'>
              Client-Side Invalid Rows (Preview - first 10)
            </h2>
            <p className='text-sm mb-2'>
              These rows were not submitted because they failed client-side
              address validation.
            </p>
            <pre className='text-xs overflow-auto'>
              {JSON.stringify(displayedInvalidRows, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </ProtectedAdminLayout>
  );
}
