import prisma from '../../prisma';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Specific import for error type
import type { CreateCompanyBody, UpdateCompanyBody, SlackConfigurationInput } from './company.types';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../../config/logger'; // Import logger

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
        // Ensure alertThreshold is a string before creating Decimal
        const thresholdString = typeof configInput.alertThreshold === 'number'
            ? configInput.alertThreshold.toString()
            : configInput.alertThreshold;
        payload.alertThreshold = new Decimal(thresholdString);
    }
    if (configInput.isEnabled !== undefined) {
        payload.isEnabled = configInput.isEnabled;
    }
    logger.info({ msg: 'Built slackData payload in buildSlackConfigPayload', payload }); // Log built payload
    return payload;
};

export class CompanyService {
    async createCompany(data: CreateCompanyBody) {
        const { name, slackConfiguration: slackConfigInput } = data;
        logger.info({ msg: 'createCompany service called with slackConfigInput', slackConfigInput }); // Log input

        const companyCreateData: Prisma.CompanyCreateInput = { // Use Prisma type
            name: name.trim(),
        };

        if (slackConfigInput && Object.keys(slackConfigInput).length > 0) {
            const slackData = buildSlackConfigPayload(slackConfigInput);
            logger.info({ msg: 'slackData in createCompany after build', slackData }); // Log processed slackData
            logger.info(`Object.keys(slackData).length: ${Object.keys(slackData).length}`);

            if (Object.keys(slackData).length > 0) {
                companyCreateData.slackConfiguration = {
                    create: slackData,
                };
            } else {
                logger.warn('slackData was empty, not creating slackConfiguration.');
            }
        }

        logger.info({ msg: 'Final companyCreateData before Prisma call', companyCreateData }); // Log final data
        try {
            return await prisma.company.create({
                data: companyCreateData,
                include: {
                    slackConfiguration: true,
                },
            });
        } catch (e: any) {
            logger.error({ error: e, msg: 'Error in createCompany Prisma call' });
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
        logger.info({ msg: 'updateCompanyById service called with slackConfigInput', id, slackConfigInput }); // Log input

        const companyUpdateData: Prisma.CompanyUpdateInput = {}; // Use Prisma type
        if (name) {
            companyUpdateData.name = name.trim();
        }

        if (slackConfigInput && Object.keys(slackConfigInput).length > 0) {
            const slackData = buildSlackConfigPayload(slackConfigInput);
            logger.info({ msg: 'slackData in updateCompanyById after build', id, slackData }); // Log processed slackData
            logger.info(`Object.keys(slackData).length for update: ${Object.keys(slackData).length}`);

            if (Object.keys(slackData).length > 0) {
                companyUpdateData.slackConfiguration = {
                    upsert: {
                        create: slackData,
                        update: slackData,
                    },
                };
            } else {
                logger.warn({ msg: 'slackData was empty, not upserting slackConfiguration.', id });
            }
        } else if (slackConfigInput && Object.keys(slackConfigInput).length === 0) {
            // Handle case where slackConfiguration is an empty object {}
            // This might mean "remove" or "do nothing" depending on desired logic.
            // For now, if it's empty, we don't add it to companyUpdateData, so Prisma won't touch it.
            logger.info({ msg: 'slackConfigInput was an empty object, not modifying slackConfiguration.', id });
        }

        if (Object.keys(companyUpdateData).length === 0) {
            logger.warn({ msg: 'No data to update for company.', id });
            // Optionally, fetch and return the company if no actual update happens
            // to prevent breaking change if caller expects a company object.
            // However, typically an update with no data should be an error or no-op.
            // For now, let Prisma handle it (it might throw an error if data is empty).
            // Consider throwing an error here: throw new Error("No data provided for update.");
        }

        logger.info({ msg: 'Final companyUpdateData before Prisma call', id, companyUpdateData: JSON.parse(JSON.stringify(companyUpdateData, (key, value) => typeof value === 'bigint' ? value.toString() : value)) });

        try {
            return await prisma.company.update({
                where: { id },
                data: companyUpdateData,
                include: {
                    slackConfiguration: true,
                },
            });
        } catch (e: any) {
            logger.error({ error: e, msg: 'Error in updateCompanyById Prisma call', id });
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