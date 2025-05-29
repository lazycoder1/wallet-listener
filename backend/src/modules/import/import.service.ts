import prisma from '../../prisma'; // Adjusted path to import from src/prisma.ts
import { Prisma, PrismaClient } from '@prisma/client';
import type { ImportAddress, ImportRequestBody } from './import.types';
import { isValidEVMAddress, isValidTronAddress } from '../../utils/validators';

export class ImportService {
    async processImport(data: ImportRequestBody) {
        const { companyId, mode, addresses, original_filename } = data;
        let validRowsCount = 0;
        let invalidRowsCount = 0;

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
        if (addresses.length > 2000) {
            // This limit might be better enforced at controller/route level
            // Or service can return a specific error type for it
            throw new Error('Too many addresses. Max 2000 allowed for synchronous import.');
        }

        const processedAddressesInfo: { addressId: number; chainType: string; isValid: boolean; originalAddress: ImportAddress }[] = [];

        const importResult = await prisma.$transaction(async (tx: PrismaClient) => {
            const importBatch = await tx.importBatch.create({
                data: {
                    company: { connect: { id: companyId } },
                    importMode: mode,
                    originalFilename: original_filename,
                    totalRows: addresses.length,
                    validRowsCount: 0,
                    invalidRowsCount: 0,
                },
            });

            for (const impAddr of addresses) {
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
                    validRowsCount++;
                    const uniqueAddress = await tx.address.upsert({
                        where: { address: impAddr.address },
                        update: { chainType: currentChainType },
                        create: { address: impAddr.address, chainType: currentChainType },
                    });

                    processedAddressesInfo.push({
                        addressId: uniqueAddress.id,
                        chainType: uniqueAddress.chainType,
                        isValid: true,
                        originalAddress: impAddr
                    });

                    // Create a record in BatchAddress to link this address to this batch
                    await tx.batchAddress.create({
                        data: {
                            batchId: importBatch.id,
                            addressId: uniqueAddress.id,
                            isValid: true,
                            rowData: impAddr // Store the full row data including threshold
                        }
                    });
                } else {
                    invalidRowsCount++;
                    // Optionally, create a BatchAddress record with isValid = false if you want to log all attempts
                    // For now, just counting them as per original logic
                }
            }

            if (mode === 'REPLACE') {
                await tx.companyAddress.updateMany({
                    where: { companyId: companyId, isActive: true },
                    data: { isActive: false }, // Soft delete existing active addresses for this company
                });
            }

            for (const procAddr of processedAddressesInfo) {
                if (procAddr.isValid) {
                    // Use the threshold from the individual address in the CSV, if provided
                    const addressThreshold = procAddr.originalAddress.threshold;

                    await tx.companyAddress.upsert({
                        where: { uq_company_address: { companyId: companyId, addressId: procAddr.addressId } },
                        update: {
                            isActive: true,
                            updatedAt: new Date(),
                            threshold: addressThreshold ?? 0 // Use 0 if no threshold provided
                        },
                        create: {
                            company: { connect: { id: companyId } },
                            address: { connect: { id: procAddr.addressId } },
                            isActive: true,
                            threshold: addressThreshold ?? 0 // Use 0 if no threshold provided
                        },
                    });
                }
            }

            const finalImportBatch = await tx.importBatch.update({
                where: { id: importBatch.id },
                data: {
                    validRowsCount: validRowsCount,
                    invalidRowsCount: invalidRowsCount,
                },
            });

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
        }, {
            maxWait: 30000, // Maximum time Prisma Client will wait to acquire a transaction from the pool
            timeout: 30000, // Maximum time the transaction can run for
        });

        return importResult;
    }
}

export default new ImportService(); 