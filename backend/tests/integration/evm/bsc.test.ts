import { describe, it, expect } from '@jest/globals';
import { bsc } from 'viem/chains';
import { sendNativeToken, sendERC20Token, account } from '../../common/evm-transfer-helper';
import type { Hex } from 'viem';

// Ensure PVT_KEY, BSC_RPC_URL are in .env
// Ensure the account has BNB and the specified ERC20 tokens for transfer.

describe('BSC Transfers', () => {
    const recipientAddress: Hex = '0xD50a6bF340242c4a555618aABaa31765432e8F5a'; // Updated recipient address

    it('should send BNB on BSC mainnet', async () => {
        try {
            const amountToSend = '0.001'; // BNB
            const txHash = await sendNativeToken(bsc, recipientAddress, amountToSend);
            console.log(`BSC native transfer successful. Transaction Hash: ${txHash}`);
            expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        } catch (error) {
            console.error('Error sending BNB on BSC:', error);
            throw error;
        }
    }, 60000);

    it('should send an ERC20 token (e.g., USDT) on BSC mainnet', async () => {
        const usdtContractAddress: Hex = '0x55d398326f99059fF775485246999027B3197955'; // USDT on BSC from tokens.json
        const amountInSmallestUnit = BigInt(1000); // 0.001 USDT (6 decimals: 0.001 * 10^6 = 1000)
        // For tokens with 18 decimals like many on BSC, it would be BigInt(1 * (10**18))

        console.log(`Attempting to send ERC20 token from ${account.address} to ${recipientAddress} on BSC.`);
        try {
            const txHash = await sendERC20Token(bsc, usdtContractAddress, recipientAddress, amountInSmallestUnit);
            console.log(`BSC ERC20 transfer successful. Token: USDT, Transaction Hash: ${txHash}`);
            expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        } catch (error) {
            console.error('Error sending ERC20 token on BSC:', error);
            throw error;
        }
    }, 60000);

    // TODO: Add more test cases
}); 