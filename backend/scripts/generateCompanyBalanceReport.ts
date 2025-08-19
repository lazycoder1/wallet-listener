import { PrismaClient, Company, Address } from '@prisma/client';
import dotenv from 'dotenv';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { BalanceService } from '../src/services/balance/balanceService';

// --- CONFIGURATION ---
dotenv.config();

// --- SETUP ---
const prisma = new PrismaClient();
const balanceService = BalanceService.getInstance();

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

interface ReportRow {
    walletAddress: string;
    chainType: string;
    totalBalanceUSD: number;
    checkedAt: string;
}

interface WalletInfo {
    address: string;
    chainType: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse addresses from a CSV file.
 * Expected headers (case-insensitive): "address", "chain_type" (or "chainType").
 */
function parseAddressesFromCsv(csvPath: string): WalletInfo[] {
    if (!fs.existsSync(csvPath)) {
        logger.error(`CSV file not found at path: ${csvPath}`);
        process.exit(1);
    }

    const raw = fs.readFileSync(csvPath, 'utf-8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
        logger.warn('CSV file is empty.');
        return [];
    }

    // Basic CSV parsing (comma-separated). Handles simple cases without quoted commas.
    const header = lines[0]
        .split(',')
        .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

    const addressIdx = header.findIndex((h) => h === 'address');
    const chainIdx = header.findIndex((h) => h === 'chain_type' || h === 'chaintype');

    if (addressIdx === -1 || chainIdx === -1) {
        logger.error(
            'CSV must contain headers: address, chain_type (or chainType)'
        );
        process.exit(1);
    }

    const rows: WalletInfo[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const addr = cols[addressIdx];
        const chainRaw = cols[chainIdx];
        if (!addr || !chainRaw) continue;
        const chainType = chainRaw.toUpperCase();
        if (chainType !== 'EVM' && chainType !== 'TRON') {
            logger.warn(
                `Unsupported chain_type "${chainRaw}" on row ${i + 1}; expected EVM or TRON. Skipping.`
            );
            continue;
        }
        rows.push({ address: addr, chainType });
    }

    logger.info(`Parsed ${rows.length} rows from CSV: ${csvPath}`);
    return rows;
}

/**
 * Fetches all active addresses for a given company.
 */
async function fetchCompanyAddresses(companyId: number): Promise<WalletInfo[]> {
    logger.info(`Fetching all active addresses for company ID: ${companyId}`);

    const companyAddresses = await prisma.companyAddress.findMany({
        where: {
            companyId: companyId,
            isActive: true
        },
        select: {
            address: {
                select: {
                    address: true,
                    chainType: true,
                }
            }
        }
    });

    if (!companyAddresses || companyAddresses.length === 0) {
        logger.warn(`No active addresses found for company ID: ${companyId}`);
        return [];
    }

    const addresses = companyAddresses.map(ca => ca.address);
    logger.info(`Found ${addresses.length} active addresses to process.`);
    return addresses;
}

/**
 * Main script execution logic.
 */
async function main() {
    // 1. Argument Parsing
    const args = process.argv.slice(2);
    const companyIdArg = args.find(arg => arg.startsWith('--companyId='));
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    const csvArg = args.find(arg => arg.startsWith('--csv='));
    const tronRpsArg = args.find(arg => arg.startsWith('--tronRps='));
    const tronDelayArg = args.find(arg => arg.startsWith('--tronDelayMs='));

    const companyId = companyIdArg ? parseInt(companyIdArg.split('=')[1], 10) : null;
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
    const csvPath = csvArg ? csvArg.split('=')[1] : null;
    // Respect TronScan rate limit: default 5 requests/second => 200 ms minimum interval
    const tronRps = tronRpsArg ? parseInt(tronRpsArg.split('=')[1], 10) : 5;
    const tronMinIntervalMsFromRps = tronRps && tronRps > 0 ? Math.floor(1000 / tronRps) : 200;
    const tronMinIntervalMs = tronDelayArg ? parseInt(tronDelayArg.split('=')[1], 10) : tronMinIntervalMsFromRps;
    let lastTronRequestAt = 0;

    if ((!companyId || isNaN(companyId)) && !csvPath) {
        logger.error('Usage: bun scripts/generateCompanyBalanceReport.ts (--companyId=<ID> | --csv=<PATH_TO_CSV>) [--limit=<NUMBER>] [--tronRps=<NUMBER>|--tronDelayMs=<MS>]');
        process.exit(1);
    }

    let company: Company | null = null;
    if (companyId && !isNaN(companyId)) {
        company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) {
            logger.error(`Company with ID ${companyId} not found.`);
            process.exit(1);
        }
    }

    if (csvPath) {
        logger.info(`Starting balance report generation from CSV file: ${csvPath}`);
    } else if (company) {
        logger.info(`Starting balance report generation for company: ${company.name} (ID: ${companyId})`);
    }

    // 2. Fetch addresses (from CSV or DB)
    let addressesToProcess: WalletInfo[] = [];
    if (csvPath) {
        addressesToProcess = parseAddressesFromCsv(csvPath);
    } else if (companyId && !isNaN(companyId)) {
        addressesToProcess = await fetchCompanyAddresses(companyId);
    }

    if (addressesToProcess.length === 0) {
        logger.warn('No addresses to process.');
        return;
    }

    // Apply the limit if provided
    if (limit && limit > 0) {
        logger.info(`Limiting processing to the first ${limit} of ${addressesToProcess.length} addresses.`);
        addressesToProcess = addressesToProcess.slice(0, limit);
    }

    const reportRows: ReportRow[] = [];

    // 3. Process each address
    for (const address of addressesToProcess) {
        logger.info(`Processing address: ${address.address} (${address.chainType})`);
        let balance = 0;
        try {
            if (address.chainType === 'EVM') {
                balance = await balanceService.getTotalBalanceAlchemy(address.address);
            } else if (address.chainType === 'TRON') {
                // Enforce TronScan rate limit spacing between requests
                const now = Date.now();
                const waitMs = Math.max(0, lastTronRequestAt + tronMinIntervalMs - now);
                if (waitMs > 0) {
                    await sleep(waitMs);
                }
                const tronBalanceData = await balanceService.fetchTronScanTokenBalances(address.address);
                lastTronRequestAt = Date.now();
                balance = tronBalanceData.totalUsdBalance;
            } else {
                logger.warn(`Unsupported chain type "${address.chainType}" for address ${address.address}. Skipping.`);
                continue;
            }

            reportRows.push({
                walletAddress: address.address,
                chainType: address.chainType,
                totalBalanceUSD: parseFloat(balance.toFixed(2)),
                checkedAt: new Date().toUTCString(),
            });
            logger.info(`- Balance for ${address.address}: $${balance.toFixed(2)}`);

        } catch (error: any) {
            logger.error(`Failed to fetch balance for ${address.address}. Error: ${error.message}`);
        }
    }

    // 4. Write CSV report
    if (reportRows.length > 0) {
        const fileName = csvPath
            ? `balance-report-from-csv-${Date.now()}.csv`
            : `balance-report-${companyId}-${Date.now()}.csv`;
        const filePath = path.join(process.cwd(), 'backend', fileName);
        const headers = ['Wallet Address', 'Chain Type', 'Total Balance (USD)', 'Checked At (UTC)'];
        const csvHeader = headers.join(',') + '\n';

        const csvRows = reportRows.map(row => {
            return [
                row.walletAddress,
                row.chainType,
                row.totalBalanceUSD,
                `"${row.checkedAt}"`
            ].join(',');
        }).join('\n');

        fs.writeFileSync(filePath, csvHeader + csvRows);
        logger.info(`\n📝 Report generation complete. Saved to ${filePath}`);
    } else {
        logger.info('No balances were processed. Report not generated.');
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