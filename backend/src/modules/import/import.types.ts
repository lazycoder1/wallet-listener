export interface ImportAddress {
    address: string;
    chain_type: 'EVM' | 'TRON';
}

export interface ImportRequestBody {
    companyName: string;
    mode: 'REPLACE' | 'APPEND';
    addresses: ImportAddress[];
    original_filename?: string;
} 