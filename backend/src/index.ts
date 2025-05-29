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
import slackRoutes from './routes/slackRoutes';
import { WsConnectionManager } from './services/websocket/wsConnectionManager';
import { TokenService } from './services/token/tokenService';
import logger from './config/logger';

// Create an event handler function
const handleWebSocketEvent = (event: any) => {
    if (event.type === 'NATIVE') {
        logger.info(`[${event.chainId}] Native transfer detected:`, {
            from: event.data.from,
            to: event.data.to,
            value: event.data.value.toString(),
            hash: event.data.hash
        });
    } else if (event.type === 'ERC20') {
        logger.info(`[${event.chainId}] Token transfer detected:`, {
            from: event.data.from,
            to: event.data.to,
            value: event.data.value.toString(),
            token: event.data.tokenContract,
            hash: event.data.transactionHash
        });
    }
};

const server: FastifyInstance = Fastify({ logger: true });

server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Register feature modules
server.register(companyRoutes, { prefix: '/companies' });
server.register(importRoutes, { prefix: '/imports' });
server.register(slackRoutes, { prefix: '/api/v1/slack' });

// Initialize Token Service
const tokenService = TokenService.getInstance();

// Initialize WebSocket Connection Managers
const evmWsManager = new WsConnectionManager(5, 'evm'); // Refresh addresses every 5 minutes
const tronWsManager = new WsConnectionManager(5, 'tron'); // Refresh addresses every 5 minutes

// Set event handlers
evmWsManager.setEventHandler(handleWebSocketEvent);
tronWsManager.setEventHandler(handleWebSocketEvent);

// Start WebSocket connections
const startBlockchainMonitoring = async () => {
    try {
        // Start token service first
        await tokenService.start();
        logger.info('Token service started successfully');

        // Start EVM monitoring
        await evmWsManager.startConnections();
        logger.info('EVM blockchain monitoring started successfully');

        // Start Tron monitoring
        await tronWsManager.startConnections();
        logger.info('Tron blockchain monitoring started successfully');
    } catch (error) {
        logger.error('Failed to start blockchain monitoring:', error);
    }
};

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

// Add API route to switch blockchain monitoring mode
server.post('/api/monitoring/mode', async (request, reply) => {
    try {
        const { mode } = request.body as { mode: 'evm' | 'tron' | 'both' };

        if (!mode || !['evm', 'tron', 'both'].includes(mode)) {
            return reply.status(400).send({
                status: 'error',
                message: 'Invalid mode. Must be "evm", "tron", or "both".'
            });
        }

        // Stop all monitoring first
        evmWsManager.stopConnections();
        tronWsManager.stopConnections();
        logger.info(`Stopped all blockchain monitoring`);

        // Start requested monitoring mode(s)
        if (mode === 'evm' || mode === 'both') {
            await evmWsManager.startConnections();
            logger.info('EVM blockchain monitoring started');
        }

        if (mode === 'tron' || mode === 'both') {
            await tronWsManager.startConnections();
            logger.info('Tron blockchain monitoring started');
        }

        return {
            status: 'success',
            message: `Monitoring mode switched to ${mode}`,
            activeMonitoring: {
                evm: mode === 'evm' || mode === 'both',
                tron: mode === 'tron' || mode === 'both'
            }
        };
    } catch (error: any) {
        logger.error('Error switching monitoring mode:', error);
        return reply.status(500).send({
            status: 'error',
            message: 'Failed to switch monitoring mode',
            details: error.message
        });
    }
});

// Add API route to get current monitoring status
server.get('/api/monitoring/status', async (request, reply) => {
    return {
        status: 'success',
        monitoring: {
            evm: evmWsManager.isRunning(),
            tron: tronWsManager.isRunning(),
            addressCount: {
                evm: evmWsManager.getTrackedAddressCount(),
                tron: tronWsManager.getTrackedAddressCount()
            }
        }
    };
});

const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
        await server.listen({ port, host: '0.0.0.0' });
        server.log.info(`Server listening on port ${port}`);

        // Start blockchain monitoring after server is up
        await startBlockchainMonitoring();
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down server...');

    // Stop blockchain monitoring
    evmWsManager.stopConnections();
    tronWsManager.stopConnections();
    tokenService.stop();

    // Close server
    await server.close();
    logger.info('Server shutdown complete');
    process.exit(0);
});

start(); 