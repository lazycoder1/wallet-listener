import prisma from '../../prisma';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Specific import for error type
import type { CreateCompanyBody, UpdateCompanyBody, SlackConfigurationInput } from './company.types';
import { Decimal } from '@prisma/client/runtime/library';

// Helper to build SlackConfig data for create/update operations
const buildSlackConfigPayload = (configInput: SlackConfigurationInput): any => {
    const payload: any = {}; // Changed to any
    if (configInput.channelId !== undefined) {
        payload.channelId = configInput.channelId;
    }
    if (configInput.channelName !== undefined) {
        payload.channelName = configInput.channelName;
    }
    if (configInput.alertThreshold !== undefined) {
        payload.alertThreshold = new Decimal(configInput.alertThreshold.toString());
    }
    if (configInput.isEnabled !== undefined) {
        payload.isEnabled = configInput.isEnabled;
    }
    if (configInput.slackTeamId !== undefined) {
        payload.slackTeamId = configInput.slackTeamId;
    }
    if (configInput.slackTeamName !== undefined) {
        payload.slackTeamName = configInput.slackTeamName;
    }
    return payload;
};

export class CompanyService {
    async createCompany(data: CreateCompanyBody) {
        const { name, slackConfiguration: slackConfigInput } = data;

        const companyCreateData: Prisma.CompanyCreateInput = {
            name: name.trim(),
        };

        // Only create a slack configuration if a slackTeamId is provided.
        // This is the mandatory field.
        if (slackConfigInput && slackConfigInput.slackTeamId) {
            const slackData = buildSlackConfigPayload(slackConfigInput);

            if (Object.keys(slackData).length > 0) {
                companyCreateData.slackConfiguration = {
                    create: slackData as Prisma.SlackConfigurationCreateWithoutCompanyInput,
                };
            }
        }

        try {
            return await prisma.company.create({
                data: companyCreateData,
                include: {
                    slackConfiguration: true,
                },
            });
        } catch (e: any) {
            if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                const target = e.meta?.target as string[] | undefined;
                if (target?.includes('name')) {
                    throw new Error('A company with this name already exists.');
                }
            }
            throw e;
        }
    }

    async getAllCompanies() {
        return prisma.company.findMany({
            include: {
                slackConfiguration: true,
            },
        });
    }

    async getCompanyById(id: number) {
        const company = await prisma.company.findUnique({
            where: { id },
            include: {
                slackConfiguration: true,
            },
        });
        if (!company) {
            throw new Error('Company not found.');
        }
        return company;
    }

    async updateCompanyById(id: number, data: UpdateCompanyBody) {
        const { name, slackConfiguration: slackConfigInput } = data;

        if (!name && (!slackConfigInput || Object.keys(slackConfigInput).length === 0)) {
            throw new Error("No data provided for update. Name or non-empty slackConfiguration must be present.");
        }

        const companyUpdateData: any = {}; // Changed to any
        if (name) {
            companyUpdateData.name = name.trim();
        }

        if (slackConfigInput && Object.keys(slackConfigInput).length > 0) {
            // Fetch existing config to merge required fields
            const existingConfig = await prisma.slackConfiguration.findUnique({ where: { companyId: id } });
            const slackData = {
                ...(existingConfig || {}),
                ...buildSlackConfigPayload(slackConfigInput),
            };
            // Remove fields Prisma doesn't allow on create/update
            delete slackData.id;
            delete slackData.companyId;
            delete slackData.createdAt;
            delete slackData.updatedAt;
            companyUpdateData.slackConfiguration = {
                upsert: {
                    create: slackData,
                    update: slackData,
                },
            };
        }

        try {
            return await prisma.company.update({
                where: { id },
                data: companyUpdateData,
                include: {
                    slackConfiguration: true,
                },
            });
        } catch (e: any) {
            if (e instanceof PrismaClientKnownRequestError) {
                if (e.code === 'P2025') {
                    throw new Error('Company not found to update.');
                }
                if (e.code === 'P2002') {
                    const target = e.meta?.target as string[] | undefined;
                    if (target?.includes('name')) {
                        throw new Error('Another company with this name already exists.');
                    }
                }
            }
            throw e;
        }
    }

    async deleteCompanyById(id: number) {
        try {
            return await prisma.company.delete({
                where: { id },
                include: { slackConfiguration: true }
            });
        } catch (e: any) {
            if (e instanceof PrismaClientKnownRequestError && e.code === 'P2025') {
                throw new Error('Company not found to delete.');
            }
            if (e instanceof PrismaClientKnownRequestError && e.code === 'P2003') {
                throw new Error('Cannot delete company. It may have associated data (like addresses) that must be removed first.');
            }
            throw e;
        }
    }
}

export default new CompanyService(); 