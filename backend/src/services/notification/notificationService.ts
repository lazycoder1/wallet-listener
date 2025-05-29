import { ConsoleNotifier } from './channels/consoleNotifier';
import { SlackNotifierChannel } from './channels/SlackNotifierChannel';
import logger from '../../config/logger';
import { BalanceService } from '../balance/balanceService';

export interface NotificationMessage {
    title: string;
    message: string;
    data?: Record<string, any>;
    timestamp: Date;
}

export interface NotificationChannel {
    send(message: NotificationMessage): Promise<void>;
}

interface DepositNotificationData {
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
    chainType: 'evm' | 'tron';
    blockNumber?: bigint | number;
    summaryMessage: string;
    [key: string]: any;
}

export class NotificationService {
    private static instance: NotificationService;
    private channels: NotificationChannel[] = [];
    private balanceService: BalanceService;

    private constructor() {
        this.addChannel(new ConsoleNotifier());
        this.addChannel(new SlackNotifierChannel());
        this.balanceService = BalanceService.getInstance();
    }

    public static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    public addChannel(channel: NotificationChannel): void {
        this.channels.push(channel);
        logger.info(`Added notification channel: ${channel.constructor.name}`);
    }

    public removeChannel(channel: NotificationChannel): void {
        this.channels = this.channels.filter(c => c !== channel);
        logger.info(`Removed notification channel: ${channel.constructor.name}`);
    }

    public async notify(message: NotificationMessage): Promise<void> {
        const promises = this.channels.map(channel =>
            channel.send(message).catch(error => {
                logger.error(`Failed to send notification via ${channel.constructor.name}:`, error);
            })
        );
        await Promise.all(promises);
    }

    public async notifyDeposit(
        recipientAddress: string,
        rawValue: string,
        formattedValue: string,
        tokenSymbol: string,
        tokenDecimals: number,
        tokenContractAddress: string | undefined,
        usdValue: number,
        transactionHash: string,
        senderAddress: string | undefined,
        blockNumber: bigint | number | undefined,
        depositContext: {
            chainId: number | string;
            chainName: string;
            chainType: 'evm' | 'tron';
            [key: string]: any;
        }
    ): Promise<void> {
        let totalBalanceMessage = "";
        let topTokensMessage = "";

        try {
            if (depositContext.chainType === 'tron') {
                const { totalUsdBalance, topTokens } = await this.balanceService.fetchTronScanTokenBalances(recipientAddress);
                totalBalanceMessage = `Wallet total Tron balance is $${totalUsdBalance.toFixed(2)}.`;
                if (topTokens.length > 0) {
                    topTokensMessage = " Top tokens: " + topTokens.map(t => `${parseFloat(t.balance) / Math.pow(10, t.tokenDecimal)} ${t.tokenAbbr || t.tokenName} ($${(parseFloat(t.amount)).toFixed(2)})`).join(', ');
                }
            } else { // EVM or other types
                const totalBalance = await this.balanceService.getTotalBalance(recipientAddress); // Existing EVM balance logic
                totalBalanceMessage = `Wallet total EVM balance is $${totalBalance.toFixed(2)}.`;
            }
        } catch (balanceError) {
            logger.error({ msg: "Error fetching balance in notifyDeposit", address: recipientAddress, error: balanceError });
            totalBalanceMessage = "Could not retrieve current balance.";
        }

        const summaryMsg = `Wallet ${recipientAddress} has a deposit of ${formattedValue} ${tokenSymbol} worth $${usdValue.toFixed(2)}. ${totalBalanceMessage}${topTokensMessage}`;

        const {
            chainName: ctxChainName,
            chainId: ctxChainId,
            chainType: ctxChainType,
            ...otherContextData
        } = depositContext;

        const notificationData: DepositNotificationData = {
            ...otherContextData,
            recipientAddress,
            rawValue,
            formattedValue,
            tokenSymbol,
            tokenDecimals,
            tokenContractAddress,
            usdValue,
            transactionHash,
            senderAddress,
            chainName: ctxChainName,
            chainId: ctxChainId,
            chainType: ctxChainType,
            blockNumber,
            summaryMessage: summaryMsg,
        };

        const message: NotificationMessage = {
            title: 'New Deposit Detected',
            message: summaryMsg,
            data: notificationData,
            timestamp: new Date()
        };

        await this.notify(message);
    }

    public async notifyTransfer(
        from: string,
        to: string,
        amount: string,
        token: string,
        txHash: string,
        chainId: number
    ): Promise<void> {
        const message: NotificationMessage = {
            title: 'New Transfer Detected',
            message: `Transfer of ${amount} ${token} from ${from} to ${to}`,
            data: {
                from,
                to,
                amount,
                token,
                txHash,
                chainId,
                timestamp: new Date()
            },
            timestamp: new Date()
        };

        await this.notify(message);
    }

    public async notifyPriceAlert(
        token: string,
        currentPrice: number,
        threshold: number,
        direction: 'above' | 'below'
    ): Promise<void> {
        const message: NotificationMessage = {
            title: 'Price Alert',
            message: `${token} price is ${direction} threshold: ${currentPrice} (threshold: ${threshold})`,
            data: {
                token,
                currentPrice,
                threshold,
                direction,
                timestamp: new Date()
            },
            timestamp: new Date()
        };

        await this.notify(message);
    }

    public async notifyError(
        error: Error,
        context: string,
        additionalData?: Record<string, any>
    ): Promise<void> {
        const message: NotificationMessage = {
            title: 'Error Alert',
            message: `Error in ${context}: ${error.message}`,
            data: {
                error: error.message,
                stack: error.stack,
                context,
                ...additionalData,
                timestamp: new Date()
            },
            timestamp: new Date()
        };

        await this.notify(message);
    }
} 