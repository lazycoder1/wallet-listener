import { PrismaClient } from '@prisma/client';
import type { Hex } from 'viem';

export class AddressService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async getActiveAddresses(): Promise<Hex[]> {
        try {
            const activeCompanyAddresses = await this.prisma.companyAddress.findMany({
                where: { isActive: true },
                select: { address: { select: { address: true } } }
            });

            return activeCompanyAddresses.map(ca =>
                ca.address.address.toLowerCase() as Hex
            );
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

            await this.prisma.address.upsert({
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
                                companyId_addressId: {
                                    companyId,
                                    addressId: (await this.prisma.address.findUnique({
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