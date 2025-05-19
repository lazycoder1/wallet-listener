import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox"; // Includes ethers, waffle, etc.

const config: HardhatUserConfig = {
    solidity: "0.8.20",
    networks: {
        hardhat: { // This is the default network when you run `npx hardhat node`
            chainId: 31337, // Standard chain ID for Hardhat local network
            // loggingEnabled: true, // Uncomment to see RPC calls in Hardhat node console
        },
        // You could define other networks here if needed, e.g., for a specific testnet
        // localhost: {
        //   url: "http://127.0.0.1:8545", // Default for `npx hardhat node`
        //   chainId: 31337,
        // },
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    mocha: {
        timeout: 40000
    }
};

export default config; 