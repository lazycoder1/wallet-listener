export interface ImportAddress {
    address: string;
    chain_type: 'EVM' | 'TRON';
    threshold?: number;
}

export interface ImportRequestBody {
    companyId: number;
    mode: 'REPLACE' | 'APPEND';
    addresses: ImportAddress[];
    original_filename?: string;
} 