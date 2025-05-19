import prisma from '../../prisma'; // Adjusted path to import from src/prisma.ts
import { Prisma } from '@prisma/client';
import type { CreateCompanyBody, UpdateCompanyBody } from './company.types';

export class CompanyService {
    async createCompany(data: CreateCompanyBody) {
        try {
            const newCompany = await prisma.company.create({
                data: {
                    name: data.name.trim(),
                },
            });
            return newCompany;
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const target = e.meta?.target as string[] | undefined;
                if (target?.includes('name')) {
                    throw new Error('A company with this name already exists.'); // Or a custom error
                }
            }
            throw e; // Re-throw other errors
        }
    }

    async getAllCompanies() {
        return prisma.company.findMany();
    }

    async getCompanyById(id: number) {
        const company = await prisma.company.findUnique({
            where: { id },
        });
        if (!company) {
            throw new Error('Company not found.'); // Or a custom error
        }
        return company;
    }

    async updateCompanyById(id: number, data: UpdateCompanyBody) {
        try {
            const updatedCompany = await prisma.company.update({
                where: { id },
                data: { name: data.name.trim() },
            });
            return updatedCompany;
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
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
            await prisma.company.delete({
                where: { id },
            });
            return true; // Indicate success
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                throw new Error('Company not found to delete.');
            }
            throw e;
        }
    }
}

export default new CompanyService(); 