import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function runTest() {
    console.log(`[TEST_SINGLE_QUERY] DATABASE_URL: ${process.env.DATABASE_URL}`);
    console.log(`[TEST_SINGLE_QUERY] NODE_ENV: ${process.env.NODE_ENV}`);
    const prisma = new PrismaClient({
        log: [{ emit: 'stdout', level: 'query' }, { emit: 'stdout', level: 'info' }, { emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }],
    });

    const targetAddress = 'TNBefRhnjMFrwGBcuogZfn8mDaVTCajNK3';
    console.log(`[TEST_SINGLE_QUERY] Attempting to find address: ${targetAddress}`);
    try {
        const addressRecord = await prisma.address.findUnique({
            where: { address: targetAddress },
        });
        console.log("[TEST_SINGLE_QUERY] Query finished.");
        if (addressRecord) {
            console.log("[TEST_SINGLE_QUERY] Found address:", addressRecord);
        } else {
            console.log("[TEST_SINGLE_QUERY] Address not found.");
        }
    } catch (e) {
        console.error("[TEST_SINGLE_QUERY] Error during query:", e);
    } finally {
        console.log("[TEST_SINGLE_QUERY] Disconnecting Prisma.");
        await prisma.$disconnect();
        console.log("[TEST_SINGLE_QUERY] Prisma disconnected.");
    }
}
runTest();