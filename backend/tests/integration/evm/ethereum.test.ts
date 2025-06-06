import { describe, it, expect } from '@jest/globals';
import { mainnet } from 'viem/chains';
import { sendNativeToken, sendERC20Token, account } from '../../common/evm-transfer-helper';
import type { Hex } from 'viem';

// Ensure PVT_KEY, ETHEREUM_RPC_URL are in .env
// Ensure the account has ETH and the specified ERC20 tokens for transfer.

describe('Ethereum Transfers', () => {
    const recipientAddress: Hex = '0xD50a6bF340242c4a555618aABaa31765432e8F5a'; // Updated recipient address

    // Example: Native ETH transfer
    it('should send ETH on Ethereum mainnet', async () => {
        try {
            const amountToSend = '0.0001'; // Ether
            const txHash = await sendNativeToken(mainnet, recipientAddress, amountToSend);
            console.log(`Ethereum native transfer successful. Transaction Hash: ${txHash}`);
            expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        } catch (error) {
            console.error('Error sending ETH on Ethereum:', error);
            throw error;
        }
    }, 60000); // Increase timeout for blockchain interactions

    // Example: ERC20 token transfer (e.g., USDT)
    // You will need the token contract address for the specific token on Ethereum.
    // The amount should be in the token's smallest unit (e.g., for USDT with 6 decimals, 1 USDT = 1_000_000).
    it('should send an ERC20 token (e.g., USDT) on Ethereum mainnet', async () => {
        const usdtContractAddress: Hex = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT on Ethereum
        const amountInSmallestUnit = BigInt(1000); // 0.001 USDT (6 decimals: 0.001 * 10^6 = 1000)

        console.log(`Attempting to send ERC20 token from ${account.address} to ${recipientAddress} on Ethereum.`);
        try {
            const txHash = await sendERC20Token(mainnet, usdtContractAddress, recipientAddress, amountInSmallestUnit);
            console.log(`Ethereum ERC20 transfer successful. Token: USDT, Transaction Hash: ${txHash}`);
            expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        } catch (error) {
            console.error('Error sending ERC20 token on Ethereum:', error);
            throw error;
        }
    }, 60000); // Increase timeout

    // TODO: Add more test cases as needed
    // - Test with different amounts
    // - Test with different ERC20 tokens (get addresses from tokens.json)
    // - Test for insufficient balance (though this requires specific setup)
    // - Test for invalid recipient address (if the helper/viem throws a specific error)
}); 