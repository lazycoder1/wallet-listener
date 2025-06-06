import { createWalletClient, http, parseEther, type Chain, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { mainnet, bsc, polygon } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const privateKey = process.env.PVT_KEY as Hex | undefined;

if (!privateKey) {
    throw new Error('PVT_KEY not found in .env file. Please ensure it is set.');
}

export const account: PrivateKeyAccount = privateKeyToAccount(privateKey);

interface RpcUrls {
    ethereum: string;
    polygon: string;
    bsc: string;
}

// User will need to set these in their .env file
const rpcUrls: RpcUrls = {
    ethereum: process.env.ETHEREUM_RPC_URL || 'https://rpc.ankr.com/eth',
    polygon: process.env.POLYGON_RPC_URL || 'https://rpc.ankr.com/polygon',
    bsc: process.env.BSC_RPC_URL || 'https://rpc.ankr.com/bsc',
};

export function getClient(chain: Chain) {
    let rpcUrl: string;
    switch (chain.id) {
        case mainnet.id:
            rpcUrl = rpcUrls.ethereum;
            break;
        case polygon.id:
            rpcUrl = rpcUrls.polygon;
            break;
        case bsc.id:
            rpcUrl = rpcUrls.bsc;
            break;
        default:
            throw new Error(`Unsupported chain: ${chain.name}`);
    }

    if (!rpcUrl) {
        throw new Error(`RPC URL for chain ${chain.name} is not configured.`);
    }

    return createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
    });
}

export async function sendNativeToken(
    clientChain: Chain,
    to: Hex,
    amount: string // Amount in Ether, e.g., "0.01"
) {
    const client = getClient(clientChain);
    const value = parseEther(amount);

    console.log(`Sending ${amount} ${clientChain.nativeCurrency.symbol} to ${to} on ${clientChain.name}`);
    const hash = await client.sendTransaction({
        to,
        value,
    });
    console.log(`Transaction sent on ${clientChain.name}. Hash: ${hash}`);
    return hash;
}

// Standard ERC20 ABI for the transfer function
const erc20TransferABI = [
    {
        "constant": false,
        "inputs": [
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const; // Use 'as const' for better type inference with viem

export async function sendERC20Token(
    clientChain: Chain,
    tokenContractAddress: Hex,
    to: Hex,
    amount: bigint // Amount in smallest unit (e.g., wei for 18 decimals)
) {
    const client = getClient(clientChain);

    console.log(`Sending ERC20 token (${tokenContractAddress}) amount ${amount.toString()} to ${to} on ${clientChain.name}`);
    const hash = await client.writeContract({
        address: tokenContractAddress,
        abi: erc20TransferABI,
        functionName: 'transfer',
        args: [to, amount],
    });
    console.log(`ERC20 Transaction sent on ${clientChain.name}. Hash: ${hash}`);
    return hash;
}

// Example usage (can be removed or moved to test files):
/*
async function exampleTransactions() {
    try {
        // Ensure PVT_KEY, ETHEREUM_RPC_URL, POLYGON_RPC_URL, BSC_RPC_URL are in .env
        // And the account has funds

        const recipientAddress = '0xRecipientAddressHere'; // Replace with actual recipient

        // Send ETH on Ethereum Mainnet
        // await sendNativeToken(mainnet, recipientAddress as Hex, '0.001');

        // Send MATIC on Polygon Mainnet
        // await sendNativeToken(polygon, recipientAddress as Hex, '0.1');
        
        // Send BNB on BSC Mainnet
        // await sendNativeToken(bsc, recipientAddress as Hex, '0.01');

        // Send an ERC20 token (e.g., USDT on Ethereum)
        // You'll need the token's contract address and the amount in its smallest unit.
        // For USDT (6 decimals), 1 USDT = 1_000_000 smallest units.
        const usdtEthereumAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        // await sendERC20Token(mainnet, usdtEthereumAddress as Hex, recipientAddress as Hex, BigInt(1 * (10**6)));

    } catch (error) {
        console.error('Error during example transactions:', error);
    }
}

// exampleTransactions();
*/ 