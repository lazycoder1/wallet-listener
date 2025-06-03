// backend/scripts/test_db.ts
import { PrismaClient } from '@prisma/client';

async function testDbConnection() {
    console.log('[TEST_DB] Initializing PrismaClient...');
    const prisma = new PrismaClient({
        log: ['query', 'info', 'warn', 'error'], // Enable extensive logging
    });
    console.log('[TEST_DB] PrismaClient initialized.');

    try {
        console.log('[TEST_DB] Attempting to connect and fetch one company...');
        const company = await prisma.company.findFirst(); // Or any simple query
        console.log('[TEST_DB] Query successful. Fetched company:', company);
    } catch (error) {
        console.error('[TEST_DB] Error during database operation:', error);
    } finally {
        console.log('[TEST_DB] Attempting to disconnect PrismaClient...');
        await prisma.$disconnect();
        console.log('[TEST_DB] PrismaClient disconnected.');
    }
}

testDbConnection();