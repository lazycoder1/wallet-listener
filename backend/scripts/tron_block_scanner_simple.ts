import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
const { TronWeb } = require('tronweb');

interface TronBlockResponse {
    blockID: string;
    block_header: {
        raw_data: {
            number: number;
            timestamp: number;
        };
    };
    transactions: TronTransaction[];
}

interface TronTransaction {
    txID: string;
    ret: Array<{
        contractRet: string;
    }>;
    raw_data: {
        contract: Array<{
            type: string;
            parameter: {
                value: any;
                type_url: string;
            };
        }>;
    };
    raw_data_hex: string;
}

interface TRC20Transfer {
    transactionId: string;
    blockNumber: number;
    blockTimestamp: number;
    contractAddress: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
}

class SimpleTronBlockScanner {
    private trackedTokens: Map<string, any> = new Map();
    private trackedAddressesSet: Set<string> = new Set();
    private tronGridUrl: string;
    private tronWeb: any;

    constructor() {
        this.tronGridUrl = 'https://api.trongrid.io';
        this.tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io'
        });
    }

    async initialize() {
        // Read tokens directly from JSON file
        const tokensPath = path.join(__dirname, '../src/data/tokens.json');
        const tokensFile = fs.readFileSync(tokensPath, 'utf8');
        const { tokens } = JSON.parse(tokensFile);

        // Load TRC20 tokens with TRON addresses
        for (const token of tokens) {
            if (token.addresses && token.addresses.tron) {
                this.trackedTokens.set(token.addresses.tron.toLowerCase(), token);
                console.log(`Tracking ${token.symbol}: ${token.addresses.tron}`);
            }
        }

        console.log(`Loaded ${this.trackedTokens.size} tracked TRC20 tokens`);
    }

    setTrackedAddresses(addresses: string[]) {
        this.trackedAddressesSet = new Set(addresses.map(addr => addr.toLowerCase()));
        console.log(`Tracking ${this.trackedAddressesSet.size} wallet addresses`);
    }

    /**
     * Get block data using official TRON API
     */
    async getBlockByNumber(blockNumber: number): Promise<TronBlockResponse | null> {
        try {
            const response = await axios.post(`${this.tronGridUrl}/wallet/getblockbynum`, {
                num: blockNumber
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (response.data && response.data.blockID) {
                return response.data as TronBlockResponse;
            }
            return null;
        } catch (error) {
            console.error(`Error fetching block ${blockNumber}:`, error);
            return null;
        }
    }

    /**
     * Extract TRC20 transfers from block transactions
     */
    extractTRC20TransfersFromBlock(block: TronBlockResponse): TRC20Transfer[] {
        const transfers: TRC20Transfer[] = [];

        if (!block.transactions) {
            return transfers;
        }

        for (const tx of block.transactions) {
            // Skip failed transactions
            if (!tx.ret || tx.ret[0]?.contractRet !== 'SUCCESS') {
                continue;
            }

            // Look for TriggerSmartContract transactions (TRC20 transfers)
            for (const contract of tx.raw_data.contract) {
                if (contract.type === 'TriggerSmartContract') {
                    const contractData = contract.parameter.value;
                    const contractAddress = contractData.contract_address;

                    // Convert hex address to base58
                    const contractAddressBase58 = this.hexToBase58(contractAddress);

                    // Check if this is one of our tracked tokens
                    if (this.trackedTokens.has(contractAddressBase58.toLowerCase())) {
                        // Decode the transfer data from the contract call
                        const transferData = this.decodeTRC20Transfer(contractData.data);

                        if (transferData) {
                            // For TRC20 transfers, the from address is the transaction owner_address
                            const fromAddress = this.hexToBase58(contractData.owner_address);
                            // transferData.to is already converted to base58 in decodeTRC20Transfer
                            const toAddress = transferData.to;

                            const transfer: TRC20Transfer = {
                                transactionId: tx.txID,
                                blockNumber: block.block_header.raw_data.number,
                                blockTimestamp: block.block_header.raw_data.timestamp,
                                contractAddress: contractAddressBase58,
                                fromAddress: fromAddress,
                                toAddress: toAddress,
                                amount: transferData.amount,
                                tokenSymbol: this.trackedTokens.get(contractAddressBase58.toLowerCase())?.symbol,
                                tokenDecimals: this.trackedTokens.get(contractAddressBase58.toLowerCase())?.decimals
                            };

                            transfers.push(transfer);
                        }
                    }
                }
            }
        }

        return transfers;
    }

    /**
     * Decode TRC20 transfer function call data
     * Transfer function signature: transfer(address _to, uint256 _value)
     * Method ID: a9059cbb
     */
    decodeTRC20Transfer(data: string): { from: string; to: string; amount: string } | null {
        const transfer_abi = [
            {
                "name": "transfer",
                "inputs": [
                    { "name": "_to", "type": "address" },
                    { "name": "_value", "type": "uint256" }
                ],
                "outputs": [{ "name": "", "type": "bool" }]
            }
        ]
        try {
            if (!data || data.length < 8) return null;

            // Check if this is a transfer method call (a9059cbb)
            const methodId = data.slice(0, 8);
            if (methodId !== 'a9059cbb') return null;

            // Extract parameters (each parameter is 32 bytes / 64 hex chars)
            const toAddressHex = data.slice(8, 72);   // First parameter: to address
            const amount = data.slice(72, 136);    // Second parameter: amount

            // Convert address from padded hex to proper format
            // Remove leading zeros and add '41' prefix for TRON addresses
            const addressWithoutPadding = toAddressHex.slice(-40); // Last 40 hex chars (20 bytes)
            const tronAddress = '41' + addressWithoutPadding; // Add TRON address prefix

            // Convert to base58 TRON address format
            const toAddress = this.hexToBase58Direct(tronAddress);
            console.log('toAddress', toAddress);

            return {
                from: '', // Will be filled from transaction sender
                to: toAddress,
                amount: BigInt('0x' + amount).toString()
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Convert hex address to base58 (TRON format)
     */
    hexToBase58(hexAddress: string): string {
        try {
            if (!hexAddress) return '';
            // Add 41 prefix if not present (TRON mainnet identifier)
            const fullHex = hexAddress.startsWith('41') ? hexAddress : '41' + hexAddress;
            return this.tronWeb.address.fromHex(fullHex);
        } catch (error) {
            console.warn(`Failed to convert hex address ${hexAddress}:`, error);
            return hexAddress; // Fallback to original
        }
    }

    /**
     * Convert hex address to base58 without adding 41 prefix (for already prefixed addresses)
     */
    hexToBase58Direct(hexAddressWithPrefix: string): string {
        try {
            if (!hexAddressWithPrefix) return '';
            return this.tronWeb.address.fromHex(hexAddressWithPrefix);
        } catch (error) {
            console.warn(`Failed to convert hex address ${hexAddressWithPrefix}:`, error);
            return hexAddressWithPrefix; // Fallback to original
        }
    }

    /**
     * Filter transfers for tracked addresses
     */
    filterRelevantTransfers(transfers: TRC20Transfer[]): TRC20Transfer[] {
        console.log('\n=== DEBUG: Filtering transfers ===');
        console.log(`Tracked addresses: ${Array.from(this.trackedAddressesSet).join(', ')}`);

        const relevant = transfers.filter((transfer, index) => {
            const fromLower = transfer.fromAddress.toLowerCase();
            const toLower = transfer.toAddress.toLowerCase();
            const isRelevant = this.trackedAddressesSet.has(fromLower) || this.trackedAddressesSet.has(toLower);

            // Debug log first 5 transfers + any that match "TE2"
            if (index < 5 || transfer.toAddress.toUpperCase().startsWith('TE2') || transfer.fromAddress.toUpperCase().startsWith('TE2')) {
                console.log(`\nTransfer ${index + 1}:`);
                console.log(`  From: ${transfer.fromAddress} (${fromLower})`);
                console.log(`  To: ${transfer.toAddress} (${toLower})`);
                console.log(`  Token: ${transfer.tokenSymbol}`);
                console.log(`  Contract: ${transfer.contractAddress}`);
                console.log(`  Amount: ${transfer.amount}`);
                console.log(`  TxID: ${transfer.transactionId}`);
                console.log(`  Relevant: ${isRelevant}`);
                if (transfer.toAddress.toUpperCase().startsWith('TE2') || transfer.fromAddress.toUpperCase().startsWith('TE2')) {
                    console.log(`  *** FOUND TE2 ADDRESS! ***`);
                }
            }

            return isRelevant;
        });

        console.log(`\nFiltered ${transfers.length} transfers -> ${relevant.length} relevant`);
        return relevant;
    }

    /**
     * Process and display transfers
     */
    processTransfers(transfers: TRC20Transfer[]) {
        console.log('\n=== Relevant TRC20 Transfers ===');

        for (const transfer of transfers) {
            const tokenDecimals = transfer.tokenDecimals || 6;
            const divisor = BigInt(10) ** BigInt(tokenDecimals);
            const formattedAmount = (Number(BigInt(transfer.amount)) / Number(divisor)).toFixed(6);

            const direction = this.trackedAddressesSet.has(transfer.toAddress.toLowerCase()) ? 'INCOMING' : 'OUTGOING';

            console.log(`\n--- ${direction} ${transfer.tokenSymbol} Transfer ---`);
            console.log(`Transaction: ${transfer.transactionId}`);
            console.log(`From: ${transfer.fromAddress}`);
            console.log(`To: ${transfer.toAddress}`);
            console.log(`Amount: ${formattedAmount} ${transfer.tokenSymbol}`);
            console.log(`Contract: ${transfer.contractAddress}`);
            console.log(`Block: ${transfer.blockNumber}`);
        }
    }

    /**
     * Scan a block for TRC20 transfers (SCALABLE APPROACH)
     */
    async scanBlock(blockNumber: number): Promise<void> {
        console.log(`\n=== Scanning Block ${blockNumber} for TRC20 Transfers ===`);
        console.log(`Tracked tokens: ${this.trackedTokens.size}`);
        console.log(`Tracked addresses: ${this.trackedAddressesSet.size}`);

        // Step 1: Get the entire block (ONE API call regardless of wallet count)
        const block = await this.getBlockByNumber(blockNumber);
        if (!block) {
            console.error(`Failed to fetch block ${blockNumber}`);
            return;
        }

        console.log(`Block contains ${block.transactions?.length || 0} transactions`);

        // Step 2: Extract ALL TRC20 transfers from the block
        const allTransfers = this.extractTRC20TransfersFromBlock(block);
        console.log(`Found ${allTransfers.length} TRC20 transfers in block`);

        if (allTransfers.length === 0) {
            console.log('No TRC20 transfers found in this block');
            return;
        }

        // Step 3: Filter for transfers involving tracked addresses
        const relevantTransfers = this.filterRelevantTransfers(allTransfers);
        console.log(`Found ${relevantTransfers.length} relevant transfers`);

        if (relevantTransfers.length === 0) {
            console.log('No relevant transfers for tracked addresses');
            return;
        }

        // Step 4: Process relevant transfers
        this.processTransfers(relevantTransfers);

        console.log(`\n=== Scan Complete ===`);
        console.log(`✅ Scalable: Only 1 API call regardless of wallet count`);
        console.log(`✅ Complete: Found all TRC20 transfers in block`);
        console.log(`✅ Efficient: Client-side filtering`);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: npx ts-node scripts/tron_block_scanner_simple.ts <blockNumber> <address1> [address2] ...');
        console.log('Example: npx ts-node scripts/tron_block_scanner_simple.ts 72966511 TE2sXtdsrFooxeF2nzANfadN73JvKmos3t');
        process.exit(1);
    }

    const blockNumber = parseInt(args[0]);
    const trackedAddresses = args.slice(1);

    if (isNaN(blockNumber)) {
        console.error('Invalid block number');
        process.exit(1);
    }

    try {
        const scanner = new SimpleTronBlockScanner();
        await scanner.initialize();
        scanner.setTrackedAddresses(trackedAddresses);

        await scanner.scanBlock(blockNumber);

    } catch (error) {
        console.error('Error during block scanning:', error);
        process.exit(1);
    }
}

main().catch(console.error); 