import axios from 'axios';
import * as TronWebLib from 'tronweb';
import { config as appConfig } from '../src/config';
import logger from '../src/config/logger';
import { TokenService } from '../src/services/token/tokenService';

// Initialize TronWeb for address validation and conversion
const tronWeb = new TronWebLib.TronWeb({
    fullHost: appConfig.networks.tron.wsUrl || 'https://api.trongrid.io',
});

interface ScriptArgs {
    blockNumber: number;
    addressToCheck: string; // Base58 format
}

interface TronScanTRC20Transfer {
    transaction_id: string;
    block_timestamp: number;
    block_number: number;
    contract_address: string;
    from_address: string;
    to_address: string;
    value: string;
    decimals: number;
    symbol: string;
    name: string;
    confirmed: boolean;
}

interface TronScanBlockResponse {
    data: TronScanTRC20Transfer[];
    total: number;
    rangeTotal: number;
}

/**
 * Get TRC20 transfers for a specific block number using TronScan API
 */
async function getTRC20TransfersInBlock(blockNumber: number): Promise<TronScanTRC20Transfer[]> {
    const url = `${appConfig.tronScan.apiUrl}/api/token_trc20/transfers`;
    const params = {
        start_block: blockNumber,
        end_block: blockNumber,
        limit: 200, // Max transfers to fetch
        start: 0
    };

    try {
        logger.info(`Fetching TRC20 transfers for block ${blockNumber} from TronScan API...`);
        const response = await axios.get<TronScanBlockResponse>(url, {
            params,
            timeout: 15000
        });

        logger.info(`API Response status: ${response.status}`);
        console.log(`Raw API Response:`, JSON.stringify(response.data, null, 2));

        if (response.data && response.data.data) {
            logger.info(`Found ${response.data.data.length} TRC20 transfers in block ${blockNumber}`);
            return response.data.data;
        }

        logger.warn(`No TRC20 transfer data received for block ${blockNumber}`);
        return [];
    } catch (error: any) {
        logger.error(`Error fetching TRC20 transfers for block ${blockNumber}:`, error.message);
        if (error.response) {
            logger.error(`Response status: ${error.response.status}`);
            logger.error(`Response data:`, error.response.data);
        }
        return [];
    }
}

/**
 * Filter transfers to find ones going to the target address
 */
function findTRC20TransfersToAddress(transfers: TronScanTRC20Transfer[], targetAddressBase58: string): TronScanTRC20Transfer[] {
    const matchingTransfers = transfers.filter(transfer => {
        // Normalize the to_address to ensure proper comparison
        let normalizedToAddress = transfer.to_address;

        // If the address is in hex format, convert to Base58
        if (tronWeb.utils.isHex(transfer.to_address) && transfer.to_address.toLowerCase().startsWith('41')) {
            try {
                normalizedToAddress = tronWeb.address.fromHex(transfer.to_address);
            } catch (e) {
                logger.warn(`Failed to convert hex address ${transfer.to_address} to Base58`);
                return false;
            }
        }

        return normalizedToAddress === targetAddressBase58;
    });

    return matchingTransfers;
}

/**
 * Format transfer amount based on token decimals
 */
function formatTransferAmount(value: string, decimals: number): string {
    const numericValue = BigInt(value);
    const divisor = BigInt(10) ** BigInt(decimals);
    const quotient = Number(numericValue) / Number(divisor);
    return quotient.toString();
}

/**
 * Get token information from database
 */
async function getTokenInfo(contractAddress: string): Promise<{ symbol: string; decimals: number; price: number | null } | null> {
    try {
        const tokenService = TokenService.getInstance();
        const tokenData = await tokenService.getTokenByAddress('tron', contractAddress);

        if (tokenData) {
            return {
                symbol: tokenData.symbol,
                decimals: tokenData.decimals,
                price: tokenData.price
            };
        }
        return null;
    } catch (error) {
        logger.warn(`Error getting token info for ${contractAddress}:`, error);
        return null;
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        logger.error("Usage: bun backend/scripts/check_trc20_transfers_in_block.ts <blockNumber> <addressToCheckBase58>");
        logger.error("Example: bun backend/scripts/check_trc20_transfers_in_block.ts 62000000 TPAgTQy29hNfK5Xm2KFALzfYxpytC1raLM");
        process.exit(1);
    }

    const blockNumber = parseInt(args[0], 10);
    const addressToCheck = args[1];

    if (isNaN(blockNumber) || blockNumber <= 0) {
        logger.error("Invalid block number provided.");
        process.exit(1);
    }

    if (!tronWeb.isAddress(addressToCheck)) {
        logger.error(`Invalid Tron address provided: ${addressToCheck}. Please provide a Base58 address (T...).`);
        process.exit(1);
    }

    logger.info(`Starting script to check block ${blockNumber} for TRC20 transfers to ${addressToCheck}`);

    // Get all TRC20 transfers in the block
    const allTransfers = await getTRC20TransfersInBlock(blockNumber);

    if (allTransfers.length === 0) {
        logger.info(`
--- Summary ---`);
        logger.info(`No TRC20 transfers found in block ${blockNumber}.`);
        return;
    }

    // Filter for transfers to our target address
    const targetTransfers = findTRC20TransfersToAddress(allTransfers, addressToCheck);

    if (targetTransfers.length === 0) {
        logger.info(`
--- Summary ---`);
        logger.info(`No TRC20 transfers found for address ${addressToCheck} in block ${blockNumber}.`);
        logger.info(`Total TRC20 transfers in block: ${allTransfers.length}`);
        return;
    }

    logger.info(`
--- Summary ---`);
    logger.info(`Found ${targetTransfers.length} TRC20 transfer(s) to address ${addressToCheck} in block ${blockNumber}:`);

    for (let i = 0; i < targetTransfers.length; i++) {
        const transfer = targetTransfers[i];
        const formattedAmount = formatTransferAmount(transfer.value, transfer.decimals);

        // Get additional token info from our database
        const tokenInfo = await getTokenInfo(transfer.contract_address);
        const knownToken = tokenInfo ? `(Known: ${tokenInfo.symbol})` : '(Unknown token)';
        const price = tokenInfo?.price ? ` - $${(parseFloat(formattedAmount) * tokenInfo.price).toFixed(2)} USD` : '';

        logger.info(`
${i + 1}. TRC20 Transfer Details:
   Transaction ID: ${transfer.transaction_id}
   From: ${transfer.from_address}
   To: ${transfer.to_address}
   Token Contract: ${transfer.contract_address}
   Token Symbol: ${transfer.symbol} ${knownToken}
   Amount: ${formattedAmount} ${transfer.symbol}${price}
   Token Name: ${transfer.name}
   Decimals: ${transfer.decimals}
   Block Timestamp: ${new Date(transfer.block_timestamp).toISOString()}
   Confirmed: ${transfer.confirmed}`);
    }

    logger.info(`
Total TRC20 transfers in block ${blockNumber}: ${allTransfers.length}
Transfers to ${addressToCheck}: ${targetTransfers.length}`);
}

main().catch(error => {
    logger.error("Unhandled error in script:", error);
    process.exit(1);
}); 