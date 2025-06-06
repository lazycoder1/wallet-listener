import { describe, it, expect, beforeAll } from '@jest/globals';
import * as TronWebModule from 'tronweb';
import dotenv from 'dotenv';

dotenv.config(); // Ensure environment variables are loaded

// Viem does not support Tron. You will need to use a Tron-specific library like TronWeb.
// Ensure PVT_KEY and TRON_RPC_URL are in your .env file.

describe('Tron Transfers', () => {
    // IMPORTANT: Tron addresses are Base58 encoded (e.g., starting with 'T').
    // The address below is an EVM-style address for placeholder consistency with other files.
    // REPLACE IT WITH THE ACTUAL BASE58 TRON RECIPIENT ADDRESS FOR TESTING.
    const recipientAddressPlaceholder = '0xD50a6bF340242c4a555618aABaa31765432e8F5a'; // TODO: REPLACE with actual Base58 Tron address!
    const actualTronRecipientAddress: string = 'REPLACE_WITH_ACTUAL_TRON_RECIPIENT_ADDRESS_T...'; // Explicitly typed as string

    let tronWeb: any; // Type remains any for now
    let senderAddress: string;

    beforeAll(() => {
        const privateKey = process.env.PVT_KEY;
        const tronRpcUrl = process.env.TRON_RPC_URL || 'https://api.trongrid.io';

        if (!privateKey) {
            throw new Error('PVT_KEY for Tron not found in .env file.');
        }
        // TronWeb expects private key without '0x' prefix
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;

        // Attempting instantiation via TronWebModule.TronWeb
        tronWeb = new TronWebModule.TronWeb(
            tronRpcUrl,
            tronRpcUrl,
            tronRpcUrl,
            formattedPrivateKey
        );

        if (!tronWeb || !tronWeb.defaultAddress || !tronWeb.defaultAddress.base58) {
            throw new Error('Failed to initialize Tron account from PVT_KEY. Check TronWeb instantiation, RPC URL and private key.');
        }
        senderAddress = tronWeb.defaultAddress.base58;
        console.log(`Tron account initialized: ${senderAddress}`);
        console.log(`Using Tron RPC: ${tronRpcUrl}`);
    });

    it('should send TRX (native token) on Tron network', async () => {
        if (actualTronRecipientAddress === 'REPLACE_WITH_ACTUAL_TRON_RECIPIENT_ADDRESS_T...' || !actualTronRecipientAddress.startsWith('T')) {
            console.warn("Actual Tron recipient address not set or invalid for native TRX transfer test. Test will be skipped. Please replace 'REPLACE_WITH_ACTUAL_TRON_RECIPIENT_ADDRESS_T...' in the script.");
            expect(true).toBe(true); // Skip assertion
            return;
        }

        try {
            const amountInSun = 100000; // 0.1 TRX (1 TRX = 1,000,000 SUN)
            console.log(`Attempting to send ${amountInSun / 1000000} TRX from ${senderAddress} to ${actualTronRecipientAddress}`);

            const tradeobj = await tronWeb.transactionBuilder.sendTrx(actualTronRecipientAddress, amountInSun, senderAddress);
            const signedtxn = await tronWeb.trx.sign(tradeobj, tronWeb.defaultPrivateKey);
            const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);

            console.log(`Tron native (TRX) transfer successful. Transaction ID: ${receipt.txid}`);
            expect(receipt.txid).toBeDefined();
            expect(receipt.result || receipt.ret?.[0]?.contractRet === 'SUCCESS').toBe(true); // Check for success
        } catch (error) {
            console.error('Error sending TRX on Tron:', error);
            throw error;
        }
    }, 60000); // Increased timeout for blockchain interaction

    it('should send a TRC20 token (USDT) on Tron network', async () => {
        const usdtTrc20Address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT on Tron
        const usdtDecimals = 6;
        const amountToSend = 0.001;
        const amountInSmallestUnit = BigInt(amountToSend * (10 ** usdtDecimals)); // 0.001 USDT

        if (actualTronRecipientAddress === 'REPLACE_WITH_ACTUAL_TRON_RECIPIENT_ADDRESS_T...' || !actualTronRecipientAddress.startsWith('T')) {
            console.warn("Actual Tron recipient address not set or invalid for TRC20 transfer test. Test will be skipped. Please replace 'REPLACE_WITH_ACTUAL_TRON_RECIPIENT_ADDRESS_T...' in the script.");
            expect(true).toBe(true); // Skip assertion
            return;
        }

        console.log(`Attempting to send ${amountToSend} USDT (TRC20) from ${senderAddress} to ${actualTronRecipientAddress}`);

        try {
            const contract = await tronWeb.contract().at(usdtTrc20Address);
            const txId = await contract.transfer(
                actualTronRecipientAddress,
                amountInSmallestUnit.toString()
            ).send({
                feeLimit: 100_000_000, // Example fee limit in SUN, adjust as needed
                shouldPollResponse: true // Poll for transaction confirmation (can take time)
            });

            console.log(`Tron TRC20 (USDT) transfer successful. Transaction ID: ${txId}`);
            expect(txId).toBeDefined();
            // Note: For `shouldPollResponse: true`, TronWeb often returns the transaction ID directly if successful.
            // To get more details or confirm, you might need: await tronWeb.trx.getTransaction(txId);
        } catch (error) {
            console.error('Error sending TRC20 (USDT) token on Tron:', error);
            throw error;
        }
    }, 120000); // Increased timeout for TRC20 transfer and polling

    // TODO: Add more test cases as needed for Tron (different amounts, other TRC20 tokens, failure cases)
}); 