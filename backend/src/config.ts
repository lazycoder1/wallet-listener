import dotenv from 'dotenv';
import { Chain } from 'viem'; // Import Chain type
import { mainnet, polygon, bsc } from 'viem/chains'; // Import specific chain objects

dotenv.config(); // Load .env file

interface NetworkConfig {
    wsUrl: string;
    httpRpcUrl?: string; // Renamed from httpApiUrl
    apiKey?: string; // Some providers might not need a separate key in the URL
    tronNativePollingIntervalMs?: number; // Added for Tron native polling
    // For Etherscan-like APIs
    httpApiKey?: string;
}

// Define the EvmChainConfig interface that BalanceService expects
export interface EvmChainConfig {
    name: string;
    chainId: number;
    rpcUrl: string; // This will be the Alchemy URL for EVM chains
    chain: Chain;   // The viem chain object
    apiKey?: string; // Optional API key if needed directly for RPC
}

interface AppConfig {
    networks: {
        ethereum: NetworkConfig;
        polygon: NetworkConfig;
        bsc: NetworkConfig;
        tron: NetworkConfig; // Added Tron network
    };
    evmChains: EvmChainConfig[]; // Add the evmChains property
    logLevel: string; // Add log level configuration
    alchemy: {
        apiKey: string;
    };
    tronScan: { // Added for TronScan
        apiUrl?: string;
        apiKey?: string;
    };
    // Add other global configurations here if needed
}


export const config: AppConfig = {
    networks: {
        ethereum: {
            wsUrl: process.env.ETHEREUM_WSS_URL || '',
            httpRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID || ''}`,
        },
        polygon: {
            wsUrl: process.env.POLYGON_WSS_URL || '',
            httpRpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID || ''}`,
        },
        bsc: {
            wsUrl: process.env.BNB_WSS_URL || '',
            httpRpcUrl: `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID || ''}`,
        },
        tron: {
            wsUrl: process.env.TRONGRID_API_URL || 'https://api.trongrid.io',
            apiKey: process.env.TRONGRID_API_KEY,
            tronNativePollingIntervalMs: process.env.TRON_NATIVE_POLLING_INTERVAL_MS ? parseInt(process.env.TRON_NATIVE_POLLING_INTERVAL_MS, 10) : 3000, // Default to 3000ms
        },
    },
    evmChains: [
        {
            name: 'Ethereum',
            chainId: mainnet.id,
            rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID || ''}`,
            chain: mainnet,
        },
        {
            name: 'Polygon',
            chainId: polygon.id,
            rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID || ''}`,
            chain: polygon,
        },
        {
            name: 'BSC',
            chainId: bsc.id,
            rpcUrl: `https://bsc-mainnet.nodereal.io/v1/${process.env.NODEREAL_API_KEY || ''}`, // Example, adjust if using Alchemy for BSC
            chain: bsc,
        }
    ],
    // logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    logLevel: "info",
    alchemy: {
        apiKey: process.env.ALCHEMY_ID || '',
    },
    tronScan: { // Added for TronScan
        apiUrl: process.env.TRONSCAN_API_URL || 'https://apilist.tronscanapi.com',
        apiKey: process.env.TRONSCAN_API_KEY,
    }
};

// Validate essential config
if (!config.evmChains.every(chain => chain.rpcUrl && !chain.rpcUrl.endsWith('undefined') && !chain.rpcUrl.endsWith('null'))) {
    console.error("Missing one or more RPC URLs for EVM chains in .env file or config. Please check ALCHEMY_ID or specific RPC URL env vars.");
}

if (!config.alchemy.apiKey) {
    console.error("Missing Alchemy API key in .env file. Please check ALCHEMY_ID.");
    // process.exit(1); // Consider exiting in a real app if essential config is missing
} 