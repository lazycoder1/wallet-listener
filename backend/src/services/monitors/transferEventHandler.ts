import { prisma } from '../../prisma';
import logger from '../../config/logger';
import type { UnifiedTransferEvent, NativeTransferEvent, Erc20TransferEvent } from './chainMonitorManager';
import { WebClient } from '@slack/web-api';
import { NotificationService } from '../notification/notificationService';
import { TokenService } from '../token/tokenService';

export async function handleWebSocketEvent(event: UnifiedTransferEvent): Promise<void> {
    console.log('Received WebSocket event:', {
        type: event.type,
        chainId: event.chainId,
        data: event.data,
    });

    const { data, type, chainId } = event;
    const toAddress = data.to;
    // Ensure value is BigInt. Note: NativeTransferEvent and Erc20TransferEvent define 'value' as bigint already.
    // This explicit conversion is more of a safeguard if the source type was less strict.
    const value = typeof data.value === 'bigint' ? data.value : BigInt(String(data.value));

    let transactionHash: string;
    let tokenAddress: string | undefined;

    if (type === 'ERC20') {
        const erc20Data = data as Erc20TransferEvent;
        transactionHash = erc20Data.transactionHash;
        tokenAddress = erc20Data.tokenContract;
    } else if (type === 'NATIVE') {
        const nativeData = data as NativeTransferEvent;
        transactionHash = nativeData.hash;
    } else {
        console.error('Unknown event type, cannot extract transaction hash:', type);
        return; // Or handle as an error
    }

    if (!transactionHash) {
        console.error('Transaction hash is undefined, cannot proceed.');
        return;
    }

    try {
        const addressEntry = await prisma.address.findUnique({
            where: { address: toAddress.toLowerCase() }, // Ensure address is queried in lowercase
            include: {
                companyAddresses: {
                    where: { isActive: true },
                    include: {
                        company: {
                            include: {
                                slackConfiguration: true,
                            },
                        },
                    },
                },
            },
        });

        if (!addressEntry || addressEntry.companyAddresses.length === 0) {
            console.log(`No active company tracking address ${toAddress}`);
            return;
        }

        for (const companyAddress of addressEntry.companyAddresses) {
            const { company, threshold } = companyAddress;
            const { slackConfiguration } = company;

            if (!slackConfiguration || !slackConfiguration.isEnabled || !slackConfiguration.channelId) {
                console.log(`Slack configuration not found, disabled, or no channelId for company ${company.name} tracking address ${toAddress}`);
                continue;
            }

            const thresholdBigInt = BigInt(threshold.toString().split('.')[0]);

            if (value >= thresholdBigInt) {
                const tokenInfo = type === 'ERC20' ? `token ${tokenAddress}` : 'native currency';
                const message = `Alert for company ${company.name}: Received ${value.toString()} of ${tokenInfo} to ${toAddress} on chainId ${chainId}. Tx: ${transactionHash}`;
                // console.log(`TODO: Send Slack message to channel ${slackConfiguration.channelId}: ${message}`);

                // Placeholder for actual Slack sending:
                await sendSlackNotification(slackConfiguration.channelId, message);

                console.log(`Event for company ${company.name} (ID: ${company.id}) met threshold for address ${toAddress}. Channel ID: ${slackConfiguration.channelId}`);

            } else {
                console.log(`Transfer to ${toAddress} for company ${company.name} did not meet threshold ${threshold.toString()}. Amount: ${value.toString()}`);
            }
        }
    } catch (error) {
        console.error('Error processing WebSocket event:', error);
    }
}

// Example (you'll need to implement this based on your Slack bot setup):
async function sendSlackNotification(channelId: string, message: string): Promise<void> {
    try {
        const token = process.env.SLACK_BOT_TOKEN; // Ensure your bot token is in .env
        if (!token) {
            console.error('SLACK_BOT_TOKEN not found in environment variables.');
            return;
        }
        const slackClient = new WebClient(token);
        await slackClient.chat.postMessage({
            channel: channelId,
            text: message,
        });
        console.log(`Slack notification sent to ${channelId}`);
    } catch (error) {
        console.error(`Error sending Slack notification to ${channelId}:`, error);
    }
} 