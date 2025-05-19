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
                // Validate companyName (basic check, service does more)
                const { companyName, mode, addresses } = request.body; // original_filename is optional

                if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
                    return reply.status(400).send({ error: 'Company name is required and must be a non-empty string.' });
                }
                // Other basic validations remain as they were in the service, or can be duplicated here for early exit
                if (mode !== 'REPLACE' && mode !== 'APPEND') {
                    return reply.status(400).send({ error: 'Invalid import mode. Must be REPLACE or APPEND.' });
                }
                if (!Array.isArray(addresses) || addresses.length === 0) {
                    return reply.status(400).send({ error: 'Addresses array is required and cannot be empty.' });
                }
                if (addresses.length > 2000) {
                    return reply.status(413).send({ error: 'Too many addresses. Max 2000 allowed for synchronous import.' });
                }

                const result = await importService.processImport(request.body);
                reply.status(201).send(result);
            } catch (e: any) {
                fastify.log.error(e, 'Error processing import request');
                // Error handling for messages from the service
                if (e.message.includes('Company name is required') ||
                    e.message.includes('Invalid import mode') ||
                    e.message.includes('Addresses array is required')) {
                    reply.status(400).send({ error: e.message });
                } else if (e.message.includes('Too many addresses')) {
                    reply.status(413).send({ error: e.message });
                } else if (e.message.includes('not found')) { // Should not happen with upsert, but good fallback
                    reply.status(404).send({ error: e.message });
                } else {
                    reply.status(500).send({ error: 'Failed to process import.', details: e.message });
                }
            }
        }
    );
};

export default importRoutes; 