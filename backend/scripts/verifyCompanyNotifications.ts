import { PrismaClient, type Company, type Address, type CompanyAddress } from '@prisma/client';
import dotenv from 'dotenv';
import axios from 'axios';
import { formatUnits } from 'viem';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import {
    Alchemy,
    Network,
    AssetTransfersCategory,
    type AssetTransfersResult,
} from 'alchemy-sdk';

// --- CONFIGURATION ---
dotenv.config();
const BATCH_SIZE = 1000; // API batch size for fetching transactions
const ALCHEMY_API_KEY = process.env.ALCHEMY_ID;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;

// Define which EVM chains to check
const EVM_CHAINS = [
    { name: 'Ethereum', network: Network.ETH_MAINNET, nativeSymbol: 'ETH' },
    { name: 'Polygon', network: Network.MATIC_MAINNET, nativeSymbol: 'MATIC' },
    { name: 'BNB', network: Network.BNB_MAINNET, nativeSymbol: 'BNB' },
];

// --- SETUP ---
const prisma = new PrismaClient();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
    ),
    transports: [new winston.transports.Console()],
});

interface TokenInfo {
    symbol: string;
    name: string;
    decimals: number;
    price?: number;
    addresses: Record<string, string>; // chainName -> contractAddress
}

interface LoadedTokenData {
    tokensByAddress: Map<string, TokenInfo>;
    nativeTokens: Map<string, TokenInfo>;
}

// Custom type to reflect the actual Alchemy API response for asset transfers
interface TransactionWithMetadata extends AssetTransfersResult {
    metadata: {
        blockTimestamp: string;
    };
}

// --- HELPER FUNCTIONS ---

/**
 * Loads and maps token data for quick lookups.
 */
async function loadTokenData(): Promise<LoadedTokenData> {
    const tokensByAddress = new Map<string, TokenInfo>();
    const nativeTokens = new Map<string, TokenInfo>();

    const allTokens = await prisma.token.findMany({
        include: { addresses: true },
        where: { isActive: true },
    });

    for (const token of allTokens) {
        const tokenInfo: TokenInfo = {
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            price: token.price ? parseFloat(token.price.toString()) : 0,
            addresses: {},
        };

        for (const addr of token.addresses) {
            const contract = addr.address.toLowerCase();
            tokenInfo.addresses[addr.chain.toLowerCase()] = contract;
            tokensByAddress.set(contract, tokenInfo);
        }

        // Handle native assets by checking for a well-known "zero" address
        if (tokenInfo.addresses['native']) {
            nativeTokens.set(token.symbol.toUpperCase(), tokenInfo);
        }
    }

    logger.info(`Loaded ${allTokens.length} tokens, mapping ${tokensByAddress.size} contract addresses.`);
    return { tokensByAddress, nativeTokens };
}

/**
 * Fetches company addresses from the database.
 */
async function fetchCompanyAddresses(companyId: number): Promise<(Company & { companyAddresses: (CompanyAddress & { address: Address })[] }) | null> {
    logger.info(`Fetching addresses for company ID: ${companyId}`);
    const companyWithAddresses = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
            companyAddresses: {
                where: { isActive: true },
                include: { address: true },
            },
        },
    });

    if (!companyWithAddresses || companyWithAddresses.companyAddresses.length === 0) {
        logger.warn(`No active addresses found for company ID: ${companyId}`);
        return null;
    }
    logger.info(`Found ${companyWithAddresses.companyAddresses.length} active addresses.`);
    return companyWithAddresses;
}

/**
 * Fetches EVM transactions (Native and ERC20) using Alchemy.
 */
async function fetchEvmTransactions(address: string, startTimestamp: number, endTimestamp: number) {
    if (!ALCHEMY_API_KEY) {
        logger.warn("ALCHEMY_API_KEY not set, skipping EVM transactions.");
        return [];
    }

    const allTxs: any[] = [];
    const startEpoch = Math.floor(startTimestamp / 1000); // Alchemy uses seconds
    const endEpoch = Math.floor(endTimestamp / 1000);

    for (const chain of EVM_CHAINS) {
        logger.info(`Fetching EVM transactions for ${address} on ${chain.name}...`);
        const alchemy = new Alchemy({ apiKey: ALCHEMY_API_KEY, network: chain.network });

        try {
            // Alchemy's getAssetTransfers is powerful for this
            const response = await alchemy.core.getAssetTransfers({
                fromBlock: '0x0', // We will filter by timestamp client-side
                toAddress: address,
                excludeZeroValue: true,
                category: [
                    AssetTransfersCategory.ERC20,
                    AssetTransfersCategory.EXTERNAL, // Native transfers
                ],
            });

            const filteredTxs = response.transfers.filter((tx: any) => {
                if (!tx.metadata?.blockTimestamp) {
                    return false; // Safely skip txs without metadata
                }
                const txTimestamp = new Date(tx.metadata.blockTimestamp).getTime();
                return txTimestamp >= startTimestamp && txTimestamp <= endTimestamp;
            });

            const mappedTxs = filteredTxs.map((tx: any) => {
                return {
                    chain: chain.name,
                    to: tx.to,
                    from: tx.from,
                    value: tx.value ? formatUnits(BigInt(Math.round(tx.value * (10 ** 18))), 18) : '0', // Normalize to a common format
                    tokenSymbol: tx.asset,
                    contractAddress: tx.rawContract.address?.toLowerCase() ?? 'native',
                    txHash: tx.hash,
                    timestamp: new Date(tx.metadata.blockTimestamp).getTime(),
                };
            });

            allTxs.push(...mappedTxs);
            logger.info(`Found ${mappedTxs.length} potential deposits for ${address} on ${chain.name}.`);
        } catch (error: any) {
            logger.error(`Failed to fetch from Alchemy for chain ${chain.name}: ${error.message}`);
        }
    }
    return allTxs;
}

/**
 * Fetches Tron transactions (TRX and TRC20).
 */
async function fetchTronTransactions(address: string, minTimestamp: number, maxTimestamp: number) {
    if (!TRONGRID_API_KEY) {
        logger.warn("TRONGRID_API_KEY not set, skipping Tron transactions.");
        return [];
    }
    const baseUrl = `https://api.trongrid.io/v1/accounts/${address}/transactions`;
    const trc20Url = `${baseUrl}/trc20`;

    const fetchAll = async (url: string) => {
        let allTransactions: any[] = [];
        let nextUrl: string | undefined = `${url}?limit=200&min_timestamp=${minTimestamp}&max_timestamp=${maxTimestamp}&order_by=block_timestamp,asc`;

        while (nextUrl) {
            try {
                const response: any = await axios.get(nextUrl, { headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } });
                const { data, meta }: { data: any[], meta: any } = response.data;
                if (data && data.length > 0) {
                    allTransactions = allTransactions.concat(data);
                }
                nextUrl = meta?.links?.next;
            } catch (error: any) {
                logger.error(`Failed to fetch from TronGrid URL ${url}: ${error.message}`);
                break;
            }
        }
        return allTransactions;
    };

    const [trc20Txs, nativeTxs] = await Promise.all([
        fetchAll(trc20Url),
        fetchAll(baseUrl)
    ]);

    // Filter and map transactions
    const deposits = trc20Txs
        .filter((tx: any) => tx.to.toLowerCase() === address.toLowerCase())
        .map((tx: any) => ({
            chain: 'TRON',
            to: tx.to,
            from: tx.from,
            value: tx.value,
            tokenSymbol: tx.token_info.symbol,
            contractAddress: tx.token_info.address.toLowerCase(),
            txHash: tx.transaction_id,
            timestamp: tx.block_timestamp,
        }));

    // For native TRX, we need to inspect the raw_data
    const nativeDeposits = nativeTxs
        .filter((tx: any) =>
            tx.raw_data?.contract?.[0]?.type === 'TransferContract' &&
            tx.raw_data.contract[0].parameter.value.to_address.toLowerCase() === address.toLowerCase()
        )
        .map((tx: any) => ({
            chain: 'TRON',
            to: address,
            from: tx.raw_data.contract[0].parameter.value.owner_address,
            value: tx.raw_data.contract[0].parameter.value.amount.toString(),
            tokenSymbol: 'TRX',
            contractAddress: 'native',
            txHash: tx.txID,
            timestamp: tx.block_timestamp,
        }));

    return [...deposits, ...nativeDeposits];
}

// More functions for EVM will be added here

/**
 * Main script execution logic.
 */
async function main() {
    // --- Argument Parsing ---
    const args = process.argv.slice(2);
    const companyId = parseInt(args.find(arg => arg.startsWith('--companyId='))?.split('=')[1] ?? '', 10);
    const startTimestamp = parseInt(args.find(arg => arg.startsWith('--startTimestamp='))?.split('=')[1] ?? '', 10);
    const endTimestamp = parseInt(args.find(arg => arg.startsWith('--endTimestamp='))?.split('=')[1] ?? '', 10);
    const usdThreshold = parseFloat(args.find(arg => arg.startsWith('--usdThreshold='))?.split('=')[1] ?? '');

    if (isNaN(companyId) || isNaN(startTimestamp) || isNaN(endTimestamp) || isNaN(usdThreshold)) {
        logger.error('Usage: bun scripts/verifyCompanyNotifications.ts --companyId=<ID> --startTimestamp=<EPOCH> --endTimestamp=<EPOCH> --usdThreshold=<AMOUNT>');
        process.exit(1);
    }
    logger.info(`Starting verification for Company ID: ${companyId}, Threshold: $${usdThreshold}`);
    logger.info(`Timeframe: ${new Date(startTimestamp).toUTCString()} to ${new Date(endTimestamp).toUTCString()}`);

    // --- SCRIPT LOGIC ---
    const { tokensByAddress, nativeTokens } = await loadTokenData();
    const companyData = await fetchCompanyAddresses(companyId);
    if (!companyData) return;

    let expectedNotifications = 0;
    const allTxs: any[] = [];
    const reportData: any[] = [];

    // Process all addresses
    for (const { address } of companyData.companyAddresses) {
        logger.info(`Processing address: ${address.address} on chain: ${address.chainType}`);

        if (address.chainType === 'TRON') {
            const tronTxs = await fetchTronTransactions(address.address, startTimestamp, endTimestamp);
            allTxs.push(...tronTxs);
        } else if (address.chainType === 'EVM') {
            const evmTxs = await fetchEvmTransactions(address.address, startTimestamp, endTimestamp);
            allTxs.push(...evmTxs);
        }
    }

    logger.info(`\n--- Verification Report ---`);
    logger.info(`Found ${allTxs.length} total potential deposit transactions for Company: ${companyData.name}.`);

    for (const tx of allTxs) {
        let tokenInfo: TokenInfo | undefined;
        if (tx.contractAddress === 'native') {
            const symbol = tx.chain === 'TRON' ? tx.tokenSymbol.toUpperCase() : EVM_CHAINS.find(c => c.name === tx.chain)?.nativeSymbol ?? '';
            tokenInfo = nativeTokens.get(symbol);
        } else {
            tokenInfo = tokensByAddress.get(tx.contractAddress);
        }

        if (!tokenInfo) {
            logger.warn(`-  [SKIPPED] Unknown token for tx ${tx.txHash}. Symbol: ${tx.tokenSymbol}, Contract: ${tx.contractAddress}`);
            continue;
        }

        if (!tokenInfo.price || tokenInfo.price === 0) {
            logger.warn(`-  [SKIPPED] Price is zero or missing for token ${tokenInfo.symbol}.`);
            continue;
        }

        const amount = tx.chain === 'TRON'
            ? parseFloat(formatUnits(BigInt(tx.value), tokenInfo.decimals))
            : parseFloat(tx.value); // EVM value is pre-formatted
        const usdValue = amount * tokenInfo.price;

        if (usdValue >= usdThreshold) {
            expectedNotifications++;
            const logMessage = `✅ [ALERT] Chain: ${tx.chain.padEnd(8)} | Tx: ${tx.txHash} | Value: ${amount.toFixed(4)} ${tokenInfo.symbol} ($${usdValue.toFixed(2)}) | Date: ${new Date(tx.timestamp).toUTCString()}`;
            logger.info(logMessage);

            reportData.push({
                chain: tx.chain,
                address: tx.to,
                txHash: tx.txHash,
                value: amount,
                tokenSymbol: tokenInfo.symbol,
                usdValue: usdValue,
                date: new Date(tx.timestamp).toUTCString(),
            });
        }
    }

    logger.info(`\n--- Summary ---`);
    logger.info(`Total Expected Notifications: ${expectedNotifications}`);

    // --- CSV EXPORT ---
    if (reportData.length > 0) {
        const fileName = `verification-report-${companyId}-${Date.now()}.csv`;
        const filePath = path.join(process.cwd(), fileName);
        const headers = ['Chain', 'Address', 'Transaction Hash', 'Value', 'Token', 'USD Value', 'Date'];
        const csvHeader = headers.join(',') + '\n';

        const csvRows = reportData.map(row => {
            return [
                row.chain,
                row.address,
                row.txHash,
                row.value.toFixed(4),
                row.tokenSymbol,
                row.usdValue.toFixed(2),
                `"${row.date}"` // Enclose date in quotes
            ].join(',');
        }).join('\n');

        fs.writeFileSync(filePath, csvHeader + csvRows);
        logger.info(`\n📝 Report saved to ${filePath}`);
    }
}

main()
    .catch((e) => {
        logger.error("Script failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 