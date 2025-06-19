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
            const companyAddress = await prisma.companyAddress.findFirst({
                where: {
                    address: {
                        address: depositData.recipientAddress,
                        chainType: depositData.chainType,
                    },
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

            if (!companyAddress || !companyAddress.company) {
                logger.warn(`[SlackNotifierChannel] No company found for address: ${depositData.recipientAddress}`);
                return;
            }

            const slackConfig = companyAddress.company.slackConfiguration;

            if (!slackConfig || !slackConfig.isEnabled || !slackConfig.channelId || !slackConfig.accessToken) {
                logger.info(`[SlackNotifierChannel] Slack notifications disabled or not configured for company: ${companyAddress.company.name} (Address: ${depositData.recipientAddress})`);
                return;
            }

            const slackClient = new WebClient(slackConfig.accessToken);

            const usdValue = depositData.usdValue || 0;
            const alertThresholdNumber = companyAddress.threshold ? Number(companyAddress.threshold) : 0;

            if (usdValue < alertThresholdNumber) {
                logger.info(`[SlackNotifierChannel] Deposit value $${usdValue.toFixed(2)} for ${depositData.recipientAddress} is below alert threshold $${alertThresholdNumber.toFixed(2)}. Notification not sent.`);
                return;
            }

            const explorerLink = getExplorerLink(depositData.chainName, depositData.transactionHash);
            const senderDisplay = depositData.senderAddress ? ` from ${depositData.senderAddress}` : '';

            // Fetch accountName and accountManager from companyAddress
            const accountName = companyAddress.accountName || 'N/A';
            const accountManager = companyAddress.accountManager || 'N/A';
            const totalBalance = depositData.totalBalance || 'N/A'; // If you want to show total balance, ensure it's in depositData

            const messageBlocks = [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text:
                            `*New Deposit Detected*
*Wallet:* ${depositData.recipientAddress}
*Account Name:* ${accountName}
*Account Manager:* ${accountManager}
*Currency:* ${depositData.tokenSymbol}
*Amount:* ${depositData.formattedValue} ${depositData.tokenSymbol} ($${usdValue.toFixed(2)})
*Total Balance:* ${totalBalance}`
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

            logger.info(`[SlackNotifierChannel] Attempting to send Slack notification to channel ${slackConfig.channelId} for address ${depositData.recipientAddress}`);

            await slackClient.chat.postMessage({
                channel: slackConfig.channelId,
                text: depositData.summaryMessage,
                blocks: messageBlocks,
                unfurl_links: false,
                unfurl_media: false
            });

            logger.info(`[SlackNotifierChannel] Successfully prepared Slack notification for ${depositData.recipientAddress} (actual sending is currently commented out).`);

        } catch (error) {
            logger.error("[SlackNotifierChannel] Error sending Slack notification:", { error, address: depositData.recipientAddress });
        }
    }
} 