import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import importService from './import.service';
import type { ImportRequestBody } from './import.types';

const importRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.post<
        { Body: ImportRequestBody }
    >(
        '/', // Path will be relative to the prefix when registered in index.ts (e.g., /imports)
        async (request, reply) => {
            try {
                const { companyId, mode, addresses, original_filename } = request.body;

                if (!companyId || typeof companyId !== 'number' || companyId <= 0) {
                    return reply.status(400).send({ error: 'Company ID is required and must be a positive number.' });
                }

                if (mode !== 'REPLACE' && mode !== 'APPEND') {
                    return reply.status(400).send({ error: 'Invalid import mode. Must be REPLACE or APPEND.' });
                }
                if (!Array.isArray(addresses) || addresses.length === 0) {
                    return reply.status(400).send({ error: 'Addresses array is required and cannot be empty.' });
                }
                if (addresses.length > 2000) {
                    return reply.status(413).send({ error: 'Too many addresses. Max 2000 allowed for synchronous import.' });
                }

                // Pass the original_filename if present
                const importData: ImportRequestBody = {
                    companyId,
                    mode,
                    addresses,
                    ...(original_filename && { original_filename }),
                };

                const result = await importService.processImport(importData);
                reply.status(201).send(result);
            } catch (e: any) {
                fastify.log.error(e, 'Error processing import request');
                // Simplified error handling, specific messages come from service or Prisma errors
                if (e.message.includes('required') || e.message.includes('Invalid') || e.message.includes('must be')) {
                    reply.status(400).send({ error: e.message });
                } else if (e.message.includes('Too many addresses')) {
                    reply.status(413).send({ error: e.message });
                } else if (e.message.toLowerCase().includes('not found')) {
                    reply.status(404).send({ error: e.message }); // e.g. Company not found by ID
                } else {
                    reply.status(500).send({ error: 'Failed to process import.', details: e.message });
                }
            }
        }
    );
};

export default importRoutes; 