import axios from 'axios';
import * as TronWebLib from 'tronweb';
import { config as appConfig } from '../src/config'; // Assuming config is exportable
import logger from '../src/config/logger'; // Assuming logger is exportable

// Initialize TronWeb. It's needed for address conversion.
const tronWeb = new TronWebLib.TronWeb({
    fullHost: appConfig.networks.tron.wsUrl || 'https://api.trongrid.io',
    // No private key needed for read-only operations
});

interface ScriptArgs {
    blockNumber: number;
    addressToCheck: string; // Base58 format
}

interface TronTransactionFromBlock {
    txID: string;
    ret: { contractRet: string }[];
    raw_data: {
        contract: {
            type: string;
            parameter: {
                value: {
                    owner_address: string; // Hex format
                    to_address: string;    // Hex format
                    amount: number;
                };
            };
        }[];
        timestamp: number;
    };
}

interface TronBlock {
    blockID: string;
    block_header: {
        raw_data: {
            number: number;
            timestamp: number;
        };
    };
    transactions?: TronTransactionFromBlock[];
}

async function getBlockByNumber(blockNumber: number): Promise<TronBlock | null> {
    const url = `${appConfig.networks.tron.wsUrl}/wallet/getblockbynum`;
    const apiKey = appConfig.networks.tron.apiKey;
    const headers = apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {};

    try {
        logger.info(`Fetching block ${blockNumber} from ${url}`);
        const response = await axios.post(url, { num: blockNumber }, { headers });
        if (response.data && typeof response.data === 'object') { // Basic check for non-empty object
            // TronGrid sometimes returns an empty object {} for a non-existent block
            if (Object.keys(response.data).length === 0) {
                logger.warn(`Received empty object for block ${blockNumber}. It might not exist or there was an API issue.`);
                return null;
            }
            return response.data as TronBlock;
        }
        logger.warn(`No data received for block ${blockNumber}, response: ${JSON.stringify(response.data)}`);
        return null;
    } catch (error: any) {
        logger.error(`Error fetching block ${blockNumber}: ${error.message}`);
        if (error.response) {
            logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            logger.error(`Response status: ${error.response.status}`);
        }
        return null;
    }
}

function findNativeTransfersToAddress(block: TronBlock, targetAddressBase58: string): any[] {
    const transfersFound: any[] = [];
    if (!block.transactions || block.transactions.length === 0) {
        logger.info(`Block ${block.block_header.raw_data.number} has no transactions.`);
        return transfersFound;
    }

    logger.info(`Checking ${block.transactions.length} transactions in block ${block.block_header.raw_data.number} for transfers to ${targetAddressBase58}...`);

    for (const tx of block.transactions) {
        if (!tx.raw_data || !tx.raw_data.contract || tx.raw_data.contract.length === 0) {
            // logger.debug(`Transaction ${tx.txID} has no contract data.`);
            continue;
        }

        const contract = tx.raw_data.contract[0];
        if (contract.type === 'TransferContract') {
            // Check for successful transaction
            if (tx.ret && tx.ret[0] && tx.ret[0].contractRet === 'SUCCESS') {
                const toAddressHex = contract.parameter.value.to_address;
                const amount = contract.parameter.value.amount;
                const ownerAddressHex = contract.parameter.value.owner_address;

                if (!toAddressHex) {
                    // logger.debug(`Transaction ${tx.txID} is a TransferContract but has no to_address.`);
                    continue;
                }

                let toAddressBase58: string;
                try {
                    toAddressBase58 = tronWeb.address.fromHex(toAddressHex);
                } catch (e: any) {
                    logger.warn(`Error converting hex address ${toAddressHex} to Base58 for tx ${tx.txID}: ${e.message}`);
                    continue;
                }

                // logger.debug(`Tx ${tx.txID}: To (Hex): ${toAddressHex}, To (Base58): ${toAddressBase58}, Amount: ${amount}`);


                if (toAddressBase58 === targetAddressBase58) {
                    const transferInfo = {
                        txID: tx.txID,
                        from: tronWeb.address.fromHex(ownerAddressHex),
                        to: toAddressBase58,
                        amount: amount / 1_000_000, // Convert from SUN to TRX
                        blockNumber: block.block_header.raw_data.number,
                        blockTimestamp: block.block_header.raw_data.timestamp,
                    };
                    transfersFound.push(transferInfo);
                    logger.info(`Found native TRX transfer to ${targetAddressBase58} in tx ${tx.txID}: ${JSON.stringify(transferInfo, null, 2)}`);
                }
            } else {
                // logger.debug(`Transaction ${tx.txID} (TransferContract) was not successful (ret: ${tx.ret[0]?.contractRet}).`);
            }
        }
    }
    return transfersFound;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        logger.error("Usage: bun backend/scripts/check_block_transfers.ts <blockNumber> <addressToCheckBase58>");
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

    logger.info(`Starting script to check block ${blockNumber} for transfers to ${addressToCheck}`);

    const blockData = await getBlockByNumber(blockNumber);

    if (!blockData) {
        logger.error(`Could not retrieve data for block ${blockNumber}. Exiting.`);
        process.exit(1);
    }

    if (!blockData.block_header || !blockData.block_header.raw_data) {
        logger.error(`Block data for ${blockNumber} is malformed or incomplete (missing block_header.raw_data). Response: ${JSON.stringify(blockData)}`);
        process.exit(1);
    }


    logger.info(`Successfully fetched block ${blockData.block_header.raw_data.number} (ID: ${blockData.blockID}, Timestamp: ${blockData.block_header.raw_data.timestamp})`);

    const transfers = findNativeTransfersToAddress(blockData, addressToCheck);

    if (transfers.length > 0) {
        logger.info(`
--- Summary ---`);
        logger.info(`Found ${transfers.length} native TRX transfer(s) to address ${addressToCheck} in block ${blockNumber}:`);
        transfers.forEach((tx, index) => {
            logger.info(`${index + 1}. TxID: ${tx.txID}, From: ${tx.from}, Amount: ${tx.amount} TRX`);
        });
    } else {
        logger.info(`
--- Summary ---`);
        logger.info(`No native TRX transfers found for address ${addressToCheck} in block ${blockNumber}.`);
    }
}

main().catch(error => {
    logger.error("Unhandled error in script:", error);
    process.exit(1);
}); 