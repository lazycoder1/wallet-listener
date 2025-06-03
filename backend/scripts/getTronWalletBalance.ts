import axios from 'axios';
import { TokenService } from '../src/services/token/tokenService'; // Adjust path if necessary
import logger from '../src/config/logger'; // Assuming you want to use your existing logger

// TronScan API endpoint for account details (including balances)
const TRONSCAN_API_BASE_URL = 'https://apilist.tronscan.org/api';

interface TronScanTokenBalance {
    tokenId: string; // For TRX, this is '_', for TRC10 it's a number string, for TRC20 it's the contract address
    balance: string; // Raw balance (needs to be divided by decimals)
    tokenName: string;
    tokenAbbr: string;
    tokenDecimal: number;
    tokenPriceInTrx?: number; // Price in TRX (often for TRX itself or TRC10s)
    tokenPriceInUsd?: number; // Price in USD (sometimes directly available)
    tokenType: 'trx' | 'trc10' | 'trc20';
    tokenLogo?: string;
}

// More refined interface based on docs.tronscan.org/api-endpoints/account for token_asset_overview
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
    percent?: number; // Optional as not in all contexts
}

interface TronScanAccountAssetOverviewResponse {
    totalAssetInTrx: number;
    data: TronScanAsset[];
    totalTokenCount: number;
    totalAssetInUsd: number;
}


async function getTronWalletBalance(walletAddress: string) {
    if (!walletAddress || !walletAddress.startsWith('T') || walletAddress.length < 30) {
        logger.error('Invalid TRON wallet address provided.');
        return;
    }

    logger.info(`Fetching balance for TRON wallet: ${walletAddress}`);

    try {
        const tokenService = TokenService.getInstance();
        // If your TokenService has an explicit start/init method that pre-loads data,
        // you might want to call it here, e.g., await tokenService.start();
        // For this script, we'll assume getToken will fetch if necessary or use cached data.

        // Using the /account/token_asset_overview endpoint as it seems more structured for balance overview
        const response = await axios.get<TronScanAccountAssetOverviewResponse>(`${TRONSCAN_API_BASE_URL}/account/token_asset_overview`, {
            params: { address: walletAddress },
            headers: {
                // Add API key here if you have one and it's required/recommended
                // 'TRON-PRO-API-KEY': process.env.TRONSCAN_API_KEY 
            },
            timeout: 10000 // 10 seconds timeout
        });

        if (!response.data || !response.data.data) {
            logger.error(`No data or malformed data received from TronScan for address: ${walletAddress}`);
            return;
        }

        const assetData = response.data;
        let calculatedTotalPortfolioValueUSD = 0;

        logger.info(`
--- Balances for ${walletAddress} ---`);
        logger.info(`Reported Total USD Value (from TronScan): $${assetData.totalAssetInUsd.toFixed(2)}`);
        logger.info(`Reported Total TRX Value (from TronScan): ${assetData.totalAssetInTrx.toFixed(6)} TRX`);


        if (assetData.data.length > 0) {
            for (const asset of assetData.data) {
                const amount = parseFloat(asset.balance) / Math.pow(10, asset.tokenDecimal);
                let priceUSD = asset.tokenPriceInUsd;
                let valueUSD = asset.assetInUsd; // Prefer TronScan's calculated assetInUsd

                // If TronScan's price is missing or zero, try to get it from our service for more detailed logging or cross-check
                if (priceUSD === 0 && asset.tokenAbbr.toLowerCase() !== 'trx') { // TRX price is usually handled by its own entry
                    const tokenInfoFromService = await tokenService.getToken(asset.tokenAbbr);
                    if (tokenInfoFromService && tokenInfoFromService.price && tokenInfoFromService.price > 0) {
                        logger.info(`(Local Price for ${asset.tokenAbbr}: $${tokenInfoFromService.price.toFixed(4)})`);
                        // Recalculate valueUSD if we prefer local price, otherwise just log it
                        // valueUSD = amount * tokenInfoFromService.price; 
                    } else {
                        logger.warn(`Price for ${asset.tokenAbbr} not found or zero in local TokenService.`);
                    }
                } else if (asset.tokenAbbr.toLowerCase() === 'trx' && priceUSD === 0) {
                    const tokenInfoFromService = await tokenService.getToken('TRX');
                    if (tokenInfoFromService && tokenInfoFromService.price && tokenInfoFromService.price > 0) {
                        priceUSD = tokenInfoFromService.price;
                        valueUSD = amount * priceUSD;
                        logger.info(`(TRX price from local service: $${priceUSD.toFixed(4)})`);
                    }
                }

                // Summing up TronScan's reported USD asset values
                calculatedTotalPortfolioValueUSD += valueUSD;

                logger.info(
                    `${asset.tokenName} (${asset.tokenAbbr}): ${amount.toFixed(asset.tokenDecimal)} ` +
                    `(${asset.tokenType.toUpperCase()}) | ` +
                    `Price: $${priceUSD.toFixed(4)} | ` +
                    `Value: $${valueUSD.toFixed(2)}`
                );
            }
        } else {
            logger.info('No token assets found via token_asset_overview endpoint.');
        }

        // This sum might differ slightly from TronScan's total due to timing or if we override with local prices.
        logger.info(`
--- Calculated Total Portfolio Value (from summing listed assets): $${calculatedTotalPortfolioValueUSD.toFixed(2)} USD ---`);


    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            logger.error(`Error fetching data from TronScan API: ${error.message}`, {
                status: error.response?.status,
                data: error.response?.data,
                url: error.config?.url,
                params: error.config?.params
            });
        } else {
            logger.error(`An unexpected error occurred: ${error.message}`, { stack: error.stack });
        }
    } finally {
        // If TokenService is a singleton and needs explicit cleanup in a script context:
        // tokenService.stop(); 
        // For now, assuming it doesn't need explicit stop for a short-lived script.
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    logger.error('Please provide a TRON wallet address as an argument.');
    logger.info('Usage: bun run backend/scripts/getTronWalletBalance.ts <WALLET_ADDRESS>');
    process.exit(1);
}

const walletAddress = args[0];
getTronWalletBalance(walletAddress); 