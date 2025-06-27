import prisma from '../../prisma'; // Adjusted path to import from src/prisma.ts
import { Prisma, PrismaClient } from '@prisma/client';
import type { ImportAddress, ImportRequestBody } from './import.types';
import { isValidEVMAddress, isValidTronAddress } from '../../utils/validators';
import logger from '../../config/logger'; // Import logger

export class ImportService {
    private readonly BATCH_SIZE = 100; // Process 100 addresses per batch to avoid timeouts

    async processImport(data: ImportRequestBody) {
        const { companyId, mode, addresses, original_filename } = data;
        let validRowsCount = 0;
        let invalidRowsCount = 0;

        // For debugging: Log the first few addresses received
        if (addresses && addresses.length > 0) {
            logger.info(`[ImportService] Received ${addresses.length} addresses. First 2:`);
            logger.info(JSON.stringify(addresses.slice(0, 2), null, 2));
        }

        // Fetch the company by ID to ensure it exists and to get its name for the response
        const company = await prisma.company.findUnique({
            where: { id: companyId },
        });

        if (!company) {
            throw new Error(`Company with ID ${companyId} not found.`);
        }

        // Basic request body validations (mode, addresses array, length)
        if (mode !== 'REPLACE' && mode !== 'APPEND') {
            throw new Error('Invalid import mode. Must be REPLACE or APPEND.');
        }
        if (!Array.isArray(addresses) || addresses.length === 0) {
            throw new Error('Addresses array is required and cannot be empty.');
        }
        if (addresses.length > 5000) {
            // Increased limit since we're now batching
            throw new Error('Too many addresses. Max 5000 allowed per import.');
        }

        // Deduplicate addresses to prevent unique constraint violations
        const uniqueAddresses = new Map<string, ImportAddress>();
        const duplicateCount = { count: 0 };

        addresses.forEach((addr) => {
            const key = addr.address.toLowerCase(); // Normalize for comparison
            if (uniqueAddresses.has(key)) {
                duplicateCount.count++;
                logger.info(`[ImportService] Duplicate address found: ${addr.address}`);
            } else {
                uniqueAddresses.set(key, addr);
            }
        });

        if (duplicateCount.count > 0) {
            logger.info(`[ImportService] Removed ${duplicateCount.count} duplicate addresses. Processing ${uniqueAddresses.size} unique addresses.`);
        }

        // Create import batch first (outside of transaction)
        const importBatch = await prisma.importBatch.create({
            data: {
                company: { connect: { id: companyId } },
                importMode: mode,
                originalFilename: original_filename,
                totalRows: addresses.length, // Keep original count for reporting
                validRowsCount: 0,
                invalidRowsCount: 0,
            },
        });

        logger.info(`[ImportService] Created import batch ${importBatch.id} for ${uniqueAddresses.size} unique addresses`);

        const processedAddressesInfo: { addressId: number; chainType: string; isValid: boolean; originalAddress: ImportAddress }[] = [];

        // Split addresses into batches
        const addressBatches = this.chunkArray(Array.from(uniqueAddresses.values()), this.BATCH_SIZE);
        logger.info(`[ImportService] Split ${uniqueAddresses.size} addresses into ${addressBatches.length} batches of max ${this.BATCH_SIZE} addresses each`);

        // Process each batch in a separate transaction
        for (let batchIndex = 0; batchIndex < addressBatches.length; batchIndex++) {
            const batch = addressBatches[batchIndex];
            logger.info(`[ImportService] Processing batch ${batchIndex + 1}/${addressBatches.length} with ${batch.length} addresses`);

            const batchResult = await this.processBatch(batch, importBatch.id);
            validRowsCount += batchResult.validCount;
            invalidRowsCount += batchResult.invalidCount;
            processedAddressesInfo.push(...batchResult.processedAddresses);

            // Add a small delay between batches to prevent overwhelming the database
            if (batchIndex < addressBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Handle REPLACE mode - deactivate existing addresses
        if (mode === 'REPLACE') {
            logger.info(`[ImportService] REPLACE mode: deactivating existing addresses for company ${companyId}`);
            await prisma.companyAddress.updateMany({
                where: { companyId: companyId, isActive: true },
                data: { isActive: false }, // Soft delete existing active addresses for this company
            });
        }

        // Process company address associations in batches
        await this.processCompanyAddressBatches(processedAddressesInfo, companyId);

        // Update the import batch with final counts
        const finalImportBatch = await prisma.importBatch.update({
            where: { id: importBatch.id },
            data: {
                validRowsCount: validRowsCount,
                invalidRowsCount: invalidRowsCount,
            },
        });

        logger.info(`[ImportService] Import batch ${importBatch.id} completed. Valid: ${validRowsCount}, Invalid: ${invalidRowsCount}`);

        return {
            message: "Import processed.",
            batchId: finalImportBatch.id,
            companyId: companyId,
            companyName: company.name,
            mode: mode,
            totalSubmitted: addresses.length,
            validAddresses: validRowsCount,
            invalidAddresses: invalidRowsCount,
        };
    }

    private async processBatch(
        batch: ImportAddress[],
        importBatchId: number
    ): Promise<{
        validCount: number;
        invalidCount: number;
        processedAddresses: { addressId: number; chainType: string; isValid: boolean; originalAddress: ImportAddress }[];
    }> {
        let validCount = 0;
        let invalidCount = 0;
        const processedAddresses: { addressId: number; chainType: string; isValid: boolean; originalAddress: ImportAddress }[] = [];

        // Process this batch in a single transaction
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            for (const impAddr of batch) {
                let isValid = false;
                let currentChainType = impAddr.chain_type;

                if (currentChainType === 'EVM') {
                    isValid = isValidEVMAddress(impAddr.address);
                } else if (currentChainType === 'TRON') {
                    isValid = isValidTronAddress(impAddr.address);
                } else {
                    isValid = false; // Invalid chain_type
                }

                if (isValid) {
                    validCount++;
                    const uniqueAddress = await tx.address.upsert({
                        where: { address: impAddr.address },
                        update: { chainType: currentChainType },
                        create: { address: impAddr.address, chainType: currentChainType },
                    });

                    processedAddresses.push({
                        addressId: uniqueAddress.id,
                        chainType: uniqueAddress.chainType,
                        isValid: true,
                        originalAddress: impAddr
                    });

                    // Create a record in BatchAddress to link this address to this batch
                    await tx.batchAddress.create({
                        data: {
                            batchId: importBatchId,
                            addressId: uniqueAddress.id,
                            isValid: true,
                            rowData: impAddr as any // Store the full row data including threshold
                        }
                    });
                } else {
                    invalidCount++;
                    // Optionally, create a BatchAddress record with isValid = false if you want to log all attempts
                    // For now, just counting them as per original logic
                }
            }
        }, {
            maxWait: 10000, // 10 seconds
            timeout: 20000, // 20 seconds - much shorter timeout per batch
        });

        return { validCount, invalidCount, processedAddresses };
    }

    private async processCompanyAddressBatches(
        processedAddressesInfo: { addressId: number; chainType: string; isValid: boolean; originalAddress: ImportAddress }[],
        companyId: number
    ): Promise<void> {
        const validAddresses = processedAddressesInfo.filter(addr => addr.isValid);
        const companyAddressBatches = this.chunkArray(validAddresses, this.BATCH_SIZE);

        logger.info(`[ImportService] Processing ${validAddresses.length} company address associations in ${companyAddressBatches.length} batches`);

        for (let batchIndex = 0; batchIndex < companyAddressBatches.length; batchIndex++) {
            const batch = companyAddressBatches[batchIndex];
            logger.info(`[ImportService] Processing company address batch ${batchIndex + 1}/${companyAddressBatches.length} with ${batch.length} addresses`);

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                for (const procAddr of batch) {
                    // Use the threshold, accountName, and accountManager from the individual address in the CSV, if provided
                    const addressThreshold = procAddr.originalAddress.threshold;
                    const accountName = procAddr.originalAddress.accountName;
                    const accountManager = procAddr.originalAddress.accountManager;

                    await tx.companyAddress.upsert({
                        where: { uq_company_address: { companyId: companyId, addressId: procAddr.addressId } },
                        update: {
                            isActive: true,
                            updatedAt: new Date(),
                            threshold: addressThreshold ?? 0, // Use 0 if no threshold provided
                            accountName: accountName ?? null,
                            accountManager: accountManager ?? null
                        },
                        create: {
                            company: { connect: { id: companyId } },
                            address: { connect: { id: procAddr.addressId } },
                            isActive: true,
                            threshold: addressThreshold ?? 0, // Use 0 if no threshold provided
                            accountName: accountName ?? null,
                            accountManager: accountManager ?? null
                        },
                    });
                }
            }, {
                maxWait: 10000, // 10 seconds
                timeout: 20000, // 20 seconds - much shorter timeout per batch
            });

            // Add a small delay between batches to prevent overwhelming the database
            if (batchIndex < companyAddressBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}

export default new ImportService(); 