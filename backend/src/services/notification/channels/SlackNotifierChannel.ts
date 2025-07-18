import logger from '../../../config/logger';
import type { NotificationChannel, NotificationMessage } from '../notificationService';
import { prisma } from '../../../prisma';
import { WebClient } from '@slack/web-api';

interface SlackDepositMessageData {
    recipientAddress: string;
    rawValue: string;
    formattedValue: string;
    tokenSymbol: string;
    tokenDecimals: number;
    tokenContractAddress?: string;
    usdValue: number;
    transactionHash: string;
    senderAddress?: string;
    chainName: string;
    chainId: number | string;
    chainType: 'EVM' | 'TRON';
    blockNumber?: bigint | number;
    summaryMessage?: string;
    totalBalance?: string;
    [key: string]: any;
}

function getExplorerLink(chainName: string, txHash: string): string {
    const baseUrls: Record<string, string> = {
        Tron: "https://tronscan.org/#/transaction/",
        Ethereum: "https://etherscan.io/tx/",
        Polygon: "https://polygonscan.com/tx/",
        BNB: "https://bscscan.com/tx/",
    };
    return baseUrls[chainName] ? `${baseUrls[chainName]}${txHash}` : `#/tx/${txHash}`;
}

// Utility function to format numbers with comma separators
function formatNumberWithCommas(value: number | string): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return value.toString();

    // Format with comma separators for thousands
    return numValue.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

export class SlackNotifierChannel implements NotificationChannel {
    // Constructor and slackClient property removed

    async send(notification: NotificationMessage): Promise<void> {
        logger.debug({ msg: "[SlackNotifierChannel] Received notification in send() method", notification });

        const { title, data, timestamp } = notification;

        if (title !== "New Deposit Detected" && title !== "New Transfer Detected") {
            return;
        }

        if (!data || typeof data.recipientAddress !== 'string' || typeof data.transactionHash !== 'string') {
            logger.warn("[SlackNotifierChannel] Invalid or missing data for Slack notification", { data });
            return;
        }

        const depositData = data as SlackDepositMessageData;

        try {
            logger.debug("[SlackNotifierChannel] Full depositData for lookup:", depositData);

            // Find ALL companies that have this address configured (not just the first one)
            const companyAddresses = await prisma.companyAddress.findMany({
                where: {
                    address: {
                        address: depositData.recipientAddress,
                        chainType: depositData.chainType,
                    },
                    isActive: true, // Only active addresses
                },
                include: {
                    address: true,
                    company: {
                        include: {
                            slackConfiguration: true,
                        },
                    },
                },
            });

            if (!companyAddresses || companyAddresses.length === 0) {
                logger.warn(`[SlackNotifierChannel] No active company found for address: ${depositData.recipientAddress}`);
                return;
            }

            logger.info(`[SlackNotifierChannel] Found ${companyAddresses.length} company(ies) for address: ${depositData.recipientAddress}`);

            // Process each company that has this address configured
            for (const companyAddress of companyAddresses) {
                if (!companyAddress.company) {
                    logger.warn(`[SlackNotifierChannel] Company address record found but company is null for address: ${depositData.recipientAddress}`);
                    continue;
                }

                const slackConfig = companyAddress.company.slackConfiguration;

                if (!slackConfig || !slackConfig.isEnabled || !slackConfig.channelId || !slackConfig.accessToken) {
                    logger.info(`[SlackNotifierChannel] Slack notifications disabled or not configured for company: ${companyAddress.company.name} (Address: ${depositData.recipientAddress})`);
                    continue; // Skip this company but continue with others
                }

                const slackClient = new WebClient(slackConfig.accessToken);

                const usdValue = depositData.usdValue || 0;
                const alertThresholdNumber = companyAddress.threshold ? Number(companyAddress.threshold) : 0;

                if (usdValue < alertThresholdNumber) {
                    logger.info(`[SlackNotifierChannel] Deposit value $${usdValue.toFixed(2)} for ${depositData.recipientAddress} is below alert threshold $${alertThresholdNumber.toFixed(2)} for company ${companyAddress.company.name}. Notification not sent.`);
                    continue; // Skip this company but continue with others
                }

                const explorerLink = getExplorerLink(depositData.chainName, depositData.transactionHash);
                const senderDisplay = depositData.senderAddress ? ` from ${depositData.senderAddress}` : '';

                // Fetch accountManager from companyAddress
                const accountManager = (companyAddress as any).accountManager || 'N/A';

                // Format numbers with comma separators
                const formattedUsdValue = formatNumberWithCommas(usdValue);
                const formattedTokenAmount = formatNumberWithCommas(depositData.formattedValue);

                const messageBlocks = [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text:
                                `*New Deposit Detected*
*Wallet:* ${depositData.recipientAddress}
*Account Manager:* ${accountManager}
*Network:* ${depositData.chainName}
*Currency:* ${depositData.tokenSymbol}
*Amount:* ${formattedTokenAmount} ${depositData.tokenSymbol} ($${formattedUsdValue})
*Deposit From:* ${depositData.senderAddress || 'N/A'}`
                        }
                    },
                    {
                        type: "actions",
                        elements: [
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "View Transaction"
                                },
                                url: explorerLink,
                                style: "primary"
                            }
                        ]
                    },
                    {
                        type: "context",
                        elements: [
                            {
                                type: "plain_text",
                                text: `Tx: ${depositData.transactionHash}${senderDisplay} | Block: ${depositData.blockNumber || 'N/A'} | Timestamp: ${timestamp.toISOString()}`
                            }
                        ]
                    }
                ];

                logger.info(`[SlackNotifierChannel] Attempting to send Slack notification to channel ${slackConfig.channelId} for company ${companyAddress.company.name} (Address: ${depositData.recipientAddress})`);

                try {
                    await slackClient.chat.postMessage({
                        channel: slackConfig.channelId,
                        text: depositData.summaryMessage,
                        blocks: messageBlocks,
                        unfurl_links: false,
                        unfurl_media: false
                    });

                    logger.info(`[SlackNotifierChannel] Successfully sent Slack notification to company ${companyAddress.company.name} for ${depositData.recipientAddress}`);
                } catch (slackError) {
                    logger.error(`[SlackNotifierChannel] Error sending Slack notification to company ${companyAddress.company.name}:`, { error: slackError, address: depositData.recipientAddress });
                    // Continue with other companies even if one fails
                }
            }

        } catch (error) {
            logger.error("[SlackNotifierChannel] Error processing Slack notification:", { error, address: depositData.recipientAddress });
        }
    }
} 