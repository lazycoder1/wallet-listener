import type { NotificationChannel, NotificationMessage } from '../notificationService';
import logger from '../../../config/logger';

export class ConsoleNotifier implements NotificationChannel {
    public async send(message: NotificationMessage): Promise<void> {
        // Format the message for console output
        const formattedMessage = this.formatMessage(message);

        // Log to console with appropriate level
        if (message.title.toLowerCase().includes('error')) {
            logger.error(formattedMessage);
        } else {
            logger.info(formattedMessage);
        }
    }

    private formatMessage(message: NotificationMessage): string {
        const timestamp = message.timestamp.toISOString();

        // Safely stringify data, converting BigInts to strings
        const dataStr = message.data
            ? `\nData: ${JSON.stringify(message.data, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value,
                2 // for pretty printing
            )}`
            : '';

        // Optionally, highlight accountName and accountManager if present
        let extraInfo = '';
        if (message.data) {
            if (message.data.accountName) {
                extraInfo += `\nAccount Name: ${message.data.accountName}`;
            }
            if (message.data.accountManager) {
                extraInfo += `\nAccount Manager: ${message.data.accountManager}`;
            }
        }

        return `[${timestamp}] ${message.title}\n${message.message}${extraInfo}${dataStr}`;
    }
} 