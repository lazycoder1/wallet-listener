import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import companyService from './company.service';
import type { CompanyParams, CreateCompanyBody, UpdateCompanyBody } from './company.types';
import { Prisma } from '@prisma/client';

const companyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // POST /companies - Create a new company
    fastify.post<
        { Body: CreateCompanyBody }
    >(
        '/', // Route path is now relative to the prefix defined when registering this plugin
        async (request, reply) => {
            try {
                const { name } = request.body;
                if (!name || typeof name !== 'string' || name.trim() === '') {
                    reply.status(400).send({ error: 'Company name is required and must be a non-empty string.' });
                    return;
                }
                const newCompany = await companyService.createCompany({ name });
                reply.status(201).send(newCompany);
            } catch (e: any) {
                fastify.log.error(e);
                if (e.message === 'A company with this name already exists.') {
                    reply.status(409).send({ error: e.message });
                } else {
                    reply.status(500).send({ error: 'Internal Server Error' });
                }
            }
        }
    );

    // GET /companies - List all companies
    fastify.get('/', async (request, reply) => {
        try {
            const companies = await companyService.getAllCompanies();
            reply.send(companies);
        } catch (e: any) {
            fastify.log.error(e);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /companies/:id - Get a single company by ID
    fastify.get<
        { Params: CompanyParams }
    >('/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const companyId = parseInt(id, 10);
            if (isNaN(companyId)) {
                reply.status(400).send({ error: 'Invalid company ID format.' });
                return;
            }
            const company = await companyService.getCompanyById(companyId);
            reply.send(company);
        } catch (e: any) {
            fastify.log.error(e);
            if (e.message === 'Company not found.') {
                reply.status(404).send({ error: e.message });
            } else {
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        }
    });

    // PUT /companies/:id - Update a company
    fastify.put<
        { Body: UpdateCompanyBody, Params: CompanyParams }
    >('/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const companyId = parseInt(id, 10);
            if (isNaN(companyId)) {
                reply.status(400).send({ error: 'Invalid company ID format.' });
                return;
            }

            const { name } = request.body;
            if (!name || typeof name !== 'string' || name.trim() === '') {
                reply.status(400).send({ error: 'Company name is required and must be a non-empty string.' });
                return;
            }
            const updatedCompany = await companyService.updateCompanyById(companyId, { name });
            reply.send(updatedCompany);
        } catch (e: any) {
            fastify.log.error(e);
            if (e.message === 'Company not found to update.') {
                reply.status(404).send({ error: e.message });
            } else if (e.message === 'Another company with this name already exists.') {
                reply.status(409).send({ error: e.message });
            } else {
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        }
    });

    // DELETE /companies/:id - Delete a company
    fastify.delete<
        { Params: CompanyParams }
    >('/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const companyId = parseInt(id, 10);
            if (isNaN(companyId)) {
                reply.status(400).send({ error: 'Invalid company ID format.' });
                return;
            }
            await companyService.deleteCompanyById(companyId);
            reply.status(204).send();
        } catch (e: any) {
            fastify.log.error(e);
            if (e.message === 'Company not found to delete.') {
                reply.status(404).send({ error: e.message });
            } else {
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        }
    });
};

export default companyRoutes; 