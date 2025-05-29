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

        // 1. Check if it's already a valid Tron Base58 address (T...)
        if (addressInput.startsWith('T') && addressInput.length === 34) {
            if (this.tronWebInstance.isAddress(addressInput)) {
                return addressInput; // Already valid and in correct case
            } else {
                // This case implies it looks like Base58 but is invalid (e.g. checksum error, wrong chars)
                logger.warn(`[TronAddr] Invalid or incorrectly cased Tron Base58 address: ${addressInput}`);
                return null;
            }
        }

        // 2. Check if it's a Tron Hex address (41...)
        // Tron hex addresses are 42 chars (41 + 40 hex chars).
        // Convert to lowercase for the startsWith check for robustness, though tronWeb.address.fromHex might handle mixed case.
        if (addressInput.length === 42 && addressInput.toLowerCase().startsWith('41')) {
            try {
                const base58Address = this.tronWebInstance.address.fromHex(addressInput);
                // Double check if the conversion resulted in a valid address
                if (this.tronWebInstance.isAddress(base58Address)) {
                    return base58Address;
                } else {
                    logger.warn(`[TronAddr] Hex ${addressInput} converted to invalid/malformed Base58: ${base58Address}`);
                    return null;
                }
            } catch (e: any) {
                logger.warn(`[TronAddr] Error converting Tron hex ${addressInput} to Base58: ${e.message}`);
                return null;
            }
        }

        // 3. If it's an EVM address (0x...) or other format, ignore for Tron context.
        if (addressInput.startsWith('0x')) {
            // logger.debug(`[TronAddr] Ignoring EVM address for Tron operations: ${addressInput}`);
            return null;
        }

        // For any other unrecognized formats from AddressManager
        // logger.warn(`[TronAddr] Unrecognized address format, ignoring for Tron: ${addressInput}`);
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
    public async start(): Promise<void> { // Added async
        logger.info('Starting Tron transaction polling');

        if (this.addressManager.getTrackedAddressCount() === 0) {
            logger.warn('No wallet addresses being tracked. Tron polling will start but TRC20 filtering might be empty.');
        }

        // Only initialize if not already done
        if (!this.isInitialized) {
            await this.initializeLastProcessedBlockNumber(); // Make sure this is awaited if it becomes async
        }

        // Start polling for native TRX transfers
        this.startBlockPolling();

        // Start polling for TRC20 token transfers (per token)
        await this.startAllTokenContractPolling(); // Changed from startTokenPolling

        this.isInitialized = true; // Set flag after successful start
        logger.info('Tron transaction polling started/updated');
    }

    /**
     * Start polling for new blocks to detect native TRX transfers
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
        }, appConfig.networks.tron.tronNativePollingIntervalMs || 3000); // Use config value

        logger.info(`Block polling started with interval of ${appConfig.networks.tron.tronNativePollingIntervalMs || 3000}ms`);
    }

    /**
     * Check for new native TRX transactions by polling new blocks.
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
            throw error; // Propagate to trigger failure count and pause
        }

        if (currentBlockNumber <= this.lastProcessedBlockNumber) {
            // logger.debug(`No new blocks to process. Current: ${currentBlockNumber}, Last Processed: ${this.lastProcessedBlockNumber}`);
            return;
        }

        logger.info(`New blocks detected. Current: ${currentBlockNumber}, Last Processed: ${this.lastProcessedBlockNumber}. Processing up to ${Math.min(this.lastProcessedBlockNumber + 10, currentBlockNumber)} blocks this cycle.`);

        // Process a limited number of blocks per cycle to avoid overly long operations
        const endBlock = Math.min(this.lastProcessedBlockNumber + 10, currentBlockNumber); // Process max 10 blocks per cycle

        for (let blockNum = this.lastProcessedBlockNumber + 1; blockNum <= endBlock; blockNum++) {
            try {
                const blockResponse = await axios.post(`${appConfig.networks.tron.wsUrl}/wallet/getblockbynum`,
                    { num: blockNum },
                    {
                        headers: appConfig.networks.tron.apiKey ? { 'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey } : undefined,
                        timeout: 10000 // 10 second timeout for fetching a block
                    }
                );
                const block = blockResponse.data as TronBlock;

                if (!block || !block.transactions) {
                    // logger.debug(`Block ${blockNum} has no transactions or is empty.`);
                    continue;
                }

                logger.info(`Processing block ${blockNum} with ${block.transactions.length} transaction(s).`);

                const trackedAddressesBase58 = this.addressManager.getTrackedAddresses()
                    .map(addr => this.normalizeAndValidateTronAddress(addr)) // USE NEW METHOD
                    .filter((addr): addr is string => addr !== null);      // Filter out nulls

                if (trackedAddressesBase58.length === 0) {
                    // logger.debug('No Tron addresses being tracked, skipping transaction processing in block.');
                    continue;
                }

                for (const tx of block.transactions) {
                    if (tx.ret && tx.ret[0] && tx.ret[0].contractRet === 'SUCCESS' && tx.raw_data && tx.raw_data.contract) {
                        for (const contract of tx.raw_data.contract) {
                            if (contract.type === 'TransferContract' &&
                                contract.parameter && contract.parameter.value) {

                                const ownerAddressHex = contract.parameter.value.owner_address;
                                const toAddressHex = contract.parameter.value.to_address;
                                const amount = contract.parameter.value.amount;

                                if (!toAddressHex || typeof amount === 'undefined') { // amount can be 0
                                    logger.warn(`[Tron] Skipping TransferContract with missing to_address or amount in tx ${tx.txID}`);
                                    continue;
                                }

                                const toAddressBase58 = this.tronWebInstance.address.fromHex(toAddressHex); // API gives hex
                                const ownerAddressBase58 = this.tronWebInstance.address.fromHex(ownerAddressHex); // API gives hex

                                if (trackedAddressesBase58.includes(toAddressBase58)) {
                                    logger.info(`[Tron] Detected incoming native TRX transfer to ${toAddressBase58} in tx ${tx.txID}`);

                                    const adaptedTx = {
                                        txID: tx.txID,
                                        blockNumber: block.block_header.raw_data.number,
                                        blockTimeStamp: tx.raw_data.timestamp, // Use transaction timestamp
                                        contractType: 1, // For compatibility if processNativeTransfer expects it
                                        ownerAddress: ownerAddressBase58,
                                        toAddress: toAddressBase58,
                                        amount: amount,
                                        contractRet: 'SUCCESS',
                                    };
                                    await this.processNativeTransfer(adaptedTx as any);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error processing block ${blockNum}:`, error);
                // Decide if we should stop or continue to next block.
                // For now, we'll log and continue, but this might mean missing this block's transactions.
                // A more robust solution might retry this block or pause polling.
                // If an error here is persistent, it might require stopping and manual intervention.
                // To prevent getting stuck, we will update lastProcessedBlockNumber to allow moving to the next block
                // This specific error might be a temporary network issue or an issue with a specific block.
                // However, this means if a block is consistently failing, its transactions might be missed.
                // Consider a specific retry mechanism for individual block fetching/processing.
            }
        }
        this.lastProcessedBlockNumber = endBlock;
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
            const fromAddress = tx.ownerAddress;
            const toAddress = tx.toAddress!;
            const amount = tx.amount || 0;

            logger.debug(`[Tron] Native TRX transfer: ${fromAddress} -> ${toAddress}, Amount: ${amount / 1_000_000} TRX`);

            // Get TRX price for USD value calculation
            const tokenData = await this.tokenService.getToken('TRX');
            const tokenPrice = tokenData?.price || 0;
            const usdValue = tokenPrice ? (amount / 1_000_000) * tokenPrice : 0;

            // Send notification
            await this.notificationService.notifyDeposit(
                toAddress,
                amount.toString(),
                'TRX',
                usdValue,
                tx.txID,
                {
                    chainId: this.TRON_CHAIN_ID.toString(),
                    chainType: 'tron',
                    tokenContract: 'TRX',
                    blockNumber: BigInt(tx.blockNumber)
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
        logger.info('Stopping Tron transaction polling');

        if (this.blockPollingInterval) {
            clearInterval(this.blockPollingInterval);
            this.blockPollingInterval = null;
        }

        this.perTokenPollingIntervals.forEach(interval => clearInterval(interval));
        this.perTokenPollingIntervals.clear();

        // if (this.tokenPollingInterval) { // Old logic
        //     clearInterval(this.tokenPollingInterval);
        //     this.tokenPollingInterval = null;
        // }

        logger.info('Tron transaction polling stopped');
    }

    // --- TRC20 Token Transfer Monitoring (New Strategy: Poll per Token Contract) ---

    private async startAllTokenContractPolling(): Promise<void> {
        const trackedTronTokens = await this.tokenService.getTronTokens();

        if (!trackedTronTokens || trackedTronTokens.length === 0) {
            logger.warn('[Tron] No TRC20 tokens configured for tracking.');
            return;
        }

        logger.info(`[Tron] Starting polling for up to ${trackedTronTokens.length} TRC20 token contracts.`);

        for (const token of trackedTronTokens) {
            // Skip native TRX, as it's not a TRC20 token and is handled by block polling
            if (token.symbol.toUpperCase() === 'TRX') {
                logger.info(`[Tron] Skipping TRC20 polling for native TRX symbol.`);
                continue;
            }

            const tronAddressData = token.addresses.find(addrData => addrData.chain.toLowerCase() === 'tron');

            if (tronAddressData && tronAddressData.address) {
                const tronContractAddress = tronAddressData.address;
                if (!this.tokenLastProcessedTimestamps.has(tronContractAddress)) {
                    // Initialize timestamp if not already set (e.g. 5 mins ago)
                    this.tokenLastProcessedTimestamps.set(tronContractAddress, Date.now() - 5 * 60 * 1000);
                }
                this.startIndividualTokenPolling(tronContractAddress, token.symbol, token.decimals);
            } else {
                logger.warn(`[Tron] Token ${token.symbol} is missing a Tron contract address or the address format is unexpected. Skipping polling for this token.`);
            }
        }
    }

    private startIndividualTokenPolling(contractAddress: string, symbol: string, decimals: number): void {
        const pollFn = async () => {
            try {
                await this.fetchAndProcessTransfersForToken(contractAddress, symbol, decimals);
            } catch (error) {
                logger.error(`[Tron] Error in polling loop for TRC20 token ${symbol} (${contractAddress}):`, error);
            }
        };

        // Execute immediately once, then set up interval
        pollFn();
        const interval = setInterval(pollFn, this.TOKEN_POLLING_INTERVAL_MS); // Use defined interval
        this.perTokenPollingIntervals.set(contractAddress, interval);
        logger.info(`[Tron] Started polling for TRC20 token: ${symbol} (${contractAddress}) every ${this.TOKEN_POLLING_INTERVAL_MS}ms`);
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
     * Check for TRC20 token transfers - DEPRECATED in favor of startAllTokenContractPolling
     */
    private async checkForTokenTransfers(): Promise<void> {
        logger.warn('[Tron] checkForTokenTransfers is deprecated. Polling is now per token contract.');
        // Old logic that iterated through all wallet addresses:
        /* 
        const trackedAddresses = this.addressManager.getTrackedAddresses()
            .map(addr => this.normalizeAndValidateTronAddress(addr))
            .filter(addr => addr !== null);

        if (trackedAddresses.length === 0) {
            return;
        }

        const tronTokens = await this.tokenService.getTronTokens();

        const batchSize = 5;
        for (let i = 0; i < trackedAddresses.length; i += batchSize) {
            const addressBatch = trackedAddresses.slice(i, i + batchSize);
            for (const address of addressBatch) {
                await this.processAddressTokenTransfers(address, tronTokens); // This was the W-factor call
            }
            if (i + batchSize < trackedAddresses.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        */
    }

    /**
     * Process token transfers for a specific address - DEPRECATED
     */
    private async processAddressTokenTransfers(address: string, tronTokens: any[]): Promise<void> {
        logger.warn('[Tron] processAddressTokenTransfers is deprecated. Polling is now per token contract.');
        // Old logic making API calls per wallet address
    }

    /**
     * Process a TRC20 token transfer (already filtered to be relevant by new strategy)
     */
    private async processTokenTransfer(transfer: TronTransferEvent, validatedToAddressBase58: string): Promise<void> {
        if (!this.eventHandler) return;

        try {
            // Ensure from_address is also validated if used beyond logging
            const fromAddressBase58 = this.normalizeAndValidateTronAddress(transfer.from_address);
            const toAddressBase58 = validatedToAddressBase58; // Already validated
            const tokenAddressBase58 = this.normalizeAndValidateTronAddress(transfer.contract_address); // Validate contract address from event

            if (!fromAddressBase58 || !tokenAddressBase58) {
                logger.warn(`[Tron] Skipping TRC20 transfer due to invalid from/token address. TxID: ${transfer.transaction_id}. From: ${transfer.from_address}, Token: ${transfer.contract_address}`);
                return;
            }

            const value = transfer.value;
            const decimals = transfer.decimals;
            const symbol = transfer.symbol;

            logger.debug(`[Tron] TRC20 transfer: ${fromAddressBase58} -> ${toAddressBase58}, Amount: ${BigInt(value) / BigInt(10 ** decimals)} ${symbol}`);

            // Get token price for USD value calculation
            const tokenData = await this.tokenService.getToken(symbol);
            const tokenPrice = tokenData?.price || 0;
            const usdValue = tokenPrice ? Number(value) * tokenPrice / Math.pow(10, decimals) : 0;

            // Send notification
            await this.notificationService.notifyDeposit(
                toAddressBase58,
                value,
                symbol,
                usdValue,
                transfer.transaction_id,
                {
                    chainId: this.TRON_CHAIN_ID.toString(),
                    chainType: 'tron',
                    tokenContract: tokenAddressBase58,
                    blockNumber: transfer.block_number
                }
            );

            // Convert addresses to hex format for consistency with EVM chains
            const fromHex = ('0x' + this.tronWebInstance.address.toHex(fromAddressBase58)) as Hex;
            const toHex = ('0x' + this.tronWebInstance.address.toHex(toAddressBase58)) as Hex;
            const tokenHex = ('0x' + this.tronWebInstance.address.toHex(tokenAddressBase58)) as Hex;

            // Emit event
            this.eventHandler({
                type: 'ERC20',
                chainId: this.TRON_CHAIN_ID,
                data: {
                    from: fromHex,
                    to: toHex,
                    value: BigInt(value),
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
        logger.info('Updating Tron connections');

        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }

        // Stop existing polling mechanisms
        if (this.blockPollingInterval) {
            clearInterval(this.blockPollingInterval);
            this.blockPollingInterval = null;
        }
        this.perTokenPollingIntervals.forEach(interval => clearInterval(interval));
        this.perTokenPollingIntervals.clear();
        // Note: tokenLastProcessedTimestamps should ideally be preserved unless token list changes significantly

        logger.info('Tron polling mechanisms stopped for update. Restarting...');
        // Restart polling, this will use the existing lastProcessedBlockNumber if isInitialized is true
        this.start(); // this.start() will now respect the isInitialized flag
    }

    /**
     * Update tracked addresses
     */
    public updateTrackedAddresses(newAddressesHint: Hex[], newEventHandler?: EventHandlerCallback | null): void {
        logger.info(`Updating tracked addresses for Tron. New count: ${newAddressesHint.length}`);

        if (newEventHandler !== undefined) {
            this.eventHandler = newEventHandler;
        }
    }
} 