import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// It's highly recommended to store this URL in an environment variable
const SLACK_BOT_WEBHOOK_URL = process.env.SLACK_ALERT_WEBHOOK_URL || 'YOUR_DENO_BOT_WEBHOOK_URL_HERE'; // Fallback for safety, replace or set env var

interface SendSlackAlertArgs {
    channelId: string;
    messageText: string;
    // Potentially add more structured data for Slack blocks later if needed
    // blocks?: any[]; 
}

interface SlackWebhookResponse {
    ok: boolean;
    error?: string;
    // Add any other fields you expect from the Slack webhook response
}

/**
 * Sends an alert message to the configured Slack bot webhook.
 * This webhook is expected to be a Deno Slack bot trigger that accepts channel_id and text.
 */
export async function sendSlackAlert({
    channelId,
    messageText,
}: SendSlackAlertArgs): Promise<boolean> {
    if (SLACK_BOT_WEBHOOK_URL === 'YOUR_DENO_BOT_WEBHOOK_URL_HERE') {
        console.warn('SLACK_ALERT_WEBHOOK_URL is not configured. Please set it in your environment variables.');
        return false;
    }

    if (!channelId) {
        console.warn('No Slack channelId provided for the alert. Skipping notification.');
        return false;
    }

    const payload = {
        channel_id: channelId,
        text: messageText,
        // To send blocks: blocks: blocks
    };

    try {
        const response = await fetch(SLACK_BOT_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const responseBody = await response.text();
            console.error(
                `Error sending Slack alert to channel ${channelId}: ${response.status} ${response.statusText}`,
                `Response: ${responseBody}`
            );
            return false;
        }

        const responseJson = await response.json() as SlackWebhookResponse;
        if (responseJson.ok) {
            console.log(`Slack alert successfully sent to channel ${channelId}.`);
            return true;
        } else {
            console.error(`Slack API reported an error for channel ${channelId}:`, responseJson.error || responseJson);
            return false;
        }

    } catch (error) {
        console.error(`Failed to send Slack alert to channel ${channelId}:`, error);
        return false;
    }
}

// Example of how you might format a message (to be used in wsEventHandler.ts)
// This is just a placeholder, you'll integrate with UnifiedTransferEvent
interface ExampleEventData {
    type: 'NATIVE' | 'ERC20';
    to: string;
    value: string | number;
    asset: string;
    chain: string;
    tokenSymbol?: string;
    tokenAddress?: string;
    txHash?: string;
}

export function formatEventForSlack(event: ExampleEventData): string {
    let messageText = '';
    if (event.type === 'NATIVE') {
        messageText = `🔔 *Native Transfer Alert!* 🔔\nTo: \`${event.to}\`\nAmount: ${event.value} ${event.asset}\nChain: ${event.chain}`;
    } else if (event.type === 'ERC20') {
        messageText = `🔔 *Token Transfer Alert!* 🔔\nTo: \`${event.to}\`\nAmount: ${event.value} ${event.asset}\nToken: ${event.tokenSymbol} (${event.tokenAddress})\nChain: ${event.chain}`;
    } else {
        messageText = 'A new transaction was detected.'; // Fallback
    }

    if (event.txHash) {
        messageText += `\nTransaction Hash: \`${event.txHash}\``;
    }
    return messageText;
} 