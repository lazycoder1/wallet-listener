import Fastify from 'fastify';
import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
// Prisma types import can be removed if not used elsewhere in this file.
// import { Prisma } from '@prisma/client'; 
import cors from '@fastify/cors';
import { prisma } from './prisma';
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
import { ServiceManager } from './services/serviceManager';
import { MemoryLeakDetector } from './services/memoryLeakDetector';
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
const evmWsManager = new WsConnectionManager(5, 'EVM'); // Refresh addresses every 5 minutes
const tronWsManager = new WsConnectionManager(5, 'TRON'); // Refresh addresses every 5 minutes

// Set event handlers
evmWsManager.setEventHandler(handleWebSocketEvent);
tronWsManager.setEventHandler(handleWebSocketEvent);

// Initialize service manager
const serviceManager = ServiceManager.getInstance();

// Register services with the service manager
serviceManager.registerService({
    name: 'TokenService',
    start: async () => await tokenService.start(),
    stop: () => tokenService.stop()
});

serviceManager.registerService({
    name: 'EVMWebSocketManager',
    start: async () => await evmWsManager.startConnections(),
    stop: () => evmWsManager.stopConnections()
});

serviceManager.registerService({
    name: 'TronWebSocketManager',
    start: async () => await tronWsManager.startConnections(),
    stop: () => tronWsManager.stopConnections()
});

// Initialize Memory Leak Detector
const memoryLeakDetector = MemoryLeakDetector.getInstance();

// Register services with the service manager
serviceManager.registerService({
    name: 'MemoryLeakDetector',
    start: async () => memoryLeakDetector.startMonitoring(),
    stop: async () => memoryLeakDetector.stopMonitoring()
});

// Add memory monitoring
const memoryMonitor = setInterval(() => {
    const memUsage = process.memoryUsage();

    logger.info('Memory usage:', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
        arrayBuffers: `${Math.round(memUsage.arrayBuffers / 1024 / 1024)} MB`,
        heapUsagePercent: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`
    });

    // Check for potential memory leaks
    if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
        logger.warn('High memory usage detected. Consider investigating for memory leaks.');
    }

    if ((memUsage.heapUsed / memUsage.heapTotal) > 0.9) { // 90% heap usage
        logger.warn('Heap usage is very high. Consider garbage collection or memory optimization.');
    }
}, 60000); // Log every minute

// Add garbage collection monitoring
let gcMonitor: NodeJS.Timeout | null = null;
if (global.gc) {
    gcMonitor = setInterval(() => {
        const beforeGC = process.memoryUsage();
        global.gc!();
        const afterGC = process.memoryUsage();

        const freedMemory = beforeGC.heapUsed - afterGC.heapUsed;
        if (freedMemory > 10 * 1024 * 1024) { // If more than 10MB was freed
            logger.info(`Garbage collection freed ${Math.round(freedMemory / 1024 / 1024)} MB`);
        }
    }, 300000); // Run GC every 5 minutes
} else {
    logger.warn('Garbage collection monitoring not available. Run with --expose-gc flag for better memory management.');
}

// Clean up memory monitor on shutdown
const cleanupMemoryMonitor = () => {
    if (memoryMonitor) {
        clearInterval(memoryMonitor);
        logger.info('Memory monitoring stopped');
    }
    if (gcMonitor) {
        clearInterval(gcMonitor);
        logger.info('GC monitoring stopped');
    }
};

// Start WebSocket connections
const startBlockchainMonitoring = async () => {
    try {
        // Start all services using the service manager
        await serviceManager.startAll();
        logger.info('All blockchain monitoring services started successfully');
    } catch (error) {
        logger.error('Failed to start blockchain monitoring:', error);
        throw error;
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
        const { mode } = request.body as { mode: 'EVM' | 'TRON' | 'both' };

        if (!mode || !['EVM', 'TRON', 'both'].includes(mode)) {
            return reply.status(400).send({
                status: 'error',
                message: 'Invalid mode. Must be "EVM", "TRON", or "both".'
            });
        }

        // Stop all monitoring first
        await serviceManager.stopAll();
        logger.info(`Stopped all blockchain monitoring`);

        // Start requested monitoring mode(s)
        if (mode === 'EVM' || mode === 'both') {
            const evmService = serviceManager.getService('EVMWebSocketManager');
            if (evmService) {
                await evmService.start();
                logger.info('EVM blockchain monitoring started');
            }
        }

        if (mode === 'TRON' || mode === 'both') {
            const tronService = serviceManager.getService('TronWebSocketManager');
            if (tronService) {
                await tronService.start();
                logger.info('Tron blockchain monitoring started');
            }
        }

        return {
            status: 'success',
            message: `Monitoring mode switched to ${mode}`,
            activeMonitoring: {
                evm: mode === 'EVM' || mode === 'both',
                tron: mode === 'TRON' || mode === 'both'
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
    const memoryStats = memoryLeakDetector.getMemoryStats();
    return {
        status: 'success',
        monitoring: {
            evm: evmWsManager.isRunning(),
            tron: tronWsManager.isRunning(),
            addressCount: {
                evm: evmWsManager.getTrackedAddressCount(),
                tron: tronWsManager.getTrackedAddressCount()
            }
        },
        memory: {
            current: memoryStats.current ? {
                rss: `${Math.round(memoryStats.current.rss / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(memoryStats.current.heapTotal / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(memoryStats.current.heapUsed / 1024 / 1024)} MB`,
                external: `${Math.round(memoryStats.current.external / 1024 / 1024)} MB`,
                arrayBuffers: `${Math.round(memoryStats.current.arrayBuffers / 1024 / 1024)} MB`
            } : null,
            trend: memoryStats.trend,
            growthRate: `${Math.round(memoryStats.growthRate)} MB/min`
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

    try {
        // Stop all services using the service manager
        await serviceManager.stopAll();

        // Close all Prisma connections
        await prisma.$disconnect();
        logger.info('Database connections closed');

        // Close server
        await server.close();
        logger.info('Server shutdown complete');

        // Clean up memory monitor
        cleanupMemoryMonitor();

        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Also handle SIGTERM for containerized environments
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');

    try {
        // Stop all services using the service manager
        await serviceManager.stopAll();

        // Close all Prisma connections
        await prisma.$disconnect();
        logger.info('Database connections closed');

        // Close server
        await server.close();
        logger.info('Server shutdown complete');

        // Clean up memory monitor
        cleanupMemoryMonitor();

        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

start(); 