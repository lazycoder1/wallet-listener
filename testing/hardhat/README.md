# Hardhat Local Testnet Environment

This directory contains a Hardhat setup to run a local testnet for simulating Ethereum transactions. This is useful for testing the main application's WebSocket listeners (`EvmConnectionManager`) in a controlled environment.

## Setup Instructions

1.  **Navigate to this Directory:**
    Open your terminal and change to this directory:
    ```bash
    cd testing/hardhat
    ```

2.  **Install Dependencies:**
    If you haven't already, you'll need Node.js and npm/yarn installed. Then, install the Hardhat project dependencies:
    ```bash
    npm install
    # or
    # yarn install
    ```
    This will install Hardhat, ethers.js, OpenZeppelin contracts, and other necessary tools defined in a `package.json` (which you would create by running `npm init -y` or `yarn init -y` first, then `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts` or the yarn equivalents).

    *Self-correction: As an AI, I cannot create a `package.json` or run `npm install` for you. You will need to initialize a `package.json` (e.g., `npm init -y`) and then install the dependencies manually as listed above if you intend to run this.* 

3.  **Compile Contracts:**
    Compile the `TestToken.sol` contract:
    ```bash
    npx hardhat compile
    ```
    This will also generate TypeChain typings, which `performTestTransfers.ts` uses.

## Running the Local Testnet

1.  **Start the Hardhat Node:**
    In one terminal window, run:
    ```bash
    npx hardhat node
    ```
    This will start a local Ethereum node, typically listening on `http://127.0.0.1:8545` for HTTP RPC and `ws://127.0.0.1:8545` for WebSocket RPC. It will also output a list of funded test accounts and their private keys.

## Performing Test Transactions

1.  **Run the Transfer Script:**
    In another terminal window (while the Hardhat node is still running), execute the script:
    ```bash
    npx hardhat run scripts/performTestTransfers.ts --network localhost
    ```
    This script will:
    *   Deploy the `TestToken` ERC20 contract.
    *   Perform a native ETH transfer to `Account1`.
    *   Perform an ERC20 `TestToken` transfer to `Account1`.
    *   Log the transaction hashes and relevant addresses (like `Account1`'s address and the `TestToken` contract address).

## Connecting Your Application

1.  **Configure WebSocket Endpoint:**
    To make your main Wallet Watcher application listen to this local Hardhat testnet, you need to configure one of its EVM chain WebSocket URLs to point to the Hardhat node.
    *   Modify your application's `.env` file or `appConfig` (e.g., in `backend/src/config.ts`).
    *   For example, you could add a "Localhost" or "Hardhat" chain configuration:
        ```typescript
        // In your appConfig.networks.ethereum or a new entry
        localhost: {
          httpUrl: "http://127.0.0.1:8545",
          wsUrl: "ws://127.0.0.1:8545",
          chainId: 31337, // Ensure this matches Hardhat's chainId
          name: "Localhost Hardhat"
        },
        ```
    *   Ensure the `chainId` in your application's configuration for this local network matches the `chainId` used by Hardhat (default is `31337`).

2.  **Track Relevant Addresses:**
    When your application starts, ensure it tracks:
    *   `Account1`'s address (output by the `performTestTransfers.ts` script) to observe incoming native and ERC20 transfers.
    *   You can get this address from the script's output after running it.

3.  **Run Your Application:**
    Start your Wallet Watcher backend. It should now connect to your local Hardhat node and process the test transactions when you run the `performTestTransfers.ts` script.

This setup provides a repeatable way to generate test events for your EVM listeners. 