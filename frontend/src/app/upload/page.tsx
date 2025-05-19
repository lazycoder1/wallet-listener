'use client';

import { useState } from 'react';
import Papa, { ParseResult } from 'papaparse';

// Define types for what we expect from the backend
interface BackendImportResponse {
  message: string;
  batchId: number;
  companyId: number;
  companyName: string;
  mode: string;
  totalSubmitted: number;
  validAddresses: number;
  invalidAddresses: number;
}

export default function UploadPage() {
  const [companyName, setCompanyName] = useState('');
  const [threshold, setThreshold] = useState('');
  const [mode, setMode] = useState('REPLACE');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [displayedInvalidRows, setDisplayedInvalidRows] = useState<any[]>([]);
  const [uploadSummary, setUploadSummary] =
    useState<BackendImportResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

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

  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

  const handleUploadAndSubmit = async () => {
    if (!file || !companyName.trim()) {
      setApiError('Company Name and File are required.');
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
        const parsedAddresses: {
          address: string;
          chain_type: 'EVM' | 'TRON';
        }[] = [];
        const clientSideInvalidRows: any[] = [];

        results.data.forEach((row: any) => {
          const address = row.address?.trim();
          if (!address) return;
          const { valid, chain } = validateAddressClientSide(address);
          if (valid && chain) {
            parsedAddresses.push({ address, chain_type: chain });
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
          companyName: companyName.trim(),
          mode: mode.toUpperCase(),
          addresses: parsedAddresses,
          original_filename: file.name,
        };

        try {
          const response = await fetch(`${API_BASE_URL}/imports`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const responseData = await response.json();

          if (!response.ok) {
            setApiError(
              responseData.error ||
                responseData.message ||
                'Failed to import addresses.'
            );
            if (responseData.details) {
              setApiError((prev) => `${prev} Details: ${responseData.details}`);
            }
            setUploadSummary(null);
          } else {
            setUploadSummary(responseData as BackendImportResponse);
            setApiError(null);
          }
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
    <div className='container mx-auto p-4'>
      <h1 className='text-2xl font-bold mb-4'>Upload Addresses to Backend</h1>
      <div className='mb-4'>
        <label className='block mb-2'>Company Name</label>
        <input
          type='text'
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className='border p-2 w-full'
          placeholder='Enter Company Name'
        />
      </div>
      <div className='mb-4'>
        <label className='block mb-2'>
          Threshold (currently not used by import)
        </label>
        <input
          type='number'
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className='border p-2 w-full'
        />
      </div>
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
      </div>
      <button
        onClick={handleUploadAndSubmit}
        disabled={!file || isProcessing || !companyName.trim()}
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

      {uploadSummary && (
        <div className='mt-4 p-4 bg-green-100 text-green-700 rounded'>
          <h2 className='font-bold'>Backend Import Summary</h2>
          <p>Message: {uploadSummary.message}</p>
          <p>Batch ID: {uploadSummary.batchId}</p>
          <p>Company ID: {uploadSummary.companyId}</p>
          <p>Company Name: {uploadSummary.companyName}</p>
          <p>Mode: {uploadSummary.mode}</p>
          <p>Total Submitted by Client: {uploadSummary.totalSubmitted}</p>
          <p>Valid Addresses (by backend): {uploadSummary.validAddresses}</p>
          <p>
            Invalid Addresses (by backend): {uploadSummary.invalidAddresses}
          </p>
        </div>
      )}

      {displayedInvalidRows.length > 0 && (
        <div className='mt-4'>
          <h2 className='font-bold'>Client-Side Invalid Rows (First 10)</h2>
          <table className='w-full border'>
            <thead>
              <tr>
                <th className='border p-2'>Address (from CSV)</th>
              </tr>
            </thead>
            <tbody>
              {displayedInvalidRows.map((row, index) => (
                <tr key={index}>
                  <td className='border p-2'>
                    {row.address || JSON.stringify(row)}
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
