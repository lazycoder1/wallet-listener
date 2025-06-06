import { describe, it, expect } from '@jest/globals';
import { polygon } from 'viem/chains';
import { sendNativeToken, sendERC20Token, account } from '../../common/evm-transfer-helper';
import type { Hex } from 'viem';

// Ensure PVT_KEY, POLYGON_RPC_URL are in .env
// Ensure the account has MATIC and the specified ERC20 tokens for transfer.

describe('Polygon Transfers', () => {
    const recipientAddress: Hex = '0xD50a6bF340242c4a555618aABaa31765432e8F5a'; // Updated recipient address

    it('should send MATIC on Polygon mainnet', async () => {
        try {
            const amountToSend = '0.01'; // MATIC
            const txHash = await sendNativeToken(polygon, recipientAddress, amountToSend);
            console.log(`Polygon native transfer successful. Transaction Hash: ${txHash}`);
            expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        } catch (error) {
            console.error('Error sending MATIC on Polygon:', error);
            throw error;
        }
    }, 60000);

    it('should send an ERC20 token (e.g., USDC) on Polygon mainnet', async () => {
        const usdcContractAddress: Hex = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'; // USDC on Polygon from tokens.json
        const amountInSmallestUnit = BigInt(1000); // 0.001 USDC (6 decimals: 0.001 * 10^6 = 1000)

        console.log(`Attempting to send ERC20 token from ${account.address} to ${recipientAddress} on Polygon.`);
        try {
            const txHash = await sendERC20Token(polygon, usdcContractAddress, recipientAddress, amountInSmallestUnit);
            console.log(`Polygon ERC20 transfer successful. Token: USDC, Transaction Hash: ${txHash}`);
            expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        } catch (error) {
            console.error('Error sending ERC20 token on Polygon:', error);
            throw error;
        }
    }, 60000);

    // TODO: Add more test cases
}); 