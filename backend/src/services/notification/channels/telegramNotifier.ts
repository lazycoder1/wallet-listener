import type { NotificationChannel, NotificationMessage } from '../notificationService';
import logger from '../../../config/logger';

export class TelegramNotifier implements NotificationChannel {
    private botToken: string;
    private chatId: string;

    constructor(botToken: string, chatId: string) {
        this.botToken = botToken;
        this.chatId = chatId;
    }

    public async send(message: NotificationMessage): Promise<void> {
        // TODO: Implement Telegram notification
        logger.info('Telegram notification not yet implemented', {
            message,
            botToken: this.botToken,
            chatId: this.chatId
        });
    }
} 