import { PrismaClient, type Company, type Address, type CompanyAddress } from '@prisma/client';
import dotenv from 'dotenv';
import axios from 'axios';
import { formatUnits } from 'viem';
import winston from 'winston';
import * as TronWebLib from 'tronweb';
import { config as appConfig } from '../src/config';
import { TokenService } from '../src/services/token/tokenService';

// --- CONFIGURATION ---
dotenv.config();

// --- SETUP ---
const prisma = new PrismaClient();
const tokenService = TokenService.getInstance();
const tronWebInstance = new TronWebLib.TronWeb({
    fullHost: appConfig.networks.tron.wsUrl || 'https://api.trongrid.io',
    headers: appConfig.networks.tron.apiKey ? { 'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey } : undefined
});

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [new winston.transports.Console()],
});

// --- TYPE DEFINITIONS (from tronPollingMonitor) ---
interface TronTransactionFromBlock {
    txID: string;
    raw_data: {
        contract: any[];
        timestamp: number;
    };
}

interface TronBlock {
    blockID: string;
    block_header: {
        raw_data: {
            number: number;
            timestamp: number;
        };
    };
    transactions?: TronTransactionFromBlock[];
}

// --- HELPER FUNCTIONS ---

/**
 * Fetches company addresses from the database.
 */
async function fetchCompanyTronAddresses(companyId: number): Promise<string[]> {
    logger.info(`Fetching TRON addresses for company ID: ${companyId}`);
    const companyWithAddresses = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
            companyAddresses: {
                where: {
                    isActive: true,
                    address: {
                        chainType: 'TRON'
                    }
                },
                include: { address: true },
            },
        },
    });

    if (!companyWithAddresses || companyWithAddresses.companyAddresses.length === 0) {
        logger.warn(`No active TRON addresses found for company ID: ${companyId}`);
        return [];
    }
    const addresses = companyWithAddresses.companyAddresses.map(ca => ca.address.address);
    logger.info(`Found ${addresses.length} active TRON addresses.`);
    return addresses;
}


// --- CORE LOGIC (adapted from tronPollingMonitor) ---

/**
 * Decodes TRC20 transfer data from a smart contract call.
 */
function decodeTRC20Transfer(data: string): { to: string; amount: string } | null {
    if (!data || !data.startsWith('a9059cbb') || data.length < 136) return null;
    try {
        const toAddressHex = '41' + data.slice(32, 72);
        const amountHex = data.slice(72, 136);
        return {
            to: tronWebInstance.address.fromHex(toAddressHex),
            amount: BigInt('0x' + amountHex).toString(),
        };
    } catch (error) {
        logger.warn(`Error decoding TRC20 transfer data: ${data}`, error);
        return null;
    }
}

/**
 * Processes a native TRX transfer found in a block.
 */
function processNativeTransfer(tx: TronTransactionFromBlock, contract: any, trackedAddressesSet: Set<string>): void {
    const toAddressHex = contract.parameter.value.to_address;
    const toAddressBase58 = tronWebInstance.address.fromHex(toAddressHex);

    if (trackedAddressesSet.has(toAddressBase58.toLowerCase())) {
        const fromAddress = tronWebInstance.address.fromHex(contract.parameter.value.owner_address);
        const amount = contract.parameter.value.amount;
        const formattedAmount = amount / 1_000_000;

        logger.info(`✅ [NATIVE TRX DEPOSIT]
    - To: ${toAddressBase58}
    - From: ${fromAddress}
    - Amount: ${formattedAmount} TRX
    - TxHash: ${tx.txID}`);
    }
}

/**
 * Processes a TRC20 token transfer found in a block.
 */
async function processTRC20Transfer(tx: TronTransactionFromBlock, contract: any, trackedAddressesSet: Set<string>, trackedTokenContracts: Map<string, any>): Promise<void> {
    const contractAddressHex = contract.parameter.value.contract_address;
    const contractAddressBase58 = tronWebInstance.address.fromHex(contractAddressHex);

    const tokenInfo = trackedTokenContracts.get(contractAddressBase58.toLowerCase());
    if (!tokenInfo) return;

    const decoded = decodeTRC20Transfer(contract.parameter.value.data);
    if (!decoded) return;

    if (trackedAddressesSet.has(decoded.to.toLowerCase())) {
        const fromAddress = tronWebInstance.address.fromHex(contract.parameter.value.owner_address);
        const numericAmount = BigInt(decoded.amount);
        const formattedAmount = formatUnits(numericAmount, tokenInfo.decimals);

        logger.info(`✅ [TRC20 TOKEN DEPOSIT]
    - To: ${decoded.to}
    - From: ${fromAddress}
    - Amount: ${formattedAmount} ${tokenInfo.symbol}
    - Token: ${tokenInfo.name} (${contractAddressBase58})
    - TxHash: ${tx.txID}`);
    }
}

/**
 * Main script execution logic.
 */
async function main() {
    const args = process.argv.slice(2);
    const blockNumberArg = args.find(arg => arg.startsWith('--block='));
    const companyIdArg = args.find(arg => arg.startsWith('--companyId='));

    const blockNumber = blockNumberArg ? parseInt(blockNumberArg.split('=')[1], 10) : null;
    const companyId = companyIdArg ? parseInt(companyIdArg.split('=')[1], 10) : null;

    if (!blockNumber || isNaN(blockNumber) || !companyId || isNaN(companyId)) {
        logger.error('Usage: bun scripts/testTronBlockScanner.ts --block=<BLOCK_NUMBER> --companyId=<COMPANY_ID>');
        process.exit(1);
    }

    logger.info(`🔍 Starting scan for block number: ${blockNumber} for Company ID: ${companyId}`);

    // 1. Prepare tracked addresses and tokens from DB
    const trackedAddresses = await fetchCompanyTronAddresses(companyId);
    if (trackedAddresses.length === 0) {
        logger.warn('No addresses to track for this company. Exiting.');
        return;
    }
    const trackedAddressesSet = new Set(trackedAddresses.map(a => a.toLowerCase()));

    const tronTokens = await tokenService.getTronTokens();
    const trackedTokenContracts = new Map<string, any>();
    for (const token of tronTokens) {
        const tronAddressInfo = token.addresses.find((addr: any) => addr.chain.toLowerCase() === 'tron');
        if (tronAddressInfo) {
            trackedTokenContracts.set(tronAddressInfo.address.toLowerCase(), token);
        }
    }
    logger.info(`Loaded ${trackedTokenContracts.size} TRC20 tokens for tracking.`);
    logger.info(`Tracking ${trackedAddressesSet.size} addresses from company ${companyId}.`);


    // 2. Fetch the block
    let block: TronBlock;
    try {
        const response = await axios.post(`${appConfig.networks.tron.wsUrl}/wallet/getblockbynum`,
            { num: blockNumber },
            { headers: appConfig.networks.tron.apiKey ? { 'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey } : undefined }
        );
        block = response.data;
        if (!block || !block.block_header) {
            logger.error(`Could not fetch or parse block ${blockNumber}. Response empty.`);
            return;
        }
    } catch (error: any) {
        logger.error(`Failed to fetch block ${blockNumber}. Error: ${error.message}`);
        return;
    }

    // 3. Process the block
    if (!block.transactions || block.transactions.length === 0) {
        logger.info(`Block ${blockNumber} has no transactions.`);
        return;
    }

    logger.info(`Processing ${block.transactions.length} transactions in block ${blockNumber}...`);

    for (const tx of block.transactions) {
        for (const contract of tx.raw_data.contract) {
            try {
                if (contract.type === 'TransferContract') {
                    processNativeTransfer(tx, contract, trackedAddressesSet);
                } else if (contract.type === 'TriggerSmartContract') {
                    await processTRC20Transfer(tx, contract, trackedAddressesSet, trackedTokenContracts);
                }
            } catch (error: any) {
                logger.error(`Failed to process a contract in tx ${tx.txID}. Error: ${error.message}`);
            }
        }
    }

    logger.info(`\nScan finished for block ${blockNumber}.`);
}

main()
    .catch((e) => {
        logger.error("Script failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 