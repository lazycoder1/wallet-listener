import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../../config/logger';
import axios from 'axios';
import { config as appConfig } from '../../config';

interface TokenMetadata {
    symbol: string;
    name: string;
    decimals: number;
    price?: number;
    addresses?: {
        ethereum?: string;
        polygon?: string;
        bsc?: string;
        tron?: string;
    };
}

interface TokenAddressData {
    chain: string;
    address: string;
}

interface TokenWithAddresses {
    id: number;
    symbol: string;
    name: string;
    decimals: number;
    price: number | null;
    lastPriceUpdate: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    addresses: TokenAddressData[];
}

interface AlchemyPriceResponse {
    data: Array<{
        symbol: string;
        prices: Array<{
            currency: string;
            value: string;
            lastUpdatedAt: string;
        }>;
        error?: string;
    }>;
}

export class TokenService {
    private static instance: TokenService;
    private prisma: PrismaClient;
    private refreshInterval: NodeJS.Timeout | null = null;
    private readonly REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly ALCHEMY_API_URL = 'https://api.g.alchemy.com/prices/v1';
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 5000; // 5 seconds
    private isFetching: boolean = false;
    private lastFetchTime: Date | null = null;
    private consecutiveFailures: number = 0;

    private constructor() {
        this.prisma = new PrismaClient();
    }

    public static getInstance(): TokenService {
        if (!TokenService.instance) {
            TokenService.instance = new TokenService();
        }
        return TokenService.instance;
    }

    public async start(): Promise<void> {
        logger.info('Starting token service...');

        // Fetch and log active tokens from DB
        try {
            const activeTokens = await this.getActiveTokens();
            if (activeTokens.length > 0) {
                const tokenSymbols = activeTokens.map(token => token.symbol);
                logger.info(`Currently tracking ${activeTokens.length} active token(s) from DB: ${tokenSymbols.join(', ')}`);
            } else {
                logger.info('No active tokens currently being tracked in the DB.');
            }
        } catch (error) {
            logger.error('Failed to fetch active tokens from DB during startup:', error);
        }

        await this.fetchPrices();
        this.scheduleRefresh();
    }

    public stop(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        logger.info('Token service stopped');
    }

    private scheduleRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.refreshInterval = setInterval(async () => {
            if (!this.isFetching) {
                await this.fetchPrices();
            } else {
                logger.warn('Previous price fetch still in progress, skipping this interval');
            }
        }, this.REFRESH_INTERVAL_MS);
        logger.info(`Price refresh scheduled every ${this.REFRESH_INTERVAL_MS / 1000} seconds`);
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async fetchPricesWithRetry(): Promise<void> {
        let retries = 0;
        while (retries < this.MAX_RETRIES) {
            try {
                // Get all active tokens
                const activeTokens = await this.getActiveTokens();
                const symbols = activeTokens.map(t => t.symbol);

                // If there are no symbols to fetch, don't make the API call
                if (symbols.length === 0) {
                    logger.info('No active symbols to fetch prices for. Skipping API call.');
                    this.lastFetchTime = new Date(); // Update last fetch time to prevent immediate re-fetch
                    this.consecutiveFailures = 0;
                    return;
                }

                const requestUrl = `${this.ALCHEMY_API_URL}/tokens/by-symbol`;
                logger.info(`Attempting to fetch prices from URL: ${requestUrl} for symbols: ${symbols.join(',')}`);

                // Create URLSearchParams with multiple symbols parameters (as per Alchemy API docs)
                const params = new URLSearchParams();
                symbols.forEach(symbol => params.append('symbols', symbol));

                const response = await axios.get<AlchemyPriceResponse>(
                    `${requestUrl}?${params.toString()}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${appConfig.alchemy.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 10000 // 10 second timeout
                    }
                );

                const now = new Date();
                let successCount = 0;
                let failureCount = 0;

                for (const tokenData of response.data.data) {
                    const symbol = tokenData.symbol;
                    const priceData = tokenData.prices[0]; // Get USD price

                    if (priceData && !tokenData.error) {
                        const price = parseFloat(priceData.value);
                        await this.updateTokenPrice(symbol, price);
                        successCount++;
                    } else {
                        logger.warn(`Failed to get price for ${symbol}: ${tokenData.error || 'No price data'}`);
                        failureCount++;
                    }
                }

                this.lastFetchTime = now;
                this.consecutiveFailures = 0;
                logger.info(`Price fetch completed. Success: ${successCount}, Failures: ${failureCount}`);
                return;
            } catch (error) {
                retries++;
                this.consecutiveFailures++;
                logger.error(`Error fetching prices (attempt ${retries}/${this.MAX_RETRIES}):`, error);

                if (retries < this.MAX_RETRIES) {
                    await this.sleep(this.RETRY_DELAY_MS);
                }
            }
        }

        if (this.consecutiveFailures >= 3) {
            logger.error('Multiple consecutive failures in price fetching. Consider checking API key and network connection.');
        }
    }

    private async fetchPrices(): Promise<void> {
        if (this.isFetching) {
            logger.warn('Price fetch already in progress');
            return;
        }

        this.isFetching = true;
        try {
            await this.fetchPricesWithRetry();
        } finally {
            this.isFetching = false;
        }
    }

    public async addToken(tokenData: TokenMetadata): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx: any) => {
                // Create or update the token
                const token = await tx.token.upsert({
                    where: { symbol: tokenData.symbol },
                    update: {
                        name: tokenData.name,
                        decimals: tokenData.decimals,
                        price: tokenData.price,
                        lastPriceUpdate: tokenData.price ? new Date() : undefined,
                        isActive: true
                    },
                    create: {
                        symbol: tokenData.symbol,
                        name: tokenData.name,
                        decimals: tokenData.decimals,
                        price: tokenData.price,
                        lastPriceUpdate: tokenData.price ? new Date() : null,
                        isActive: true
                    }
                });

                // Handle addresses if provided
                if (tokenData.addresses) {
                    const addressEntries = Object.entries(tokenData.addresses)
                        .filter(([_, address]) => address && address !== '0x0000000000000000000000000000000000000000')
                        .map(([chain, address]) => ({
                            chain,
                            address: address!.toLowerCase()
                        }));

                    for (const addr of addressEntries) {
                        await tx.tokenAddress.upsert({
                            where: {
                                tokenId_chain: {
                                    tokenId: token.id,
                                    chain: addr.chain
                                }
                            },
                            update: {
                                address: addr.address
                            },
                            create: {
                                tokenId: token.id,
                                chain: addr.chain,
                                address: addr.address
                            }
                        });
                    }
                }
            });

            logger.info(`Token ${tokenData.symbol} added/updated successfully`);
        } catch (error) {
            logger.error('Error adding token:', error);
            throw error;
        }
    }

    public async getToken(symbol: string, chainName?: string): Promise<TokenWithAddresses | null> {
        if (chainName) {
            const normalizedChainName = chainName.toLowerCase();
            const tokenOnChain = await this.prisma.token.findFirst({
                where: {
                    symbol: symbol,
                    addresses: {
                        some: {
                            chain: normalizedChainName,
                        },
                    },
                },
                include: {
                    addresses: {
                        select: {
                            chain: true,
                            address: true,
                        },
                    },
                },
            });
            if (tokenOnChain) {
                return tokenOnChain as TokenWithAddresses | null;
            }
        }
        const token = await this.prisma.token.findUnique({
            where: { symbol },
            include: {
                addresses: {
                    select: {
                        chain: true,
                        address: true,
                    },
                },
            },
        });
        return token as TokenWithAddresses | null;
    }

    public async getActiveTokens(): Promise<TokenWithAddresses[]> {
        const tokens = await this.prisma.token.findMany({
            where: { isActive: true },
            include: {
                addresses: {
                    select: {
                        chain: true,
                        address: true
                    }
                }
            }
        });
        return tokens as TokenWithAddresses[];
    }

    public async getTokenByAddress(chain: string, address: string): Promise<TokenWithAddresses | null> {
        const normalizedAddress = address.toLowerCase();
        const normalizedChain = chain.toLowerCase();

        // This is the more robust way to find a token by its address on a specific chain
        const tokenFound = await this.prisma.token.findFirst({
            where: {
                isActive: true, // Usually, you only want active tokens
                addresses: {
                    some: {
                        address: normalizedAddress,
                        chain: normalizedChain,
                    },
                },
            },
            include: {
                addresses: {
                    select: {
                        chain: true,
                        address: true,
                    },
                },
            },
        });
        return tokenFound as TokenWithAddresses | null;
    }

    public async updateTokenPrice(symbol: string, price: number): Promise<void> {
        try {
            await this.prisma.token.updateMany({
                where: { symbol: symbol },
                data: {
                    price: price,
                    lastPriceUpdate: new Date(),
                },
            });
            logger.debug(`Updated price for ${symbol} to ${price}`);
        } catch (error) {
            logger.error(`Error updating price for ${symbol}:`, error);
        }
    }

    public async deactivateToken(symbol: string): Promise<void> {
        await this.prisma.token.updateMany({
            where: { symbol: symbol },
            data: { isActive: false },
        });
        logger.info(`Deactivated token: ${symbol}`);
    }

    public getLastFetchTime(): Date | null {
        return this.lastFetchTime;
    }

    public getConsecutiveFailures(): number {
        return this.consecutiveFailures;
    }

    /**
     * Gets all active tokens for Tron chain
     * @returns Array of token data with addresses
     */
    public async getTronTokens(): Promise<TokenWithAddresses[]> {
        const tokens = await this.prisma.token.findMany({
            where: {
                isActive: true,
                addresses: {
                    some: {
                        chain: 'tron'
                    }
                }
            },
            include: {
                addresses: {
                    select: {
                        chain: true,
                        address: true
                    }
                }
            }
        });
        return tokens as TokenWithAddresses[];
    }
} 