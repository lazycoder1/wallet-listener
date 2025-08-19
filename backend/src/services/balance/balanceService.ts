import { createPublicClient, http, type Address, type Chain, PublicClient } from 'viem';
import { mainnet, polygon, bsc } from 'viem/chains';
import { config as appConfig, EvmChainConfig } from '../../config';
import logger from '../../config/logger';
import { TokenService } from '../token/tokenService';
import axios from 'axios';
import { prisma } from '../../prisma';

// ============================================================================
// SHARED INTERFACES
// ============================================================================

interface TokenBalance {
    contractAddress: string;
    tokenBalance: string;
    symbol?: string;
    decimals?: number;
}

// ============================================================================
// ALCHEMY EVM INTERFACES
// ============================================================================

interface AlchemyBalanceRequest {
    addresses: Array<{
        address: string;
        networks: string[];
    }>;
    withMetadata?: boolean;
    withPrices?: boolean;
    includeNativeTokens?: boolean;
}

interface AlchemyTokenPrice {
    currency: string;
    value: string;
    lastUpdatedAt: string;
}

interface AlchemyTokenMetadata {
    name: string;
    symbol: string;
    decimals: number;
}

interface AlchemyTokenBalance {
    network: string;
    address: string;
    tokenAddress: string | null; // null for native tokens
    tokenBalance: string;
    tokenMetadata: AlchemyTokenMetadata;
    tokenPrices: AlchemyTokenPrice[];
}

interface AlchemyBalanceResponse {
    tokens: AlchemyTokenBalance[];
    pageKey?: string | null;
}

// ============================================================================
// TRON INTERFACES
// ============================================================================

interface TronAccountResource {
    freeNetLimit: number;
    NetLimit: number;
    assetNetUsed: Record<string, number>;
    assetNetLimit: Record<string, number>;
    TotalNetLimit: number;
    TotalNetWeight: number;
    tronPowerLimit: number;
    EnergyLimit: number;
    TotalEnergyLimit: number;
    TotalEnergyWeight: number;
}

interface TronAccount {
    address: string;
    balance: number;
    create_time: number;
    latest_opration_time: number;
    free_net_usage: number;
    latest_consume_free_time: number;
    account_resource: TronAccountResource;
    owner_permission: any;
    active_permission: any[];
    assetV2: Array<{
        key: string;
        value: number;
    }>;
}

interface TronTokenInfo {
    tokenId: string;
    tokenAbbr?: string;
    tokenName?: string;
    tokenDecimal: number;
    tokenCanShow: number;
    tokenType: string;
    tokenLogo: string;
    vip: boolean;
    tokenPriceInTrx: number;
    amount: string;
    balance: string;
    tokenPriceInUsd?: number; // Added for TronScan
}

interface TronScanTokensResponse {
    total: number;
    data: TronTokenInfo[];
    contractMap: Record<string, boolean>;
    contractInfo: Record<string, any>; // Adjust as per actual structure if known
}

interface TronTokenBalance {
    name: string;
    symbol: string;
    decimals: number;
    balance: string;
    address: string;
}

// Tron specific interfaces - REFINED for /api/account/token_asset_overview
interface TronScanAsset {
    tokenId: string;
    tokenName: string;
    tokenDecimal: number;
    tokenAbbr: string;
    tokenCanShow: number;
    tokenType: 'trx' | 'trc10' | 'trc20';
    tokenLogo: string;
    vip: boolean;
    balance: string; // Raw balance
    tokenPriceInTrx: number;
    tokenPriceInUsd: number;
    assetInTrx: number;
    assetInUsd: number;
    percent?: number;
}

interface TronScanAccountAssetOverviewResponse {
    totalAssetInTrx: number;
    data: TronScanAsset[];
    totalTokenCount: number;
    totalAssetInUsd: number;
}

// Interface for the old /api/account/tokens structure (kept for reference if needed, but new logic uses overview)
interface TronTokenInfoOld {
    tokenId: string;
    tokenAbbr?: string;
    tokenName?: string;
    tokenDecimal: number;
    tokenCanShow: number;
    tokenType: string;
    tokenLogo: string;
    vip: boolean;
    tokenPriceInTrx: number;
    amount: string; // This 'amount' was actually usdValue in previous topTokens logic
    balance: string;
    tokenPriceInUsd?: number;
}

interface TronScanTokensResponseOld {
    total: number;
    data: TronTokenInfoOld[];
    contractMap: Record<string, boolean>;
    contractInfo: Record<string, any>;
}

// ============================================================================
// NETWORK CONFIGURATIONS
// ============================================================================

const ALCHEMY_NETWORKS = {
    ethereum: 'eth-mainnet',
    polygon: 'polygon-mainnet',
    bsc: 'bnb-mainnet'
};

// ============================================================================
// MAIN BALANCE SERVICE
// ============================================================================

export class BalanceService {
    private static instance: BalanceService;
    private tokenService: TokenService;
    private clients: Map<number, any> = new Map();
    private chains: EvmChainConfig[];
    private static readonly ALCHEMY_TO_DB_CHAIN: Record<string, string> = {
        'eth-mainnet': 'ethereum',
        'polygon-mainnet': 'polygon',
        'bnb-mainnet': 'bsc'
    };
    private static readonly NATIVE_SYMBOL_BY_NETWORK: Record<string, string> = {
        'eth-mainnet': 'ETH',
        'polygon-mainnet': 'MATIC',
        'bnb-mainnet': 'BNB'
    };

    private constructor() {
        this.tokenService = TokenService.getInstance();
        this.chains = appConfig.evmChains;
        this.initializeClients();
    }

    private initializeClients() {
        for (const chainConfig of this.chains) {
            const client: any = createPublicClient({
                chain: chainConfig.chain,
                transport: http(chainConfig.rpcUrl)
            });
            this.clients.set(chainConfig.chainId, client);
        }
    }

    public static getInstance(): BalanceService {
        if (!BalanceService.instance) {
            BalanceService.instance = new BalanceService();
        }
        return BalanceService.instance;
    }

    // ========================================================================
    // ALCHEMY EVM BALANCE METHODS
    // ========================================================================

    /**
     * Get total EVM balance using DB-tracked tokens and DB prices (DEFAULT)
     * Falls back to 0 on failure.
     */
    public async getTotalBalanceAlchemy(address: string): Promise<number> {
        try {
            const { totalUsd } = await this.getAlchemyBreakdownTracked(address);
            logger.info('Balance fetch (tracked) successful', {
                address,
                totalUsdValue: parseFloat(totalUsd.toFixed(2))
            });
            return totalUsd;
        } catch (error: any) {
            logger.error('Balance fetch (tracked) failed', {
                address,
                error: error.message
            });
            return 0;
        }
    }

    /**
     * RAW Alchemy total using Alchemy prices and all tokens (for debugging only)
     */
    public async getTotalBalanceAlchemyRaw(address: string): Promise<number> {
        try {
            if (!this.isValidEthereumAddress(address)) {
                throw new Error(`Invalid Ethereum address: ${address}`);
            }
            const alchemyBalances = await this.fetchAlchemyBalances(address);
            const totalUsdValue = this.calculateTotalUsdValue(alchemyBalances);
            return totalUsdValue;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get detailed Alchemy Portfolio breakdown for debugging.
     * Returns per-token rows and aggregated totals computed with the same logic used by getTotalBalanceAlchemy.
     */
    public async getAlchemyBreakdown(address: string): Promise<{
        totalUsd: number;
        rows: Array<{
            network: string;
            tokenAddress: string;
            symbol: string;
            decimals: number;
            balanceHex: string;
            tokenAmount: number;
            usdPrice: number;
            usdValue: number;
        }>;
        byNetwork: Record<string, number>;
    }> {
        if (!this.isValidEthereumAddress(address)) {
            throw new Error(`Invalid Ethereum address: ${address}`);
        }

        const balances = await this.fetchAlchemyBalances(address);

        const rows: Array<{
            network: string;
            tokenAddress: string;
            symbol: string;
            decimals: number;
            balanceHex: string;
            tokenAmount: number;
            usdPrice: number;
            usdValue: number;
        }> = [];

        let totalUsd = 0;
        for (const balance of balances) {
            try {
                const usdPrice = this.getUsdPrice(balance.tokenPrices);
                let decimals = balance.tokenMetadata.decimals;
                if (decimals === null || decimals === undefined) {
                    decimals = 18;
                }
                const balanceHex = balance.tokenBalance || '0x0';
                const balanceBigInt = BigInt(balanceHex);
                const tokenAmount = Number(balanceBigInt) / Math.pow(10, decimals);
                const usdValue = tokenAmount * usdPrice;

                totalUsd += usdValue;

                rows.push({
                    network: balance.network,
                    tokenAddress: balance.tokenAddress ?? 'NATIVE',
                    symbol: balance.tokenMetadata?.symbol || (balance.tokenAddress ? '-' : 'NATIVE'),
                    decimals,
                    balanceHex,
                    tokenAmount,
                    usdPrice,
                    usdValue,
                });
            } catch (error) {
                logger.warn('Error while building breakdown row', {
                    tokenAddress: balance.tokenAddress,
                    symbol: balance.tokenMetadata?.symbol,
                    balanceHex: balance.tokenBalance,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        const byNetwork = rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.network] = (acc[r.network] || 0) + (isFinite(r.usdValue) ? r.usdValue : 0);
            return acc;
        }, {});

        return { totalUsd, rows, byNetwork };
    }

    /**
     * Same as getAlchemyBreakdown, but filtered to tokens we track in DB and using DB prices.
     */
    public async getAlchemyBreakdownTracked(address: string): Promise<{
        totalUsd: number;
        rows: Array<{
            network: string;
            tokenAddress: string;
            symbol: string;
            decimals: number;
            balanceHex: string;
            tokenAmount: number;
            usdPrice: number;
            usdValue: number;
            reason?: string;
        }>;
        byNetwork: Record<string, number>;
    }> {
        if (!this.isValidEthereumAddress(address)) {
            throw new Error(`Invalid Ethereum address: ${address}`);
        }

        // Load tracked tokens with prices from DB
        const dbTokens = await prisma.token.findMany({
            where: {
                isActive: true,
                price: {
                    not: null
                }
            },
            include: {
                addresses: true
            }
        });

        const tokenBySymbol: Record<string, typeof dbTokens[number]> = {};
        const tokenByChainAddress: Record<string, typeof dbTokens[number]> = {};
        for (const t of dbTokens) {
            tokenBySymbol[t.symbol.toUpperCase()] = t;
            for (const a of t.addresses) {
                const key = `${a.chain}:${a.address.toLowerCase()}`;
                tokenByChainAddress[key] = t;
            }
        }

        const balances = await this.fetchAlchemyBalances(address);

        const rows: Array<{
            network: string;
            tokenAddress: string;
            symbol: string;
            decimals: number;
            balanceHex: string;
            tokenAmount: number;
            usdPrice: number;
            usdValue: number;
            reason?: string;
        }> = [];

        let totalUsd = 0;
        for (const balance of balances) {
            try {
                // Determine DB chain key
                const dbChain = BalanceService.ALCHEMY_TO_DB_CHAIN[balance.network];
                if (!dbChain) {
                    continue;
                }

                // Compute token amount using Alchemy decimals
                let decimals = balance.tokenMetadata.decimals;
                if (decimals === null || decimals === undefined) {
                    decimals = 18;
                }
                const balanceHex = balance.tokenBalance || '0x0';
                const tokenAmount = Number(BigInt(balanceHex)) / Math.pow(10, decimals);

                // Resolve DB token
                let dbToken = null as (typeof dbTokens[number] | null);
                let tokenAddrOut = balance.tokenAddress ?? 'NATIVE';
                let symbolOut = balance.tokenMetadata?.symbol || (balance.tokenAddress ? '-' : 'NATIVE');

                if (balance.tokenAddress) {
                    const key = `${dbChain}:${balance.tokenAddress.toLowerCase()}`;
                    dbToken = tokenByChainAddress[key] ?? null;
                } else {
                    // Native token: match by symbol
                    const nativeSymbol = BalanceService.NATIVE_SYMBOL_BY_NETWORK[balance.network];
                    if (nativeSymbol) {
                        dbToken = tokenBySymbol[nativeSymbol.toUpperCase()] ?? null;
                        symbolOut = nativeSymbol;
                        tokenAddrOut = 'NATIVE';
                    }
                }

                if (!dbToken || dbToken.price == null) {
                    // Skip tokens not tracked or without price
                    continue;
                }

                const usdPrice = Number(dbToken.price as unknown as number);
                const usdValue = tokenAmount * usdPrice;
                totalUsd += usdValue;

                rows.push({
                    network: balance.network,
                    tokenAddress: tokenAddrOut,
                    symbol: symbolOut,
                    decimals,
                    balanceHex,
                    tokenAmount,
                    usdPrice,
                    usdValue,
                });
            } catch (error) {
                // Skip problematic entries silently in tracked mode
                continue;
            }
        }

        const byNetwork = rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.network] = (acc[r.network] || 0) + (isFinite(r.usdValue) ? r.usdValue : 0);
            return acc;
        }, {});

        return { totalUsd, rows, byNetwork };
    }

    /**
     * Fetch balances from Alchemy Portfolio API
     */
    private async fetchAlchemyBalances(address: string): Promise<AlchemyTokenBalance[]> {
        const request: AlchemyBalanceRequest = {
            addresses: [{
                address,
                networks: Object.values(ALCHEMY_NETWORKS)
            }],
            withMetadata: true,
            withPrices: true,
            includeNativeTokens: true
        };

        try {
            const response = await axios.post(
                `https://api.g.alchemy.com/data/v1/${appConfig.alchemy.apiKey}/assets/tokens/by-address`,
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                }
            );

            if (!response.data || !response.data.data || !response.data.data.tokens) {
                logger.warn('Invalid Alchemy API response structure', { address });
                return [];
            }

            const tokens = response.data.data.tokens;
            return tokens;

        } catch (error: any) {
            logger.error('Alchemy API request failed', {
                address,
                error: error.message,
                status: error.response?.status
            });
            throw error;
        }
    }

    /**
 * Calculate total USD value from Alchemy token balances
 */
    private calculateTotalUsdValue(balances: AlchemyTokenBalance[]): number {
        let totalUsd = 0;

        for (const balance of balances) {
            try {
                const usdPrice = this.getUsdPrice(balance.tokenPrices);

                // Handle native tokens (tokenAddress is null) with default 18 decimals
                let decimals = balance.tokenMetadata.decimals;
                if (decimals === null || decimals === undefined) {
                    decimals = 18; // Default for native tokens (ETH, MATIC, BNB)
                }

                // Convert hex balance to decimal
                const balanceHex = balance.tokenBalance;
                const balanceBigInt = BigInt(balanceHex);
                const tokenAmount = Number(balanceBigInt) / Math.pow(10, decimals);
                const usdValue = tokenAmount * usdPrice;

                totalUsd += usdValue;

                // Only log significant balances to avoid spam
                if (usdValue > 0.01) {
                    logger.debug('Token balance', {
                        network: balance.network,
                        symbol: balance.tokenMetadata.symbol || 'NATIVE',
                        usdValue: parseFloat(usdValue.toFixed(2))
                    });
                }

            } catch (error) {
                logger.warn('Error calculating token USD value', {
                    tokenAddress: balance.tokenAddress,
                    symbol: balance.tokenMetadata?.symbol,
                    balanceHex: balance.tokenBalance,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return totalUsd;
    }

    /**
     * Get USD price from Alchemy price array
     */
    private getUsdPrice(prices: AlchemyTokenPrice[]): number {
        const usdPrice = prices.find(p => p.currency.toLowerCase() === 'usd');
        return usdPrice ? parseFloat(usdPrice.value) : 0;
    }

    /**
     * Validate Ethereum address format
     */
    private isValidEthereumAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    // ========================================================================
    // TRON BALANCE METHODS (EXISTING LOGIC)
    // ========================================================================

    public async fetchTronScanTokenBalances(address: string): Promise<{ totalUsdBalance: number, topTokens: TronScanAsset[] }> {
        const apiUrl = appConfig.tronScan.apiUrl || 'https://apilist.tronscanapi.com';
        const endpoint = `${apiUrl}/api/account/token_asset_overview`;

        try {
            const params: any = {
                address: address,
                order_type: 'usd_desc'
            };

            if (appConfig.tronScan.apiKey) {
                params.apikey = appConfig.tronScan.apiKey;
            }

            const response = await axios.get<TronScanAccountAssetOverviewResponse>(endpoint, {
                params,
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (response.data && Array.isArray(response.data.data)) {
                const totalUsdBalance = response.data.totalAssetInUsd || 0;
                const topTokens = response.data.data.slice(0, 5);

                logger.info('TRON balance fetch successful', {
                    address,
                    totalUsdBalance,
                    totalTokenCount: response.data.totalTokenCount || 0,
                    topTokensCount: topTokens.length
                });

                return {
                    totalUsdBalance,
                    topTokens
                };
            } else {
                logger.warn('Invalid TronScan API response structure', {
                    address,
                    response: response.data
                });
                return { totalUsdBalance: 0, topTokens: [] };
            }

        } catch (error: any) {
            logger.error('Error fetching TRON balance from TronScan', {
                address,
                error: error.message,
                status: error.response?.status,
                endpoint
            });
            return { totalUsdBalance: 0, topTokens: [] };
        }
    }

    // ========================================================================
    // LEGACY EVM METHODS (KEPT FOR BACKWARD COMPATIBILITY)
    // ========================================================================

    private async fetchNativeBalance(address: Address, chainId: number): Promise<number> {
        try {
            const client = this.clients.get(chainId);
            if (!client) {
                throw new Error(`No client found for chain ID ${chainId}`);
            }

            const balance = await client.getBalance({ address });
            const chainInfo = this.chains.find(c => c.chainId === chainId);
            if (!chainInfo) throw new Error(`Chain configuration not found for ID ${chainId}`);

            const nativeSymbol = chainInfo.chain.nativeCurrency.symbol;
            const token = await this.tokenService.getToken(nativeSymbol);

            if (!token?.price) {
                logger.warn(`No price found for native token ${nativeSymbol} on chain ${chainId}`);
                return 0;
            }

            return Number(balance) * token.price / Math.pow(10, chainInfo.chain.nativeCurrency.decimals);
        } catch (error) {
            logger.error(`Error fetching native balance for chain ${chainId}:`, error);
            return 0;
        }
    }

    private async fetchTokenBalances(address: Address, chainId: number): Promise<number> {
        try {
            const chainInfo = this.chains.find(c => c.chainId === chainId);
            if (!chainInfo) {
                throw new Error(`Chain ID ${chainId} not supported or configuration not found.`);
            }

            const response = await fetch(chainInfo.rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'alchemy_getTokenBalances',
                    params: [address, 'DEFAULT_TOKENS'],
                    id: 1,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data: any = await response.json();
            const tokenBalances = data.result?.tokenBalances || [];

            let totalBalance = 0;
            for (const tokenBalance of tokenBalances) {
                const balance = parseInt(tokenBalance.tokenBalance, 16);
                if (balance > 0) {
                    totalBalance += balance;
                }
            }

            return totalBalance;
        } catch (error) {
            logger.error(`Error fetching token balances for chain ${chainId}:`, error);
            return 0;
        }
    }

    private async fetchChainBalance(address: Address, chainId: number): Promise<number> {
        try {
            const [nativeBalance, tokenBalance] = await Promise.all([
                this.fetchNativeBalance(address, chainId),
                this.fetchTokenBalances(address, chainId)
            ]);

            const totalBalance = nativeBalance + tokenBalance;
            logger.info(`Chain ${chainId} balance for ${address}: $${totalBalance.toFixed(2)}`);

            return totalBalance;
        } catch (error) {
            logger.error(`Error fetching balance for chain ${chainId}:`, error);
            return 0;
        }
    }

    /**
     * Legacy method - get total EVM balance using individual RPC calls
     * @deprecated Use getTotalBalanceAlchemy() instead for better performance
     */
    public async getTotalBalance(address: string): Promise<number> {
        try {
            const addr = address as Address;
            const chainBalances = await Promise.all(
                this.chains.map(chain => this.fetchChainBalance(addr, chain.chainId))
            );

            const totalBalance = chainBalances.reduce((sum, balance) => sum + balance, 0);
            logger.info(`Total EVM balance for ${address}: $${totalBalance.toFixed(2)}`);

            return totalBalance;
        } catch (error) {
            logger.error('Error calculating total balance:', error);
            return 0;
        }
    }
} 