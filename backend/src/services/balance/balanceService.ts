import { createPublicClient, http, type Address, type Chain } from 'viem';
import { mainnet, polygon, bsc } from 'viem/chains';
import { config as appConfig } from '../../config';
import logger from '../../config/logger';
import { TokenService } from '../token/tokenService';
import axios from 'axios';

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

interface ChainConfig {
    name: string;
    chain: Chain;
    alchemyUrl: string;
    chainId: number;
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

export class BalanceService {
    private static instance: BalanceService;
    private tokenService: TokenService;
    private clients: Map<number, ReturnType<typeof createPublicClient>> = new Map();

    private chains: ChainConfig[] = [
        {
            name: 'Ethereum',
            chain: mainnet,
            alchemyUrl: `https://eth-mainnet.g.alchemy.com/v2/${appConfig.alchemy.apiKey}`,
            chainId: mainnet.id
        },
        {
            name: 'Polygon',
            chain: polygon,
            alchemyUrl: `https://polygon-mainnet.g.alchemy.com/v2/${appConfig.alchemy.apiKey}`,
            chainId: polygon.id
        },
        {
            name: 'BNB',
            chain: bsc,
            alchemyUrl: `https://bnb-mainnet.g.alchemy.com/v2/${appConfig.alchemy.apiKey}`,
            chainId: bsc.id
        }
    ];

    private constructor() {
        this.tokenService = TokenService.getInstance();
        this.initializeClients();
    }

    private initializeClients() {
        for (const chainConfig of this.chains) {
            const client = createPublicClient({
                chain: chainConfig.chain,
                transport: http(chainConfig.alchemyUrl)
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
            const chain = this.chains.find(c => c.chainId === chainId);
            if (!chain) throw new Error(`Chain not found for ID ${chainId}`);

            // Get native token price (e.g., ETH for Ethereum, MATIC for Polygon)
            const nativeSymbol = chain.chain.nativeCurrency.symbol;
            const token = await this.tokenService.getToken(nativeSymbol);

            if (!token?.price) {
                logger.warn(`No price found for native token ${nativeSymbol} on chain ${chainId}`);
                return 0;
            }

            return Number(balance) * token.price / Math.pow(10, chain.chain.nativeCurrency.decimals);
        } catch (error) {
            logger.error(`Error fetching native balance for chain ${chainId}:`, error);
            return 0;
        }
    }

    private async fetchTokenBalances(address: Address, chainId: number): Promise<number> {
        try {
            const chain = this.chains.find(c => c.chainId === chainId);
            if (!chain) {
                throw new Error(`Chain ID ${chainId} not supported`);
            }

            const response = await fetch(chain.alchemyUrl, {
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
                throw new Error(`Alchemy API error: ${response.statusText}`);
            }

            const data = await response.json() as AlchemyBalanceResponse;
            let totalBalance = 0;

            for (const token of data.result.tokenBalances) {
                const tokenMetadata = await this.tokenService.getTokenByAddress(chain.name.toLowerCase(), token.contractAddress);
                if (!tokenMetadata) {
                    logger.warn(`No metadata found for token ${token.contractAddress} on chain ${chainId}`);
                    continue;
                }

                const balance = Number(token.tokenBalance) / Math.pow(10, tokenMetadata.decimals);
                if (tokenMetadata.price) {
                    totalBalance += balance * tokenMetadata.price;
                } else {
                    logger.warn(`No price found for token ${tokenMetadata.symbol} on chain ${chainId}`);
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
            // Fetch both native and token balances
            const [nativeBalance, tokenBalance] = await Promise.all([
                this.fetchNativeBalance(address, chainId),
                this.fetchTokenBalances(address, chainId)
            ]);

            return nativeBalance + tokenBalance;
        } catch (error) {
            logger.error(`Error fetching total balance for chain ${chainId}:`, error);
            return 0;
        }
    }

    /**
     * Fetches the native TRX balance for a Tron address
     */
    private async fetchTronNativeBalance(address: string): Promise<number> {
        try {
            const response = await axios.get(`${appConfig.networks.tron.wsUrl}/v1/accounts/${address}`, {
                headers: appConfig.networks.tron.apiKey ? {
                    'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey
                } : undefined
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const account = response.data.data[0] as TronAccount;
                const balanceTrx = account.balance / 1_000_000; // Convert from SUN to TRX (6 decimals)

                // Get TRX price
                const trxToken = await this.tokenService.getToken('TRX');
                if (!trxToken?.price) {
                    logger.warn(`No price found for TRX token`);
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

    /**
     * Fetches TRC20 token balances for a Tron address
     */
    private async fetchTronTokenBalances(address: string): Promise<number> {
        try {
            // Get all tracked Tron tokens
            const tronTokens = await this.tokenService.getTronTokens();
            let totalUsdValue = 0;

            for (const token of tronTokens) {
                try {
                    const tokenAddress = token.addresses.find(addr => addr.chain === 'tron')?.address;
                    if (!tokenAddress) continue;

                    // Call the Tron API to get token balance
                    const response = await axios.post(`${appConfig.networks.tron.wsUrl}/wallet/triggersmartcontract`, {
                        contract_address: tokenAddress,
                        function_selector: 'balanceOf(address)',
                        parameter: address,
                        owner_address: address
                    }, {
                        headers: appConfig.networks.tron.apiKey ? {
                            'TRON-PRO-API-KEY': appConfig.networks.tron.apiKey
                        } : undefined
                    });

                    if (response.data && response.data.constant_result && response.data.constant_result.length > 0) {
                        // Parse the hex result
                        const balanceHex = response.data.constant_result[0];
                        const balance = parseInt(balanceHex, 16) / Math.pow(10, token.decimals);

                        if (token.price) {
                            totalUsdValue += balance * token.price;
                        }
                    }
                } catch (error) {
                    logger.error(`Error fetching balance for Tron token ${token.symbol}:`, error);
                }
            }

            return totalUsdValue;
        } catch (error) {
            logger.error('Error fetching Tron token balances:', error);
            return 0;
        }
    }

    /**
     * Fetches the total balance (native + tokens) for a Tron address
     */
    private async fetchTronBalance(address: string): Promise<number> {
        try {
            // Fetch both native and token balances
            const [nativeBalance, tokenBalance] = await Promise.all([
                this.fetchTronNativeBalance(address),
                this.fetchTronTokenBalances(address)
            ]);

            return nativeBalance + tokenBalance;
        } catch (error) {
            logger.error('Error fetching total Tron balance:', error);
            return 0;
        }
    }

    public async getTotalBalance(address: string): Promise<number> {
        try {
            // Check if this is a Tron address
            if (address.startsWith('T') && address.length === 34) {
                return await this.fetchTronBalance(address);
            }

            // Else handle as EVM address
            const normalizedAddress = address.toLowerCase() as Address;
            const balances = await Promise.all(
                this.chains.map(chain => this.fetchChainBalance(normalizedAddress, chain.chainId))
            );
            return balances.reduce((total, balance) => total + balance, 0);
        } catch (error) {
            logger.error('Error calculating total balance:', error);
            return 0;
        }
    }

    public async fetchTronScanTokenBalances(address: string): Promise<{ totalUsdBalance: number, topTokens: TronTokenInfo[] }> {
        let totalUsdBalance = 0;
        const topTokens: TronTokenInfo[] = [];

        try {
            const tronScanApiUrl = appConfig.tronScan.apiUrl || 'https://apilist.tronscanapi.com';
            // Parameters: show=3 for all token types, sortBy=2 for balance amount, sortType=0 for descending
            const url = `${tronScanApiUrl}/api/account/tokens?address=${address}&limit=50&start=0&hidden=0&show=3&sortType=0&sortBy=2`;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (appConfig.tronScan.apiKey) {
                headers['TRON-PRO-API-KEY'] = appConfig.tronScan.apiKey;
            }

            const response = await axios.get<TronScanTokensResponse>(url, { headers });

            if (response.status !== 200 || !response.data || !response.data.data) {
                logger.error(`Error fetching TronScan token balances for ${address}: Invalid response`, response.data);
                return { totalUsdBalance: 0, topTokens: [] };
            }

            const tokens = response.data.data;

            for (const token of tokens) {
                const balance = parseFloat(token.balance) / Math.pow(10, token.tokenDecimal);
                let priceUsd = token.tokenPriceInUsd || 0;

                // If USD price is not directly available, try to get it via TokenService or calculate from TRX price
                if (!priceUsd) {
                    const tokenSymbol = token.tokenAbbr || token.tokenName;
                    if (tokenSymbol) {
                        const cachedToken = await this.tokenService.getToken(tokenSymbol, 'tron');
                        if (cachedToken?.price) {
                            priceUsd = cachedToken.price;
                        } else if (token.tokenPriceInTrx) {
                            // Fallback: get TRX price and calculate
                            const trxInfo = await this.tokenService.getToken('TRX', 'tron');
                            if (trxInfo?.price) {
                                priceUsd = token.tokenPriceInTrx * trxInfo.price;
                            }
                        }
                    }
                }

                const usdValue = balance * priceUsd;
                totalUsdBalance += usdValue;

                // Add to topTokens if it has a USD value
                if (usdValue > 0) {
                    topTokens.push({ ...token, tokenPriceInUsd: priceUsd, amount: usdValue.toString() }); // Store USD value in 'amount' for sorting/display
                }
            }
            // Sort top tokens by USD value descending and take top (e.g., 5)
            const sortedTopTokens = topTokens.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)).slice(0, 5);


            return { totalUsdBalance, topTokens: sortedTopTokens };

        } catch (error: any) {
            logger.error(`Error fetching Tron balances from TronScan for ${address}:`, error.message);
            if (axios.isAxiosError(error) && error.response) {
                logger.error('TronScan API Error Response:', {
                    status: error.response.status,
                    data: error.response.data,
                });
            }
            return { totalUsdBalance: 0, topTokens: [] };
        }
    }
} 