import { prisma } from '../../prisma';
import logger from '../../config/logger';
import type { Hex } from 'viem';

export class AddressService {
    constructor() {
        // No longer need to create a new PrismaClient instance
    }

    async getActiveAddresses(): Promise<string[]> {
        try {
            const activeCompanyAddresses = await prisma.companyAddress.findMany({
                where: { isActive: true },
                select: { address: { select: { address: true } } }
            });

            return activeCompanyAddresses.map((ca: { address: { address: string } }) => ca.address.address);
        } catch (error) {
            console.error('Error fetching active addresses:', error);
            return [];
        }
    }

    async validateAddress(address: string): Promise<boolean> {
        // EVM address validation
        if (address.startsWith('0x')) {
            return /^0x[a-fA-F0-9]{40}$/.test(address);
        }
        // Tron address validation
        if (address.startsWith('TR')) {
            return /^TR[a-zA-Z0-9]{40}$/.test(address);
        }
        return false;
    }

    async addAddress(address: string, companyId: number): Promise<boolean> {
        try {
            if (!await this.validateAddress(address)) {
                return false;
            }

            await prisma.address.upsert({
                where: { address },
                create: {
                    address,
                    chainType: address.startsWith('0x') ? 'EVM' : 'TRON',
                    companyAddresses: {
                        create: {
                            companyId,
                            isActive: true
                        }
                    }
                },
                update: {
                    companyAddresses: {
                        upsert: {
                            where: {
                                uq_company_address: {
                                    companyId,
                                    addressId: (await prisma.address.findUnique({
                                        where: { address }
                                    }))?.id || 0
                                }
                            },
                            create: {
                                companyId,
                                isActive: true
                            },
                            update: {
                                isActive: true
                            }
                        }
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Error adding address:', error);
            return false;
        }
    }
} 