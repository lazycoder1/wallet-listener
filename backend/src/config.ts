import dotenv from 'dotenv';

dotenv.config(); // Load .env file

interface NetworkConfig {
    wsUrl: string;
    apiKey?: string; // Some providers might not need a separate key in the URL
    tronNativePollingIntervalMs?: number; // Added for Tron native polling
}

interface AppConfig {
    networks: {
        ethereum: NetworkConfig;
        polygon: NetworkConfig;
        bsc: NetworkConfig;
        tron: NetworkConfig; // Added Tron network
    };
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

// Ensure your .env file has these variables, e.g.:
// ETHEREUM_WSS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_ETH_API_KEY
// POLYGON_WSS_URL=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_POLYGON_API_KEY
// BNB_WSS_URL=wss://bnb-mainnet.g.alchemy.com/v2/YOUR_BNB_API_KEY
// TRONGRID_API_URL=https://api.trongrid.io
// TRONGRID_API_KEY=YOUR_TRONGRID_API_KEY (if needed separately)
// TRONSCAN_API_URL=https://apilist.tronscanapi.com (optional, defaults to this)
// TRONSCAN_API_KEY=YOUR_TRONSCAN_API_KEY (optional)
// LOG_LEVEL=debug|info|warn|error (optional, defaults to 'info' in production, 'debug' in development)
// ALCHEMY_API_KEY=YOUR_ALCHEMY_API_KEY

export const config: AppConfig = {
    networks: {
        ethereum: {
            wsUrl: process.env.ETHEREUM_WSS_URL || '',
        },
        polygon: {
            wsUrl: process.env.POLYGON_WSS_URL || '',
        },
        bsc: {
            wsUrl: process.env.BNB_WSS_URL || '',
        },
        tron: {
            wsUrl: process.env.TRONGRID_API_URL || 'https://api.trongrid.io',
            apiKey: process.env.TRONGRID_API_KEY,
            tronNativePollingIntervalMs: process.env.TRON_NATIVE_POLLING_INTERVAL_MS ? parseInt(process.env.TRON_NATIVE_POLLING_INTERVAL_MS, 10) : 3000, // Default to 3000ms
        },
    },
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
if (!config.networks.ethereum.wsUrl || !config.networks.polygon.wsUrl || !config.networks.bsc.wsUrl) {
    console.error("Missing one or more WebSocket URLs in .env file. Please check ETHEREUM_WSS_URL, POLYGON_WSS_URL, BNB_WSS_URL.");
    // process.exit(1); // Consider exiting in a real app if essential config is missing
}

if (!config.alchemy.apiKey) {
    console.error("Missing Alchemy API key in .env file. Please check ALCHEMY_API_KEY.");
    // process.exit(1); // Consider exiting in a real app if essential config is missing
} 