import Fastify from 'fastify';
import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
// Prisma types import can be removed if not used elsewhere in this file.
// import { Prisma } from '@prisma/client'; 
import cors from '@fastify/cors';
import prisma from './prisma';
// Unused validator import, can be removed if not used by remaining routes (e.g. health)
// import { isValidEVMAddress, isValidTronAddress } from './utils/validators'; 
// Unused company type imports, can be removed
// import type { CompanyParams, CreateCompanyBody, UpdateCompanyBody } from './modules/company/company.types';
import companyRoutes from './modules/company/company.routes';
// Unused import types, can be removed
// import type { ImportAddress, ImportRequestBody } from './modules/import/import.types';
import importRoutes from './modules/import/import.routes';
import { WsConnectionManager } from './services/websocket/wsConnectionManager';
import { handleWebSocketEvent } from './services/websocket/wsEventHandler';

const server: FastifyInstance = Fastify({ logger: true });

server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Register feature modules
server.register(companyRoutes, { prefix: '/companies' });
server.register(importRoutes, { prefix: '/imports' });

// Initialize WebSocket Connection Manager
const wsManager = new WsConnectionManager(5); // Refresh addresses every 5 minutes
wsManager.setEventHandler(handleWebSocketEvent);

// Start WebSocket connections
wsManager.startConnections().catch(error => {
    console.error('Failed to start WebSocket connections:', error);
});

// --- Health check route ---
server.get('/health', async (request, reply) => {
    // Check Prisma connection as part of health check
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', database: 'connected' };
    } catch (dbError: any) {
        server.log.error(dbError, 'Health check: Database connection failed');
        reply.status(503).send({ status: 'error', database: 'disconnected', details: dbError.message });
    }
});

const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
        await server.listen({ port, host: '0.0.0.0' });
        server.log.info(`Server listening on port ${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start(); 