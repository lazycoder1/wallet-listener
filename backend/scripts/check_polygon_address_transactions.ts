import axios from 'axios';
import { config as appConfig } from '../src/config'; // Assuming config is exportable
import logger from '../src/config/logger'; // Assuming logger is exportable

const POLYGONSCAN_HTTP_API_URL = appConfig.networks.polygon?.httpApiUrl || 'https://api.polygonscan.com/api';
const POLYGONSCAN_API_KEY = appConfig.networks.polygon?.httpApiKey || 'YourApiKeyToken'; // Replace with your actual API key or use a config

const TARGET_ADDRESS = '0xD50a6bF340242c4a555618aABaa31765432e8F5a'; // Address to check
let lastCheckedBlock = 0; // Keep track of the last block number checked to avoid reprocessing

interface PolygonScanTx {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    nonce: string;
    blockHash: string;
    transactionIndex: string;
    from: string;
    to: string;
    value: string; // Value in Wei
    gas: string;
    gasPrice: string;
    isError: string; // "0" for no error, "1" for error
    txreceipt_status: string; // "1" for success, "0" for failure
    input: string;
    contractAddress: string;
    cumulativeGasUsed: string;
    gasUsed: string;
    confirmations: string;
}

interface PolygonScanApiResponse {
    status: string; // "1" for success, "0" for error
    message: string;
    result: PolygonScanTx[];
}

async function getLatestBlockNumber(): Promise<number> {
    // Cast to any to access rpcUrl, as NetworkConfig might not export it or include it.
    const polygonConfig: any = appConfig.networks.polygon;
    const rpcUrl = polygonConfig?.rpcUrl || 'https://polygon-rpc.com'; // Default public RPC
    try {
        const response = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1
        }, { headers: { 'Content-Type': 'application/json' } });
        if (response.data && response.data.result) {
            const blockNumber = parseInt(response.data.result, 16);
            logger.info(`Latest block number from RPC: ${blockNumber}`);
            return blockNumber;
        }
        logger.warn('Could not fetch latest block number from RPC, response:', response.data);
        return 0; // Fallback
    } catch (err: any) {
        logger.error(`Error fetching latest block number from RPC: ${err.message}`);
        return 0; // Fallback
    }
}


async function getTransactionsForAddress(address: string, startBlock: number, endBlock: number): Promise<PolygonScanTx[]> {
    const params = {
        module: 'account',
        action: 'txlist',
        address: address,
        startblock: startBlock.toString(),
        endblock: endBlock.toString(),
        page: '1',
        offset: '100', // Get up to 100 transactions per request, adjust as needed
        sort: 'asc', // Ascending order to process from oldest to newest
        apikey: POLYGONSCAN_API_KEY,
    };

    try {
        logger.info(`Fetching transactions for address ${address} from block ${startBlock} to ${endBlock} using ${POLYGONSCAN_HTTP_API_URL}`);
        const response = await axios.get<PolygonScanApiResponse>(POLYGONSCAN_HTTP_API_URL, { params });

        if (response.data.status === "1") {
            logger.info(`Successfully fetched ${response.data.result.length} transactions.`);
            return response.data.result;
        } else if (response.data.status === "0" && response.data.message === "No transactions found") {
            logger.info(`No new transactions found for address ${address} in block range ${startBlock}-${endBlock}.`);
            return [];
        } else {
            logger.error(`Error from PolygonScan API: ${response.data.message}, Result: ${JSON.stringify(response.data.result)}`);
            return [];
        }
    } catch (err: any) {
        logger.error(`Error fetching transactions from PolygonScan: ${err.message}`);
        if (err.response) {
            logger.error(`Response data: ${JSON.stringify(err.response.data)}`);
            logger.error(`Response status: ${err.response.status}`);
        }
        return [];
    }
}

function processTransactions(transactions: PolygonScanTx[], targetAddress: string) {
    if (transactions.length === 0) {
        return;
    }

    logger.info(`\n--- Processing ${transactions.length} new transaction(s) for address ${targetAddress} ---`);
    let maxBlock = lastCheckedBlock;

    for (const tx of transactions) {
        const valueInMatic = parseFloat(tx.value) / 1e18; // Convert Wei to MATIC

        const isIncoming = tx.to.toLowerCase() === targetAddress.toLowerCase();
        const isOutgoing = tx.from.toLowerCase() === targetAddress.toLowerCase();
        let direction = "เกี่ยวข้องกับ"; // Related to

        if (isIncoming) {
            direction = "ขาเข้า إلى"; // Incoming to
        } else if (isOutgoing) {
            direction = "ขาออก จาก"; // Outgoing from
        }

        const logMessage = `
        Transaction Hash: ${tx.hash}
        Block Number: ${tx.blockNumber}
        Timestamp: ${new Date(parseInt(tx.timeStamp) * 1000).toISOString()}
        Direction: ${direction} ${targetAddress}
        From: ${tx.from}
        To: ${tx.to}
        Value: ${valueInMatic.toFixed(6)} MATIC
        Gas Price: ${(parseFloat(tx.gasPrice) / 1e9).toFixed(4)} Gwei
        Gas Used: ${tx.gasUsed}
        Status: ${tx.isError === "0" && tx.txreceipt_status === "1" ? "Success" : "Failed (isError: " + tx.isError + ", txreceipt_status: " + tx.txreceipt_status + ")"}
        --------------------------------------------------`;

        logger.info(logMessage);
        const currentTxBlock = parseInt(tx.blockNumber);
        if (currentTxBlock > maxBlock) {
            maxBlock = currentTxBlock;
        }
    }
    if (maxBlock > lastCheckedBlock) {
        lastCheckedBlock = maxBlock;
    }
}

async function checkForNewTransactions(blockToQuery?: number) {
    let targetBlock = blockToQuery;

    if (targetBlock) {
        logger.info(`\nChecking for transactions in specified block ${targetBlock} for address ${TARGET_ADDRESS}...`);
    } else {
        logger.info(`\nNo specific block provided. Checking for transactions in the latest block for address ${TARGET_ADDRESS}...`);
        targetBlock = await getLatestBlockNumber();
        if (targetBlock === 0) {
            logger.warn("Could not determine current block number. Skipping check.");
            return;
        }
        logger.info(`Latest block determined as: ${targetBlock}`);
    }

    // For a single run, we check the targetBlock.
    // lastCheckedBlock is mainly used by processTransactions to ensure it records the latest block with a transaction.
    if (lastCheckedBlock === 0) {
        logger.info(`Preparing to check block: ${targetBlock}`);
    }

    const startBlockToQuery = targetBlock;
    const endBlockToQuery = targetBlock;

    logger.info(`Checking block ${targetBlock}.`);

    const transactions = await getTransactionsForAddress(TARGET_ADDRESS, startBlockToQuery, endBlockToQuery);

    if (transactions.length > 0) {
        processTransactions(transactions, TARGET_ADDRESS);
    } else {
        logger.info(`No transactions involving ${TARGET_ADDRESS} found in block ${targetBlock}.`);
        if (targetBlock > lastCheckedBlock) {
            lastCheckedBlock = targetBlock;
        }
    }
    logger.info(`Finished check for block ${targetBlock}. Last processed block with a transaction (if any): ${lastCheckedBlock}`);
}

async function main() {
    // TEMPORARY TEST: Log the env var directly
    logger.info(`[ENV TEST] Direct value of process.env.POLYGONSCAN_API_KEY: "${process.env.POLYGONSCAN_API_KEY}"`);

    logger.info(`Starting Polygon transaction check for address: ${TARGET_ADDRESS}`);
    logger.info(`Using PolygonScan API: ${POLYGONSCAN_HTTP_API_URL}`);
    if (POLYGONSCAN_API_KEY === 'YourApiKeyToken' || !POLYGONSCAN_API_KEY) {
        logger.warn("Using default or missing PolygonScan API key. Please set POLYGONSCAN_API_KEY in your .env file for reliable service.");
    }

    let specificBlock: number | undefined = undefined;
    if (process.argv.length > 2) {
        const blockArg = parseInt(process.argv[2], 10);
        if (!isNaN(blockArg) && blockArg > 0) {
            specificBlock = blockArg;
            logger.info(`Block number ${specificBlock} provided as input.`);
        } else {
            logger.warn(`Invalid block number provided as argument: ${process.argv[2]}. Will use the latest block instead.`);
        }
    }

    await checkForNewTransactions(specificBlock);

    logger.info("Script finished executing single check.");
    process.exit(0); // Exit after single run
}

main().catch(error => {
    logger.error("Unhandled error in script:", error);
    process.exit(1);
});

// To run:
// 1. Make sure you have an .env file or equivalent with POLYGONSCAN_API_KEY and optionally POLYGONSCAN_API_URL (if not default)
//    and POLYGON_RPC_URL (optional, for latest block) or update the constants POLYGONSCAN_API_KEY and rpcUrl in this script.
// 2. Ensure your ../src/config.ts correctly loads these. If NetworkConfig in your project doesn't define rpcUrl, this script uses a public default.
// 3. Compile: bun tsc backend/scripts/check_polygon_address_transactions.ts --outDir backend/dist/scripts
// 4. Run: NODE_ENV=development bun backend/dist/scripts/check_polygon_address_transactions.js

// Note on POLYGON_WSS_URL:
// The user mentioned POLYGON_WSS_URL. This script currently uses HTTP for PolygonScan and a public RPC for block number.
// If POLYGON_WSS_URL is intended for WebSocket subscriptions to new blocks/transactions (like eth_subscribe),
// that would be a different approach (event-driven) rather than polling (request-driven like this script).
// This script uses standard HTTPS for API calls. The POLYGON_WSS_URL from config is NOT used by this script. 