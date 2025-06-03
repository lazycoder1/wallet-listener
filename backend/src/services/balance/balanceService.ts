import { createPublicClient, http, type Address, type Chain, PublicClient } from 'viem';
import { mainnet, polygon, bsc } from 'viem/chains';
import { config as appConfig, EvmChainConfig } from '../../config';
import logger from '../../config/logger';
import { TokenService } from '../token/tokenService';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

interface TokenBalance {
    contractAddress: string;
    tokenBalance: string;
    symbol?: string;
    decimals?: number;
}

interface AlchemyBalanceResponse {
    jsonrpc: string;
    id: number;
    result: {
        tokenBalances: TokenBalance[];
    };
}

// Tron specific interfaces
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

export class BalanceService {
    private static instance: BalanceService;
    private prisma: PrismaClient;
    private tokenService: TokenService;
    private clients: Map<number, any> = new Map();
    private chains: EvmChainConfig[];

    private constructor() {
        this.prisma = new PrismaClient();
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
                    id: 1,
                    method: 'alchemy_getTokenBalances',
                    params: [address, 'erc20']
                })
            });

            if (!response.ok) {
                throw new Error(`API error from ${chainInfo.name} (${chainInfo.rpcUrl}): ${response.statusText}`);
            }

            const data = await response.json() as AlchemyBalanceResponse;
            let totalBalance = 0;

            if (data.result && data.result.tokenBalances) {
                for (const token of data.result.tokenBalances) {
                    const tokenMetadata = await this.tokenService.getTokenByAddress(chainInfo.chain.name.toLowerCase(), token.contractAddress);
                    if (!tokenMetadata) {
                        logger.warn(`No metadata found for token ${token.contractAddress} on chain ${chainId} (${chainInfo.name})`);
                        continue;
                    }

                    const balance = Number(token.tokenBalance) / Math.pow(10, tokenMetadata.decimals);
                    if (tokenMetadata.price) {
                        totalBalance += balance * tokenMetadata.price;
                    } else {
                        logger.warn(`No price found for token ${tokenMetadata.symbol} on chain ${chainId} (${chainInfo.name})`);
                    }
                }
            } else {
                logger.warn(`No token balances found or unexpected response structure for ${address} on chain ${chainId} (${chainInfo.name})`);
            }

            return totalBalance;
        } catch (error) {
            logger.error(`Error fetching token balances for chain ${chainId}:`, error);
            return 0;
        }
    }

    private async fetchChainBalance(address: Address, chainId: number): Promise<number> {
        try {
            const nativeBalance = await this.fetchNativeBalance(address, chainId);
            const tokenBalance = await this.fetchTokenBalances(address, chainId);
            return nativeBalance + tokenBalance;
        } catch (error) {
            logger.error(`Error fetching total chain balance for ${address} on chain ${chainId}:`, error);
            return 0;
        }
    }

    // --- Old Tron Balance Methods (Commented out as fetchTronScanTokenBalances is preferred for total) ---
    /*
    private async fetchTronNativeBalance(address: string): Promise<number> {
        try {
            const response = await axios.get(`${appConfig.networks.tron.apiUrl}/v1/accounts/${address}`, {
                headers: appConfig.networks.tron.apiKey ? {
                    'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey
                } : undefined
            });
            if (response.data && response.data.data && response.data.data.length > 0) {
                const account = response.data.data[0] as any; 
                const balanceTrx = (account.balance || 0) / 1_000_000; 
                const trxToken = await this.tokenService.getToken('TRX');
                if (!trxToken?.price) {
                    logger.warn(`No price found for TRX token in fetchTronNativeBalance`);
                    return 0;
                }
                return balanceTrx * trxToken.price;
            }
            return 0;
        } catch (error) {
            logger.error('Error fetching Tron native balance:', error);
            return 0;
        }
    }

    private async fetchTronTokenBalances(address: string): Promise<number> {
        logger.warn('fetchTronTokenBalances (old method) is deprecated. Use fetchTronScanTokenBalances.');
        return 0; 
    }

    private async fetchTronBalance(address: string): Promise<number> {
        logger.warn('fetchTronBalance (old method) is deprecated. Use fetchTronScanTokenBalances.');
        const { totalUsdBalance } = await this.fetchTronScanTokenBalances(address);
        return totalUsdBalance;
    }
    */

    // --- NEW Tron Balance Method using /account/token_asset_overview ---
    public async fetchTronScanTokenBalances(address: string): Promise<{ totalUsdBalance: number, topTokens: TronScanAsset[] }> {
        try {
            const tronScanApiUrl = appConfig.tronScan.apiUrl || 'https://apilist.tronscan.org/api';
            const url = `${tronScanApiUrl}/account/token_asset_overview?address=${address}`;

            logger.info(`[BalanceService] Fetching Tron asset overview for ${address} from ${url}`);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (appConfig.tronScan.apiKey) {
                // Ensure your apiKey is for tronscan.org if using that base URL
                // headers['TRON-PRO-API-KEY'] = appConfig.tronScan.apiKey; 
            }

            const response = await axios.get<TronScanAccountAssetOverviewResponse>(url, { headers, timeout: 10000 });

            // logger.debug(`[BalanceService] Raw response from ${url}:`, JSON.stringify(response.data, null, 2));

            if (response.status !== 200 || !response.data || typeof response.data.totalAssetInUsd !== 'number') {
                logger.error(`[BalanceService] Error fetching TronScan asset overview for ${address}: Invalid response status or data format. Status: ${response.status}`, { responseData: response.data });
                return { totalUsdBalance: 0, topTokens: [] };
            }

            const overviewData = response.data;
            let calculatedTotalUsdFromAssets = 0;

            if (overviewData.data && Array.isArray(overviewData.data)) {
                for (const asset of overviewData.data) {
                    calculatedTotalUsdFromAssets += asset.assetInUsd || 0; // Ensure assetInUsd is a number
                }
            } else {
                logger.warn(`[BalanceService] No 'data' array in TronScan asset overview for ${address}. Response:`, overviewData);
            }

            logger.info(`[BalanceService] Successfully fetched Tron asset overview for ${address}. Reported total USD: ${overviewData.totalAssetInUsd.toFixed(2)}, Calculated sum of assets USD from items: ${calculatedTotalUsdFromAssets.toFixed(2)}`);

            return {
                totalUsdBalance: overviewData.totalAssetInUsd,
                topTokens: overviewData.data ? overviewData.data.slice(0, 5) : []
            };

        } catch (error: any) {
            const apiUrlForError = `${appConfig.tronScan.apiUrl || 'https://apilist.tronscan.org/api'}/account/token_asset_overview?address=${address}`;
            logger.error(`[BalanceService] Error in fetchTronScanTokenBalances for ${address}: ${error.message}`, {
                url: apiUrlForError,
                errorDetails: axios.isAxiosError(error) ? { status: error.response?.status, data: error.response?.data } : { stack: error.stack }
            });
            return { totalUsdBalance: 0, topTokens: [] };
        }
    }

    // --- Unified Public Method --- 
    public async getTotalBalance(address: string): Promise<number> {
        try {
            // Tron address check (basic)
            if (address.startsWith('T') && address.length === 34) {
                const { totalUsdBalance } = await this.fetchTronScanTokenBalances(address);
                return totalUsdBalance;
            }

            // EVM Logic (assuming address is hex if not Tron)
            const normalizedAddress = address.toLowerCase() as Address;
            const balances = await Promise.all(
                this.chains.map(chain => this.fetchChainBalance(normalizedAddress, chain.chainId))
            );
            return balances.reduce((total, balance) => total + balance, 0);
        } catch (error: any) {
            logger.error(`[BalanceService] Error calculating total balance in getTotalBalance for ${address}: ${error.message}`);
            // throw new AppError(HttpCode.INTERNAL_SERVER_ERROR, `Failed to get total balance: ${error.message}`);
            return 0; // Default to 0 on error to prevent crashes, or re-throw if preferred
        }
    }
} 