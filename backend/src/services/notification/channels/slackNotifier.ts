import type { NotificationChannel, NotificationMessage } from '../notificationService';
import logger from '../../../config/logger';

export class SlackNotifier implements NotificationChannel {
    private webhookUrl: string;

    constructor(webhookUrl: string) {
        this.webhookUrl = webhookUrl;
    }

    public async send(message: NotificationMessage): Promise<void> {
        // TODO: Implement Slack notification
        logger.info('Slack notification not yet implemented', {
            message,
            webhookUrl: this.webhookUrl
        });
    }
} 