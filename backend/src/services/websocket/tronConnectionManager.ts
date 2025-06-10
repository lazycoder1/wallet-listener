import type { Hex } from 'viem'; // For trackedAddresses type consistency
import { config as appConfig } from '../../config';
// Import types from orchestrator - these will need to be exported from wsConnectionManager.ts
import type { UnifiedTransferEvent, EventHandlerCallback } from './wsConnectionManager';
import type { AddressManager } from '../address/addressManager';
import { NotificationService } from '../notification/notificationService';
import { TokenService } from '../token/tokenService';
import axios from 'axios';
import logger from '../../config/logger';
import * as TronWebLib from 'tronweb';

// Placeholder for Tron-specific client instance or connection references
// e.g., let tronWebsocketClient: any = null;

// Initialize TronWeb
// const tronWebInstance = new TronWebLib.TronWeb({
//     fullHost: appConfig.networks.tron.wsUrl || 'https://api.trongrid.io',
// });

// Utility to convert hex address (0x41...) to Base58 (T...)
// const hexToBase58 = (hexAddress: string): string => { ... }; 
// This logic will be moved into the new class method normalizeAndValidateTronAddress

interface TronTransaction {
    txID: string;
    blockNumber: number;
    blockTimeStamp: number;
    contractType: number;
    ownerAddress: string;
    toAddress?: string;
    amount?: number;
    contractData?: {
        contract_address: string;
        data: string;
    };
    contractRet: string;
}

interface TronTransferEvent {
    transaction_id: string;
    block_timestamp: number;
    block_number: number;
    contract_address: string;
    from_address: string;
    to_address: string;
    value: string;
    decimals: number;
    symbol: string;
    name: string;
    event_name: string;
}

interface TronApiResponse<T> {
    success: boolean;
    data: T[];
    meta?: {
        at: number;
        page_size: number;
    };
    error?: string;
}

interface TronTransactionFromBlock {
    txID: string;
    ret: { contractRet: string }[];
    raw_data: {
        contract: {
            type: string; // e.g., "TransferContract"
            parameter: {
                value: {
                    owner_address: string; // Hex format
                    to_address: string;    // Hex format
                    amount: number;
                };
            };
        }[];
        timestamp: number;
        // other raw_data fields if needed
    };
    // other transaction fields if needed
}

interface TronBlock {
    blockID: string;
    block_header: {
        raw_data: {
            number: number;
            timestamp: number;
            // other header fields if needed
        };
    };
    transactions?: TronTransactionFromBlock[];
}

export class TronConnectionManager {
    private addressManager: AddressManager;
    private eventHandler: EventHandlerCallback | null;
    private notificationService: NotificationService;
    private tokenService: TokenService;
    private tronWebInstance: TronWebLib.TronWeb; // Instance to be used

    // Polling intervals
    private blockPollingInterval: NodeJS.Timeout | null = null;
    // private tokenPollingInterval: NodeJS.Timeout | null = null; // Will be replaced by per-token intervals
    private perTokenPollingIntervals: Map<string, NodeJS.Timeout> = new Map();

    // Tracking state
    private lastProcessedBlockNumber = 0;
    // private lastProcessedTokenTimestamp = 0; // Will be replaced by per-token timestamps
    private tokenLastProcessedTimestamps: Map<string, number> = new Map(); // Key: tokenContractAddress, Value: timestamp

    private isPolling = false; // Used for native block polling
    private isInitialized = false; // New flag to track initialization

    // API configuration
    private readonly TOKEN_POLLING_INTERVAL_MS = 10000; // 10 seconds
    private readonly MAX_TRANSACTIONS_PER_REQUEST = 50;
    private readonly TRON_CHAIN_ID = 728126428; // Tron mainnet chain ID

    constructor(addressManager: AddressManager, handler: EventHandlerCallback | null) {
        this.addressManager = addressManager;
        this.eventHandler = handler;
        this.notificationService = NotificationService.getInstance();
        this.tokenService = TokenService.getInstance();
        this.tronWebInstance = new TronWebLib.TronWeb({ // Ensure tronWebInstance is initialized here
            fullHost: appConfig.networks.tron.wsUrl || 'https://api.trongrid.io',
            // It's good practice to also include a private key if you need to sign anything,
            // though for read-only operations it might not be strictly necessary.
            // privateKey: 'your_dummy_private_key_if_needed_for_some_calls' // Or leave out if not signing
        });

        // const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        // Initialize lastProcessedTokenTimestamp for each tracked token
        // This requires knowing the tracked tokens at construction or an init method.
        // For now, they will be initialized in startTokenPolling the first time.

        // REMOVED: this.initializeLastProcessedBlockNumber(); - Let start() handle initial call based on isInitialized flag
    }

    private normalizeAndValidateTronAddress(addressInput: string): string | null {
        if (typeof addressInput !== 'string') {
            logger.warn(`[TronAddr] Received non-string input for address validation: ${JSON.stringify(addressInput)}`);
            return null;
        }

        // 1. Handle Base58-like addresses (starts with T or t, length 34)
        if (addressInput.length === 34) {
            if (addressInput.startsWith('T')) {
                // Starts with 'T', check if valid as is.
                if (this.tronWebInstance.isAddress(addressInput)) {
                    // Already valid and in correct canonical 'T...' form.
                    return addressInput;
                } else {
                    logger.warn(`[TronAddr] Input '${addressInput}' (starts with 'T') failed tronWeb.isAddress() check.`);
                    return null;
                }
            } else if (addressInput.startsWith('t')) {
                // Starts with 't', attempt to canonicalize to 'T...' then validate.
                logger.debug(`[TronAddr] Input '${addressInput}' starts with 't'. Attempting canonicalization.`);
                try {
                    const hexAddress = this.tronWebInstance.address.toHex(addressInput);
                    const canonicalBase58 = this.tronWebInstance.address.fromHex(hexAddress);

                    if (this.tronWebInstance.isAddress(canonicalBase58) && canonicalBase58.startsWith('T')) {
                        logger.info(`[TronAddr] Successfully normalized '${addressInput}' to canonical form '${canonicalBase58}'.`);
                        return canonicalBase58;
                    } else {
                        logger.warn(`[TronAddr] Canonical form '${canonicalBase58}' for input '${addressInput}' is invalid or not standard 'T...' format.`);
                        return null;
                    }
                } catch (e: any) {
                    logger.warn(`[TronAddr] Error during canonicalization of lowercase Base58 address '${addressInput}': ${e.message}`);
                    return null;
                }
            }
            // If length is 34 but doesn't start with 'T' or 't', it's not a typical Tron Base58. Fall through.
        }

        // 2. Check if it's a Tron Hex address (41...) and convert to Base58 (T...)
        if (addressInput.length === 42 && addressInput.toLowerCase().startsWith('41')) {
            try {
                const base58Address = this.tronWebInstance.address.fromHex(addressInput);
                if (this.tronWebInstance.isAddress(base58Address) && base58Address.startsWith('T')) {
                    logger.debug(`[TronAddr] Converted hex address '${addressInput}' to Base58 '${base58Address}'.`);
                    return base58Address;
                } else {
                    logger.warn(`[TronAddr] Hex '${addressInput}' converted to Base58 '${base58Address}', but it's invalid or not standard 'T...' format.`);
                    return null;
                }
            } catch (e: any) {
                logger.warn(`[TronAddr] Error converting Tron hex '${addressInput}' to Base58: ${e.message}`);
                return null;
            }
        }

        // 3. If it's an EVM address (0x...)
        if (addressInput.startsWith('0x')) {
            // logger.debug(`[TronAddr] Ignoring EVM address for Tron operations: ${addressInput}`);
            return null;
        }

        logger.warn(`[TronAddr] Unrecognized address format, not processed for Tron: '${addressInput}'`);
        return null;
    }

    private async initializeLastProcessedBlockNumber() {
        try {
            const response = await axios.post(`${appConfig.networks.tron.wsUrl}/wallet/getnowblock`, {},
                {
                    headers: appConfig.networks.tron.apiKey ? { 'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey } : undefined
                }
            );
            const block = response.data as TronBlock;
            if (block && block.block_header && block.block_header.raw_data && block.block_header.raw_data.number) {
                // Start from 5 minutes ago worth of blocks, or current if that's too far back/complex to calculate initially
                // For now, set to current block number minus a small buffer to avoid missing blocks during init.
                // A common strategy is current block - N blocks, or find a block ~5 mins ago.
                // Simplified: current block - 100 (approx 5 mins if 3s block time)
                this.lastProcessedBlockNumber = Math.max(0, block.block_header.raw_data.number - 100);
                logger.info(`Initialized lastProcessedBlockNumber to ${this.lastProcessedBlockNumber}`);
            } else {
                logger.warn('Could not fetch current block to initialize lastProcessedBlockNumber, starting from 0.');
                this.lastProcessedBlockNumber = 0;
            }
        } catch (error) {
            logger.error('Error initializing lastProcessedBlockNumber:', error);
            this.lastProcessedBlockNumber = 0; // Fallback
        }
    }

    /**
     * Start polling for Tron transactions
     */
    public async start(): Promise<void> {
        logger.info('Starting unified Tron block-based monitoring');

        if (this.addressManager.getTrackedAddressCount() === 0) {
            logger.warn('No wallet addresses being tracked. Tron polling will start but filtering might be empty.');
        }

        // Only initialize if not already done
        if (!this.isInitialized) {
            await this.initializeLastProcessedBlockNumber();
        }

        // Start unified block polling for BOTH native TRX and TRC20 transfers
        this.startBlockPolling();

        // Stop any legacy token polling intervals
        this.stopLegacyTokenPolling();

        this.isInitialized = true;
        logger.info('Unified Tron block-based monitoring started - tracking both TRX and TRC20 transfers');
    }

    /**
     * Stop legacy per-token polling intervals (no longer needed with block-based approach)
     */
    private stopLegacyTokenPolling(): void {
        for (const [contractAddress, interval] of this.perTokenPollingIntervals) {
            clearInterval(interval);
            logger.debug(`Stopped legacy polling for token contract: ${contractAddress}`);
        }
        this.perTokenPollingIntervals.clear();
    }

    /**
     * Start unified block polling to detect both native TRX and TRC20 transfers
     */
    private startBlockPolling(): void {
        if (this.blockPollingInterval) {
            clearInterval(this.blockPollingInterval);
            this.blockPollingInterval = null;
        }

        this.blockPollingInterval = setInterval(async () => {
            if (this.isPolling) {
                logger.debug('Previous polling operation still in progress, skipping this cycle');
                return;
            }

            this.isPolling = true;
            try {
                await this.checkForNewBlocks();
            } catch (error) {
                logger.error('Error polling for Tron transactions:', error);
            } finally {
                this.isPolling = false;
            }
        }, appConfig.networks.tron.tronNativePollingIntervalMs || 3000);

        logger.info(`Unified block polling started with interval of ${appConfig.networks.tron.tronNativePollingIntervalMs || 3000}ms - monitoring TRX + TRC20`);
    }

    /**
     * Check for new transactions by polling new blocks - UNIFIED APPROACH
     * This method now handles BOTH native TRX and TRC20 transfers in a single block scan
     */
    private async checkForNewBlocks(): Promise<void> {
        let currentBlockNumber = 0;
        try {
            const nowResponse = await axios.post(`${appConfig.networks.tron.wsUrl}/wallet/getnowblock`, {},
                {
                    headers: appConfig.networks.tron.apiKey ? { 'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey } : undefined,
                    timeout: 5000 // 5 second timeout for this critical call
                }
            );
            const nowBlock = nowResponse.data as TronBlock;
            if (!nowBlock || !nowBlock.block_header || !nowBlock.block_header.raw_data || typeof nowBlock.block_header.raw_data.number !== 'number') {
                logger.warn('Could not get current block number from getnowblock', nowBlock);
                return;
            }
            currentBlockNumber = nowBlock.block_header.raw_data.number;
        } catch (error) {
            logger.error('Error fetching current block number (getnowblock):', error);
            if (this.lastProcessedBlockNumber === 0) throw error;
            logger.warn(`Proceeding with last known lastProcessedBlockNumber: ${this.lastProcessedBlockNumber} due to getnowblock failure.`);
            currentBlockNumber = this.lastProcessedBlockNumber;
        }

        if (currentBlockNumber <= this.lastProcessedBlockNumber) {
            return;
        }

        const batchSize = 10; // Default batch size
        const blocksToProcessThisCycle = Math.min(batchSize, currentBlockNumber - this.lastProcessedBlockNumber);
        const endBlock = this.lastProcessedBlockNumber + blocksToProcessThisCycle;

        logger.info(`New blocks detected. Current: ${currentBlockNumber}, Last Processed: ${this.lastProcessedBlockNumber}. Processing blocks from ${this.lastProcessedBlockNumber + 1} to ${endBlock} (up to ${blocksToProcessThisCycle} blocks).`);

        // Get tracked addresses and tokens
        const trackedAddresses = this.addressManager.getTrackedAddresses();
        const validTronAddresses = trackedAddresses
            .map(addr => this.normalizeAndValidateTronAddress(addr))
            .filter((addr): addr is string => addr !== null);
        const trackedAddressesSet = new Set(validTronAddresses.map(addr => addr.toLowerCase()));

        // Get tracked TRC20 tokens
        const tronTokens = await this.tokenService.getTronTokens();
        const trackedTokenContracts = new Map<string, any>();
        for (const token of tronTokens) {
            const tronAddress = token.addresses.find((addr: any) => addr.chain === 'tron');
            if (tronAddress) {
                trackedTokenContracts.set(tronAddress.address.toLowerCase(), token);
            }
        }

        logger.info(`[Tron Block Scanner] Processing ${blocksToProcessThisCycle} blocks. Tracking ${trackedAddressesSet.size} addresses and ${trackedTokenContracts.size} token contracts.`);

        if (trackedAddressesSet.size === 0) {
            logger.warn('[Tron Block Scanner] No valid addresses to track. Skipping block processing.');
            this.lastProcessedBlockNumber = endBlock;
            return;
        }

        for (let blockNum = this.lastProcessedBlockNumber + 1; blockNum <= endBlock; blockNum++) {
            try {
                await this.processBlock(blockNum, trackedAddressesSet, trackedTokenContracts);
            } catch (error: any) {
                logger.error(`Error processing block ${blockNum}:`, error.message);
            }
        }
        this.lastProcessedBlockNumber = endBlock;
    }

    /**
     * Process a single block for both native TRX and TRC20 transfers
     */
    private async processBlock(
        blockNum: number,
        trackedAddressesSet: Set<string>,
        trackedTokenContracts: Map<string, any>
    ): Promise<void> {
        const blockResponse = await axios.post(`${appConfig.networks.tron.wsUrl}/wallet/getblockbynum`,
            { num: blockNum },
            {
                headers: appConfig.networks.tron.apiKey ? { 'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey } : undefined,
                timeout: 10000
            }
        );
        const block = blockResponse.data as TronBlock;

        if (!block || !block.transactions) {
            logger.warn(`Block ${blockNum} has no transactions or block data is malformed.`);
            return;
        }

        logger.debug(`Processing block ${blockNum} with ${block.transactions.length} transaction(s).`);

        let nativeTransfers = 0;
        let trc20Transfers = 0;

        for (const tx of block.transactions) {
            if (!tx.ret || !tx.ret[0] || tx.ret[0].contractRet !== 'SUCCESS' || !tx.raw_data || !tx.raw_data.contract) {
                continue;
            }

            for (const contract of tx.raw_data.contract) {
                try {
                    // Process Native TRX Transfers
                    if (contract.type === 'TransferContract' && contract.parameter && contract.parameter.value) {
                        const transferred = await this.processNativeTransferFromBlock(
                            tx, contract, blockNum, trackedAddressesSet
                        );
                        if (transferred) nativeTransfers++;
                    }

                    // Process TRC20 Transfers (NEW BLOCK-BASED APPROACH)
                    else if (contract.type === 'TriggerSmartContract' && contract.parameter && contract.parameter.value) {
                        const transferred = await this.processTRC20TransferFromBlock(
                            tx, contract, blockNum, trackedAddressesSet, trackedTokenContracts
                        );
                        if (transferred) trc20Transfers++;
                    }
                } catch (error: any) {
                    logger.warn(`Error processing contract in block ${blockNum}, tx ${tx.txID}:`, error.message);
                }
            }
        }

        if (nativeTransfers > 0 || trc20Transfers > 0) {
            logger.info(`Block ${blockNum}: Found ${nativeTransfers} native TRX transfers and ${trc20Transfers} TRC20 transfers`);
        }
    }

    /**
     * Process native TRX transfer from block data
     */
    private async processNativeTransferFromBlock(
        tx: TronTransactionFromBlock,
        contract: any,
        blockNum: number,
        trackedAddressesSet: Set<string>
    ): Promise<boolean> {
        if (!contract.parameter.value.to_address) return false;

        try {
            const toAddressHex = contract.parameter.value.to_address;
            const toAddressBase58 = this.tronWebInstance.address.fromHex(toAddressHex);

            if (trackedAddressesSet.has(toAddressBase58.toLowerCase())) {
                logger.info(`[TRON NATIVE] Block: ${blockNum}, TX: ${tx.txID}, To: ${toAddressBase58}, Amount: ${contract.parameter.value.amount / 1_000_000} TRX`);

                const tronTx: TronTransaction = {
                    txID: tx.txID,
                    blockNumber: blockNum,
                    blockTimeStamp: tx.raw_data.timestamp,
                    contractType: 1,
                    ownerAddress: this.tronWebInstance.address.fromHex(contract.parameter.value.owner_address),
                    toAddress: toAddressBase58,
                    amount: contract.parameter.value.amount,
                    contractRet: 'SUCCESS'
                };
                await this.processNativeTransfer(tronTx);
                return true;
            }
        } catch (error: any) {
            logger.warn(`Error processing native transfer in block ${blockNum}, tx ${tx.txID}:`, error.message);
        }
        return false;
    }

    /**
     * Process TRC20 transfer from block data - NEW SCALABLE APPROACH
     */
    private async processTRC20TransferFromBlock(
        tx: TronTransactionFromBlock,
        contract: any,
        blockNum: number,
        trackedAddressesSet: Set<string>,
        trackedTokenContracts: Map<string, any>
    ): Promise<boolean> {
        try {
            const contractData = contract.parameter.value;
            const contractAddress = contractData.contract_address;

            if (!contractAddress) return false;

            // Convert contract address to base58
            const contractAddressBase58 = this.tronWebInstance.address.fromHex(contractAddress);

            // Check if this is a tracked token contract
            if (!trackedTokenContracts.has(contractAddressBase58.toLowerCase())) {
                return false;
            }

            // Decode the transfer data
            const transferData = this.decodeTRC20Transfer(contractData.data);
            if (!transferData) return false;

            // Get addresses
            const fromAddress = this.tronWebInstance.address.fromHex(contractData.owner_address);
            const toAddress = transferData.to; // Already converted to base58 in decodeTRC20Transfer

            // Check if transfer involves tracked addresses
            const isRelevant = trackedAddressesSet.has(fromAddress.toLowerCase()) ||
                trackedAddressesSet.has(toAddress.toLowerCase());

            if (!isRelevant) return false;

            // Get token info
            const tokenInfo = trackedTokenContracts.get(contractAddressBase58.toLowerCase());

            logger.info(`[TRON TRC20] Block: ${blockNum}, TX: ${tx.txID}, From: ${fromAddress}, To: ${toAddress}, Token: ${tokenInfo.symbol}, Amount: ${transferData.amount}`);

            // Create TronTransferEvent compatible object
            const transferEvent: TronTransferEvent = {
                transaction_id: tx.txID,
                block_timestamp: tx.raw_data.timestamp,
                block_number: blockNum,
                contract_address: contractAddressBase58,
                from_address: fromAddress,
                to_address: toAddress,
                value: transferData.amount,
                decimals: tokenInfo.decimals,
                symbol: tokenInfo.symbol,
                name: tokenInfo.name,
                event_name: 'Transfer'
            };

            // Process the transfer
            await this.processTokenTransfer(transferEvent, toAddress);
            return true;

        } catch (error: any) {
            logger.warn(`Error processing TRC20 transfer in block ${blockNum}, tx ${tx.txID}:`, error.message);
            return false;
        }
    }

    /**
     * Decode TRC20 transfer function call data
     * Transfer function signature: transfer(address _to, uint256 _value)
     * Method ID: a9059cbb
     */
    private decodeTRC20Transfer(data: string): { from: string; to: string; amount: string } | null {
        try {
            if (!data || data.length < 8) return null;

            // Check if this is a transfer method call (a9059cbb)
            const methodId = data.slice(0, 8);
            if (methodId !== 'a9059cbb') return null;

            // Extract parameters (each parameter is 32 bytes / 64 hex chars)
            const toAddressHex = data.slice(8, 72);   // First parameter: to address
            const amount = data.slice(72, 136);       // Second parameter: amount

            // Convert address from padded hex to proper format
            // Remove leading zeros and add '41' prefix for TRON addresses
            const addressWithoutPadding = toAddressHex.slice(-40); // Last 40 hex chars (20 bytes)
            const tronAddress = '41' + addressWithoutPadding;      // Add TRON address prefix

            // Convert to base58 TRON address format
            const toAddress = this.tronWebInstance.address.fromHex(tronAddress);

            return {
                from: '', // Will be filled from transaction sender (owner_address)
                to: toAddress,
                amount: BigInt('0x' + amount).toString()
            };
        } catch (error) {
            logger.warn(`Error decoding TRC20 transfer data: ${data}`, error);
            return null;
        }
    }

    /**
     * Process transactions for a specific address - NO LONGER USED FOR NATIVE TRX
     * This method was part of the old strategy of polling each address.
     * It's kept here for reference or if a hybrid approach is ever needed, but is not called by checkForNewBlocks.
     */
    private async processAddressTransactions(address: string): Promise<void> {
        logger.warn('processAddressTransactions is deprecated for native TRX monitoring and should not be called.');
        // Original implementation (now unused for native TRX):
        /*
        try {
            const url = `${appConfig.networks.tron.wsUrl}/v1/accounts/${address}/transactions`;
            const response = await axios.get(url, {
                params: {
                    min_timestamp: this.lastProcessedBlockTimestamp,
                    only_to: true,
                    limit: this.MAX_TRANSACTIONS_PER_REQUEST,
                    order_by: 'block_timestamp,asc'
                },
                headers: appConfig.networks.tron.apiKey ? {
                    'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey
                } : undefined
            });

            const apiResponse = response.data as TronApiResponse<TronTransaction>;

            if (!apiResponse.success || !apiResponse.data) {
                logger.warn(`Failed to get transactions for ${address}: ${apiResponse.error || 'Unknown error'}`);
                return;
            }

            const transactions = apiResponse.data;

            if (transactions.length > 0) {
                logger.info(`Found ${transactions.length} new transactions for ${address}`);

                const lastTx = transactions[transactions.length - 1];
                if (lastTx.blockTimeStamp > this.lastProcessedBlockTimestamp) {
                    this.lastProcessedBlockTimestamp = lastTx.blockTimeStamp;
                }

                for (const tx of transactions) {
                    if (tx.contractRet !== 'SUCCESS') continue;
                    if (tx.contractType === 1 && tx.toAddress === address) {
                        await this.processNativeTransfer(tx);
                    }
                }
            }
        } catch (error) {
            logger.error(`Error processing transactions for ${address}:`, error);
            throw error;
        }
        */
    }

    /**
     * Process a native TRX transfer
     */
    private async processNativeTransfer(tx: TronTransaction): Promise<void> {
        if (!this.eventHandler) return;

        try {
            const amount = tx.amount || 0;
            const fromAddress = tx.ownerAddress; // This is Base58 from adaptedTx
            const toAddress = tx.toAddress!;   // This is Base58 from adaptedTx

            logger.debug(`[Tron] Native TRX transfer: ${fromAddress} -> ${toAddress}, Amount: ${amount / 1_000_000} TRX`);

            // Get TRX price and decimals for USD value calculation
            const trxTokenInfo = await this.tokenService.getToken('TRX', 'tron');
            const tokenDecimals = trxTokenInfo?.decimals ?? 6; // Default TRX decimals to 6 if not found
            const tokenPrice = trxTokenInfo?.price ?? 0; // Default price to 0 if not found

            const formattedAmount = (amount / Math.pow(10, tokenDecimals)).toString();
            const usdValue = tokenPrice ? (amount / Math.pow(10, tokenDecimals)) * tokenPrice : 0;

            // Send notification
            await this.notificationService.notifyDeposit(
                toAddress, // recipientAddress
                amount.toString(), // rawValue
                formattedAmount, // formattedValue
                'TRX', // tokenSymbol
                tokenDecimals, // tokenDecimals
                'TRX', // tokenContractAddress (native token symbol, or undefined)
                usdValue, // usdValue
                tx.txID, // transactionHash
                fromAddress, // senderAddress
                BigInt(tx.blockNumber), // blockNumber
                { // depositContext
                    chainId: this.TRON_CHAIN_ID.toString(),
                    chainName: 'Tron',
                    chainType: 'TRON'
                }
            );

            // Convert addresses to hex format for consistency with EVM chains
            const fromHex = ('0x' + this.tronWebInstance.address.toHex(fromAddress)) as Hex;
            const toHex = ('0x' + this.tronWebInstance.address.toHex(toAddress)) as Hex;

            // Emit event
            this.eventHandler({
                type: 'NATIVE',
                chainId: this.TRON_CHAIN_ID,
                data: {
                    from: fromHex,
                    to: toHex,
                    value: BigInt(amount),
                    hash: tx.txID as Hex,
                    blockNumber: BigInt(tx.blockNumber)
                }
            });
        } catch (error) {
            logger.error('Error processing native TRX transfer:', error);
        }
    }

    /**
     * Stop all polling
     */
    public stop(): void {
        logger.info('Stopping unified Tron block-based monitoring');

        if (this.blockPollingInterval) {
            clearInterval(this.blockPollingInterval);
            this.blockPollingInterval = null;
        }

        // Stop any legacy token polling intervals
        this.stopLegacyTokenPolling();

        logger.info('Unified Tron block-based monitoring stopped');
    }

    // --- DEPRECATED METHODS (kept for reference during transition) ---
    // The following methods are no longer used with the unified block-based approach
    // but are kept temporarily for reference during the transition period.

    /**
     * DEPRECATED: Legacy per-token contract polling approach
     * Replaced by unified block scanning in checkForNewBlocks()
     */
    private async startAllTokenContractPolling(): Promise<void> {
        logger.warn('[Tron] startAllTokenContractPolling is deprecated. TRC20 transfers are now handled in unified block scanning.');
    }

    /**
     * DEPRECATED: Legacy individual token polling
     * Replaced by unified block scanning in checkForNewBlocks()
     */
    private startIndividualTokenPolling(contractAddress: string, symbol: string, decimals: number): void {
        logger.warn(`[Tron] startIndividualTokenPolling is deprecated for ${symbol}. TRC20 transfers are now handled in unified block scanning.`);
    }

    private async fetchAndProcessTransfersForToken(contractAddress: string, symbol: string, decimals: number): Promise<void> {
        const lastTimestamp = this.tokenLastProcessedTimestamps.get(contractAddress) || (Date.now() - 5 * 60 * 1000);

        const trackedAddressesFromManager = this.addressManager.getTrackedAddresses();
        const validTronBase58TrackedAddresses = trackedAddressesFromManager
            .map(addr => this.normalizeAndValidateTronAddress(addr)) // USE NEW METHOD
            .filter((addr): addr is string => addr !== null);      // Filter out nulls
        const trackedWalletAddressesSet = new Set(validTronBase58TrackedAddresses);

        if (trackedWalletAddressesSet.size === 0) {
            // logger.debug(`[Tron] No wallet addresses currently tracked. Skipping TRC20 fetch for ${symbol}.`);
            return;
        }

        try {
            const baseUrl = (appConfig.tronScan.apiUrl || 'https://apilist.tronscanapi.com').replace(/\/$/, '');
            const url = `${baseUrl}/api/token_trc20/transfers`;

            const response = await axios.get(url, {
                params: {
                    contract_address: contractAddress,
                    start_timestamp: lastTimestamp + 1,
                    limit: 100, // Fetch a reasonable number of records (TronScan max might be 50 or 100)
                    // sort: 'timestamp,asc', // TronScan default is usually descending, check API for sorting if needed
                    // If descending: fetch, reverse, then process.
                    confirm: '0', // Fetch only confirmed transfers
                    // direction: 'in' // Omit to get all transfers, then filter by 'to_address' client-side
                },
                headers: appConfig.tronScan.apiKey ? { 'TRON-PRO-API-KEY': appConfig.tronScan.apiKey } : undefined,
                timeout: 15000 // 15s timeout for TronScan API calls
            });

            const apiResponse = response.data as { success?: boolean, data?: TronTransferEvent[], total?: number, error?: string };

            if (!apiResponse.success || !Array.isArray(apiResponse.data)) {
                logger.warn(`[TronScan] Failed to get TRC20 transfers for ${symbol} (${contractAddress}): ${apiResponse.error || 'Invalid data format or API request not successful'}. Data: ${JSON.stringify(apiResponse)}`);
                return;
            }

            const transfers = apiResponse.data; // These are all transfers for the token contract
            if (transfers.length === 0) {
                // logger.debug(`[TronScan] No new TRC20 transfers found for ${symbol} (${contractAddress}) since timestamp ${lastTimestamp}.`);
                return;
            }

            logger.info(`[TronScan] Fetched ${transfers.length} TRC20 transfers for ${symbol} (${contractAddress}). Filtering...`);

            let newLastTimestamp = lastTimestamp;
            let relevantTransfersCount = 0;

            // Process in chronological order if API returns that way, or sort if needed.
            // Assuming API returns them in a somewhat sensible order (e.g. by block_timestamp)
            // If API returns descending, you might want to reverse the array first: transfers.reverse();

            for (const transfer of transfers) {
                // TronScan API for TRC20 transfers usually gives addresses in Base58 (T...) format directly.
                // Validate it before use.
                const toAddressFromApi = transfer.to_address;
                const validatedToAddressBase58 = this.normalizeAndValidateTronAddress(toAddressFromApi);

                // const fromAddressFromApi = transfer.from_address; 
                // const validatedFromAddressBase58 = this.normalizeAndValidateTronAddress(fromAddressFromApi); 

                if (validatedToAddressBase58 && trackedWalletAddressesSet.has(validatedToAddressBase58)) {
                    // logger.debug(`[Tron] Relevant TRC20 transfer to ${validatedToAddressBase58} for token ${symbol}:`, transfer);
                    await this.processTokenTransfer(transfer, validatedToAddressBase58); // Pass validated address 
                    relevantTransfersCount++;
                }
                // Update timestamp with the timestamp of the last event processed in this batch
                if (transfer.block_timestamp > newLastTimestamp) {
                    newLastTimestamp = transfer.block_timestamp;
                }
            }

            if (relevantTransfersCount > 0) {
                logger.info(`[TronScan] Processed ${relevantTransfersCount} relevant TRC20 transfers for ${symbol} (${contractAddress}).`);
            }

            if (newLastTimestamp > lastTimestamp) {
                this.tokenLastProcessedTimestamps.set(contractAddress, newLastTimestamp);
                // logger.debug(`[Tron] Updated last processed timestamp for ${symbol} (${contractAddress}) to ${newLastTimestamp}`);
            }

        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                logger.error(`[TronScan] Axios error fetching TRC20 transfers for ${symbol} (${contractAddress}) (status: ${error.response.status}):`, error.response.data);
            } else {
                logger.error(`[TronScan] Error fetching TRC20 transfers for ${symbol} (${contractAddress}):`, error.message);
            }
        }
    }

    /**
     * DEPRECATED: Check for TRC20 token transfers using per-address approach  
     * Replaced by unified block scanning in checkForNewBlocks()
     */
    private async checkForTokenTransfers(): Promise<void> {
        logger.warn('[Tron] checkForTokenTransfers is deprecated. TRC20 transfers are now handled in unified block scanning.');
    }

    /**
     * DEPRECATED: Process token transfers for a specific address
     * Replaced by unified block scanning in checkForNewBlocks()
     */
    private async processAddressTokenTransfers(address: string, tronTokens: any[]): Promise<void> {
        logger.warn('[Tron] processAddressTokenTransfers is deprecated. TRC20 transfers are now handled in unified block scanning.');
    }

    /**
     * Process a TRC20 token transfer (already filtered to be relevant by new strategy)
     */
    private async processTokenTransfer(transfer: TronTransferEvent, validatedToAddressBase58: string): Promise<void> {
        if (!this.eventHandler) return;

        try {
            // Fetch token details from TokenService first, fallback to event data
            const tokenInfoFromDb = await this.tokenService.getTokenByAddress('tron', transfer.contract_address);

            // Only track and notify for known tokens that we have in our database
            if (!tokenInfoFromDb) {
                // Log unknown token for future reference, but don't send notification
                const rawAmount = transfer.value;
                const numericAmount = BigInt(rawAmount);
                const decimalsFromApi = transfer.decimals ?? 6; // TRX/USDT typically use 6 decimals
                const formattedAmount = (Number(numericAmount) / Math.pow(10, decimalsFromApi)).toString();

                logger.info(`[Tron] Unknown TRC20 token transfer detected:`, {
                    tokenContract: transfer.contract_address,
                    to: validatedToAddressBase58,
                    from: transfer.from_address,
                    amount: formattedAmount,
                    symbol: transfer.symbol || 'Unknown',
                    transactionHash: transfer.transaction_id,
                    blockNumber: transfer.block_number,
                    chainId: this.TRON_CHAIN_ID
                });
                return; // Skip notification for unknown tokens
            }

            const tokenSymbol = tokenInfoFromDb.symbol;
            const tokenDecimals = tokenInfoFromDb.decimals;
            const tokenPrice = tokenInfoFromDb.price || 0;

            const rawAmount = transfer.value; // String as per TronTransferEvent
            const numericAmount = BigInt(rawAmount);

            let formattedAmount = '0';
            if (tokenDecimals > 0) {
                const divisor = BigInt(10) ** BigInt(tokenDecimals);
                // Handle potential for floating point by doing division then toString.
                // For very large numbers or high precision, a BigNumber library would be better.
                const quotient = Number(numericAmount) / Number(divisor);
                formattedAmount = quotient.toString();
            } else {
                formattedAmount = numericAmount.toString();
            }

            const usdValue = tokenPrice ? (Number(numericAmount) / Math.pow(10, tokenDecimals)) * tokenPrice : 0;

            let senderAddressBase58 = transfer.from_address;
            // Ensure from_address (sender) is Base58; TronScan API usually provides Base58 for from/to in TRC20 transfers
            // but if it were hex (e.g. 41...), convert it.
            if (this.tronWebInstance.utils.isHex(senderAddressBase58) && senderAddressBase58.toLowerCase().startsWith('41')) {
                try {
                    senderAddressBase58 = this.tronWebInstance.address.fromHex(senderAddressBase58);
                } catch (e) {
                    logger.warn(`[Tron] Failed to convert sender hex ${transfer.from_address} to Base58 in processTokenTransfer. Using original.`);
                }
            }

            logger.debug(`[Tron] TRC20 transfer: ${senderAddressBase58} -> ${validatedToAddressBase58}, Value: ${rawAmount} (${formattedAmount} ${tokenSymbol}), Contract: ${transfer.contract_address}`);

            await this.notificationService.notifyDeposit(
                validatedToAddressBase58,       // recipientAddress
                rawAmount,                      // rawValue
                formattedAmount,                // formattedValue
                tokenSymbol,                    // tokenSymbol
                tokenDecimals,                  // tokenDecimals
                transfer.contract_address,      // tokenContractAddress
                usdValue,                       // usdValue
                transfer.transaction_id,        // transactionHash
                senderAddressBase58,            // senderAddress
                BigInt(transfer.block_number),  // blockNumber
                { // depositContext
                    chainId: this.TRON_CHAIN_ID.toString(),
                    chainName: 'Tron',
                    chainType: 'TRON'
                }
            );

            // Convert addresses to hex format for consistency with EVM chains
            const fromHex = ('0x' + this.tronWebInstance.address.toHex(senderAddressBase58)) as Hex;
            const toHex = ('0x' + this.tronWebInstance.address.toHex(validatedToAddressBase58)) as Hex;
            const tokenHex = ('0x' + this.tronWebInstance.address.toHex(transfer.contract_address)) as Hex;

            // Emit event
            this.eventHandler({
                type: 'ERC20',
                chainId: this.TRON_CHAIN_ID,
                data: {
                    from: fromHex,
                    to: toHex,
                    value: BigInt(numericAmount),
                    transactionHash: transfer.transaction_id as Hex,
                    blockNumber: BigInt(transfer.block_number),
                    logIndex: 0, // Tron doesn't have log indices
                    tokenContract: tokenHex
                }
            });
        } catch (error) {
            logger.error('Error processing TRC20 token transfer:', error);
        }
    }

    /**
     * Update connections with a new event handler
     */
    public updateConnections(newEventHandler?: EventHandlerCallback | null): void {
        this.eventHandler = newEventHandler === undefined ? this.eventHandler : newEventHandler;
        // No immediate re-initialization needed for Tron, as polling loops will pick up changes.
        logger.info('[Tron] Connections updated (event handler potentially changed).');
    }

    // This method is called by WsConnectionManager when its list of addresses changes.
    // newAddressesHint contains ALL addresses from AddressManager (EVM, Tron, etc.)
    public updateTrackedAddresses(newAddressesHint: string[], newEventHandler?: EventHandlerCallback | null): void {
        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }
        logger.info(`[Tron] Received address update hint. Total hints: ${newAddressesHint.length}. Current tracked: ${this.addressManager.getTrackedAddressCount()}`);
        // The AddressManager (which is shared) has already been updated by WsConnectionManager.
        // TronConnectionManager relies on this.addressManager.getTrackedAddresses() which will reflect the latest.
        // It then internally filters these for valid Tron addresses using normalizeAndValidateTronAddress.

        // If polling logic needs to be reset or specifically restarted for certain tokens due to address changes,
        // that logic would go here. For example, restart polling for tokens if new addresses are added.
        // For now, the existing polling loops will use the updated address list from AddressManager.

        // Example: If a full restart of token polling is desired on any address change:
        // this.stopAllTokenContractPolling(); // Stop existing token polls
        // this.startAllTokenContractPolling(); // Restart with new addresses from AddressManager
        logger.info("[Tron] Tracked addresses updated. Polling loops will use the new list.");
    }
} 