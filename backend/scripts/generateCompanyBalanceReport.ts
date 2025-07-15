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

    const companyId = companyIdArg ? parseInt(companyIdArg.split('=')[1], 10) : null;
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

    if (!companyId || isNaN(companyId)) {
        logger.error('Usage: bun scripts/generateCompanyBalanceReport.ts --companyId=<ID> [--limit=<NUMBER>]');
        process.exit(1);
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
        logger.error(`Company with ID ${companyId} not found.`);
        process.exit(1);
    }

    logger.info(`Starting balance report generation for company: ${company.name} (ID: ${companyId})`);

    // 2. Fetch addresses
    let addressesToProcess = await fetchCompanyAddresses(companyId);
    if (addressesToProcess.length === 0) return;

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
                const tronBalanceData = await balanceService.fetchTronScanTokenBalances(address.address);
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
        const fileName = `balance-report-${companyId}-${Date.now()}.csv`;
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