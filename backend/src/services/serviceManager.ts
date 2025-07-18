import logger from '../config/logger';
import { httpClient } from './httpClient';

export interface Service {
    name: string;
    start: () => Promise<void>;
    stop: () => void | Promise<void>;
}

export class ServiceManager {
    private static instance: ServiceManager;
    private services: Map<string, Service> = new Map();
    private isShuttingDown = false;

    private constructor() { }

    public static getInstance(): ServiceManager {
        if (!ServiceManager.instance) {
            ServiceManager.instance = new ServiceManager();
        }
        return ServiceManager.instance;
    }

    public registerService(service: Service): void {
        if (this.services.has(service.name)) {
            logger.warn(`Service ${service.name} is already registered. Overwriting.`);
        }
        this.services.set(service.name, service);
        logger.info(`Service ${service.name} registered`);
    }

    public async startAll(): Promise<void> {
        logger.info(`Starting ${this.services.size} services...`);

        const startPromises = Array.from(this.services.entries()).map(async ([name, service]) => {
            try {
                await service.start();
                logger.info(`Service ${name} started successfully`);
            } catch (error) {
                logger.error(`Failed to start service ${name}:`, error);
                throw error;
            }
        });

        await Promise.all(startPromises);
        logger.info('All services started successfully');
    }

    public async stopAll(): Promise<void> {
        if (this.isShuttingDown) {
            logger.warn('Service manager is already shutting down');
            return;
        }

        this.isShuttingDown = true;
        logger.info(`Stopping ${this.services.size} services...`);

        const stopPromises = Array.from(this.services.values()).map(async (service) => {
            try {
                await service.stop();
                logger.info(`Service ${service.name} stopped successfully`);
            } catch (error) {
                logger.error(`Error stopping service ${service.name}:`, error);
            }
        });

        await Promise.allSettled(stopPromises);

        // Clean up HTTP client connections
        try {
            await httpClient.cleanup();
            logger.info('HTTP client cleanup completed');
        } catch (error) {
            logger.error('Error cleaning up HTTP client:', error);
        }

        this.services.clear();
        logger.info('All services stopped');
    }

    public getService(name: string): Service | undefined {
        return this.services.get(name);
    }

    public getServiceCount(): number {
        return this.services.size;
    }

    public isShutdownInProgress(): boolean {
        return this.isShuttingDown;
    }
} 