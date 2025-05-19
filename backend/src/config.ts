import dotenv from 'dotenv';

dotenv.config(); // Load .env file

interface NetworkConfig {
    wsUrl: string;
    apiKey?: string; // Some providers might not need a separate key in the URL
}

interface AppConfig {
    networks: {
        ethereum: NetworkConfig;
        polygon: NetworkConfig;
        bsc: NetworkConfig;
        tron: NetworkConfig;
    };
    // Add other global configurations here if needed
}

// Ensure your .env file has these variables, e.g.:
// ETHEREUM_WSS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_ETH_API_KEY
// POLYGON_WSS_URL=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_POLYGON_API_KEY
// BSC_WSS_URL=wss://bsc-mainnet.g.alchemy.com/v2/YOUR_BSC_API_KEY
// TRONGRID_WSS_URL=wss://api.trongrid.io/jsonrpc // or your full node
// TRONGRID_API_KEY=YOUR_TRONGRID_API_KEY (if needed separately)

export const config: AppConfig = {
    networks: {
        ethereum: {
            wsUrl: process.env.ETHEREUM_WSS_URL || '',
        },
        polygon: {
            wsUrl: process.env.POLYGON_WSS_URL || '',
        },
        bsc: {
            wsUrl: process.env.BSC_WSS_URL || '',
        },
        tron: {
            wsUrl: process.env.TRONGRID_WSS_URL || '',
            apiKey: process.env.TRONGRID_API_KEY, // Optional, depending on provider
        },
    },
};

// Validate essential config
if (!config.networks.ethereum.wsUrl || !config.networks.polygon.wsUrl || !config.networks.bsc.wsUrl || !config.networks.tron.wsUrl) {
    console.error("Missing one or more WebSocket URLs in .env file. Please check ETHEREUM_WSS_URL, POLYGON_WSS_URL, BSC_WSS_URL, TRONGRID_WSS_URL.");
    // process.exit(1); // Consider exiting in a real app if essential config is missing
} 