import prisma from '../../prisma'; // Adjusted path to import from src/prisma.ts
import { Prisma } from '@prisma/client';
import type { ImportAddress, ImportRequestBody } from './import.types';
import { isValidEVMAddress, isValidTronAddress } from '../../utils/validators';

export class ImportService {
    async processImport(data: ImportRequestBody) {
        const { companyName, mode, addresses, original_filename } = data;
        let validRowsCount = 0;
        let invalidRowsCount = 0;

        if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
            throw new Error('Company name is required and must be a non-empty string.');
        }

        // Upsert company: find by name or create if not exists
        const company = await prisma.company.upsert({
            where: { name: companyName.trim() },
            update: {}, // No fields to update if found, just need its ID
            create: { name: companyName.trim() },
        });
        const companyId = company.id; // Use the ID of the found or created company

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

        const importResult = await prisma.$transaction(async (tx) => {
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
                        where: { address: impAddr.address }, // Assuming address string itself is unique globally
                        update: { chainType: currentChainType }, // Potentially update chainType if it changed (unlikely)
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
                            isValid: true, // RowData could be stored here if needed from impAddr
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
                    await tx.companyAddress.upsert({
                        where: { uq_company_address: { companyId: companyId, addressId: procAddr.addressId } },
                        update: { isActive: true, updatedAt: new Date() }, // Ensure it's active, update timestamp
                        create: {
                            company: { connect: { id: companyId } },
                            address: { connect: { id: procAddr.addressId } },
                            isActive: true,
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
        });

        return importResult;
    }
}

export default new ImportService(); 