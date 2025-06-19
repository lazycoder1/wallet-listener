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
     * Get total EVM balance using Alchemy Portfolio API
     */
    public async getTotalBalanceAlchemy(address: string): Promise<number> {
        try {
            if (!this.isValidEthereumAddress(address)) {
                throw new Error(`Invalid Ethereum address: ${address}`);
            }

            const alchemyBalances = await this.fetchAlchemyBalances(address);
            const totalUsdValue = this.calculateTotalUsdValue(alchemyBalances);

            logger.info('Balance fetch successful', {
                address,
                totalUsdValue: parseFloat(totalUsdValue.toFixed(2))
            });

            return totalUsdValue;

        } catch (error: any) {
            logger.error('Balance fetch failed', {
                address,
                error: error.message
            });
            return 0;
        }
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