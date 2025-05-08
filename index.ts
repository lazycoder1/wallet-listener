import { createPublicClient, webSocket } from "viem";
import type { PublicClient } from "viem";
import { base } from "viem/chains";

// Create a public client using WebSocket transport
const client: any = createPublicClient({
    chain: base,
    transport: webSocket("wss://base-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_ID),
});

// Define the parameters for the subscription
interface MinedTransactionParams {
    addresses: {
        to?: string;
        from?: string;
    }[];
    includeRemoved: boolean;
    hashesOnly: boolean;
}

// Define the structure of a transaction for logging
interface TransactionData {
    hash: string;
    from: string;
    to: string | null;
    value: bigint;
    // Potentially other fields like gas, input, etc.
}

// Function to subscribe to mined transactions
async function subscribeToMinedTransactions(): Promise<void> {
    try {
        const filterParams: MinedTransactionParams = {
            addresses: [
                {
                    to: "0xD50a6bF340242c4a555618aABaa31765432e8F5a",
                },
                {
                    from: "0xD50a6bF340242c4a555618aABaa31765432e8F5a",
                }
            ],
            includeRemoved: false,
            hashesOnly: false, // Changed to false to get full transaction objects
        };

        console.log("Attempting to subscribe to alchemy_minedTransactions with params:", filterParams);

        // Subscribe using client.transport.subscribe for custom subscriptions
        const unsubscribe = await client.transport.subscribe({
            params: ['alchemy_minedTransactions', filterParams],
            onData: (data: any) => { // data is the full subscription message
                // console.log("Raw data received from subscription:", JSON.stringify(data, null, 2));

                if (data && data.result && data.result.transaction) {
                    const transactionDetails = data.result.transaction;

                    // Construct our TransactionData object
                    const tx: TransactionData = {
                        hash: transactionDetails.hash,
                        from: transactionDetails.from,
                        to: transactionDetails.to,
                        value: BigInt(transactionDetails.value) // Convert hex string value to BigInt
                    };

                    console.log("--- New Mined Transaction Received ---");
                    console.log(`  Hash: ${tx.hash}`);
                    console.log(`  From: ${tx.from}`);
                    console.log(`  To: ${tx.to}`);
                    console.log(`  Value: ${tx.value !== undefined ? tx.value.toString() + ' wei' : 'N/A'}`);
                    // To make value more readable, you might convert it from wei to Ether:
                    // import { formatEther } from "viem";
                    // console.log(`  Value: ${formatEther(tx.value)} ETH`);
                } else {
                    console.log("Received data does not contain expected transaction details.", data);
                }
            },
            onError: (error: Error) => {
                console.error("Subscription error (alchemy_minedTransactions):", error);
            }
        });

        console.log("Successfully subscribed to alchemy_minedTransactions. Listening for transactions...");
        // The `unsubscribe` function can be called if you need to stop listening.
        // e.g., process.on('SIGINT', () => { unsubscribe(); console.log("Unsubscribed."); process.exit(0); });

    } catch (error) {
        console.error("Error setting up subscription to alchemy_minedTransactions:", error);
    }
}

// Start the subscription
subscribeToMinedTransactions();