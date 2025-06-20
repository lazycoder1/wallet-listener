import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import ImportService from '../../src/modules/import/import.service';

const prisma = new PrismaClient();

describe('ImportService', () => {
    let testCompanyId: number;

    beforeEach(async () => {
        // Create a test company
        const company = await prisma.company.create({
            data: {
                name: `Test Company ${Date.now()}`, // Make name unique
            },
        });
        testCompanyId = company.id;
    });

    afterEach(async () => {
        // Clean up test data
        try {
            await prisma.companyAddress.deleteMany({
                where: { companyId: testCompanyId },
            });
            await prisma.address.deleteMany({
                where: {
                    companyAddresses: {
                        some: { companyId: testCompanyId },
                    },
                },
            });
            await prisma.importBatch.deleteMany({
                where: { companyId: testCompanyId },
            });
            await prisma.company.delete({
                where: { id: testCompanyId },
            });
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should import addresses with accountName and accountManager', async () => {
        const importData = {
            companyId: testCompanyId,
            mode: 'REPLACE' as const,
            addresses: [
                {
                    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
                    chain_type: 'EVM' as const,
                    threshold: 0.5,
                    accountName: 'Main Treasury',
                    accountManager: 'John Smith',
                },
            ],
            original_filename: 'test.csv',
        };

        const result = await ImportService.processImport(importData);

        expect(result.validAddresses).toBe(1);
        expect(result.invalidAddresses).toBe(0);

        // Verify the data was saved correctly
        const companyAddresses = await prisma.companyAddress.findMany({
            where: { companyId: testCompanyId },
            select: {
                id: true,
                accountName: true,
                accountManager: true,
                threshold: true,
                address: {
                    select: {
                        id: true,
                        address: true,
                        chainType: true,
                    },
                },
            },
        });

        expect(companyAddresses).toHaveLength(1);

        const mainTreasury = companyAddresses[0];
        expect(mainTreasury.accountName).toBe('Main Treasury');
        expect(mainTreasury.accountManager).toBe('John Smith');
        expect(mainTreasury.threshold).toEqual(0.5);
    }, 10000); // Increase timeout to 10 seconds
}); 