# Slack Bot Integration and Notification Setup Guide

This guide provides step-by-step instructions to create a Slack bot and configure it to send notifications from the Wallet Tracker application.

## 1. Create a New Slack App

1.  **Go to the Slack API page:** Navigate to [https://api.slack.com/apps](https://api.slack.com/apps).
2.  **Click "Create New App":**
    *   Choose "From scratch".
    *   **App Name:** Give your app a descriptive name (e.g., "Wallet Tracker Notifications").
    *   **Workspace:** Select the Slack workspace where you want to install the app.
    *   Click "Create App".

## 2. Configure Permissions and Scopes

Once your app is created, you'll be taken to its settings page.

1.  **Navigate to "OAuth & Permissions":** In the sidebar under "Features".
2.  **Scroll down to "Scopes":**
    *   **Bot Token Scopes:** Click "Add an OAuth Scope" and add the following:
        *   `chat:write`: To send messages.
        *   `incoming-webhook`: To use incoming webhooks.
    *   You might add other scopes later if needed (e.g., `users:read.email` if you need to map users).

3.  **Install App to Workspace:**
    *   Scroll back to the top of the "OAuth & Permissions" page.
    *   Click "Install to Workspace".
    *   Review the permissions and click "Allow".

## 3. Obtain Bot User OAuth Token

1.  After installation, you'll be redirected back to the "OAuth & Permissions" page.
2.  **Bot User OAuth Token:** Copy this token (it starts with `xoxb-`). This token is sensitive and should be stored securely (e.g., in an environment variable like `SLACK_BOT_TOKEN`). You will use this token to authenticate your bot when sending messages via the Slack API.

## 4. Set Up Incoming Webhooks (Alternative to Bot Token for Simple Notifications)

Incoming Webhooks allow you to post messages from external sources into Slack. They are a simpler way to send messages if you don't need the full interactivity of a bot token.

1.  **Navigate to "Incoming Webhooks":** In the sidebar under "Features".
2.  **Activate Incoming Webhooks:** Toggle the switch to "On".
3.  **Add New Webhook to Workspace:** Click the "Add New Webhook to Workspace" button at the bottom.
    *   Select the channel where messages should be posted.
    *   Click "Allow".
4.  **Copy Webhook URL:** Slack will generate a Webhook URL. Copy this URL. It's also sensitive and should be stored securely (e.g., in an environment variable like `SLACK_WEBHOOK_URL`).

**Choosing between Bot Token and Webhook:**
*   **Bot Token (`chat:write`):** More versatile, allows for richer interactions, sending messages to multiple channels, and using more Slack API methods. Generally preferred for application integrations.
*   **Incoming Webhook URL:** Simpler for basic notifications to a fixed channel.

For this application, using the **Bot Token** is recommended for flexibility, especially with configurable thresholds per company potentially leading to different notification channels or message formats.

## 5. Integrating with Your Node.js Application

You'll need a Slack client library for Node.js. The official `@slack/web-api` is a good choice.

1.  **Install the Slack SDK:**
    ```bash
    npm install @slack/web-api
    # or
    yarn add @slack/web-api
    ```

2.  **Store your Bot Token:**
    Set your `SLACK_BOT_TOKEN` as an environment variable in your project (e.g., in a `.env` file).

3.  **Example Code to Send a Message (using Bot Token):**

    Create a service or utility function in your backend (e.g., `services/notification/slackNotifier.ts`):

    ```typescript
    import { WebClient } from '@slack/web-api';

    // Initialize the Slack Web API client with your bot token
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const web = new WebClient(slackToken);

    interface SlackMessagePayload {
        channelId: string; // The ID of the channel to send the message to
        text: string;      // The main text of the message
        // You can add more fields for richer messages (blocks, attachments, etc.)
    }

    export async function sendSlackMessage(payload: SlackMessagePayload): Promise<void> {
        if (!slackToken) {
            console.error('SLACK_BOT_TOKEN is not set. Cannot send Slack message.');
            return;
        }

        try {
            const result = await web.chat.postMessage({
                channel: payload.channelId,
                text: payload.text,
                // Example: Using blocks for richer formatting
                // blocks: [
                //     {
                //         "type": "section",
                //         "text": {
                //             "type": "mrkdwn",
                //             "text": payload.text
                //         }
                //     }
                // ]
            });
            console.log(`Message sent successfully to ${payload.channelId}: `, result.ts);
        } catch (error) {
            console.error('Error sending Slack message:', error);
        }
    }

    // Example usage:
    // import { sendSlackMessage } from './slackNotifier';
    //
    // sendSlackMessage({
    //     channelId: 'C1234567890', // Replace with actual channel ID
    //     text: 'Hello from Wallet Tracker! A new transaction was detected.'
    // });
    ```

4.  **Finding Channel IDs:**
    *   To send a message to a specific channel, you need its Channel ID (e.g., `C1234567890`), not its name (e.g., `#general`).
    *   **Easiest way:** Open Slack in your web browser, navigate to the channel, and the Channel ID is part of the URL (e.g., `https://app.slack.com/client/T01234567/C1234567890`).
    *   Alternatively, you can use the `conversations.list` API method to fetch a list of channels and their IDs.

## 6. Application Logic for Notifications

In your `wsEventHandler.ts` (or a similar service that processes `UnifiedTransferEvent`):

1.  **Determine Target Channel:** Based on the event (e.g., company associated with the address), determine the target Slack channel ID. This might involve looking up configuration stored in your database.
2.  **Format Message:** Create a user-friendly message string from the `UnifiedTransferEvent` data.
3.  **Call `sendSlackMessage`:** Use the function created in step 5.

**Example snippet for `wsEventHandler.ts`:**

```typescript
// Presumed to be in wsEventHandler.ts or a similar processing file
// import { UnifiedTransferEvent } from './path/to/your/types'; // Adjust path
// import { sendSlackMessage } from './path/to/slackNotifier'; // Adjust path
// import { getSlackChannelForCompany } from './path/to/companyConfigService'; // Example service

export async function handleUnifiedEventForSlack(event: UnifiedTransferEvent) {
    // 1. Determine target channel (this is a simplified example)
    // You'll need to implement logic to get company and then channel
    // const companyId = getCompanyFromAddress(event.to); // Pseudocode
    // const channelId = await getSlackChannelForCompany(companyId); // Pseudocode e.g. 'C123456789'

    const channelId = 'YOUR_DEFAULT_SLACK_CHANNEL_ID'; // Replace with a real default or dynamically get it

    if (!channelId) {
        console.warn(`No Slack channel configured for event:`, event);
        return;
    }

    // 2. Format message
    let messageText = '';
    if (event.type === 'NATIVE') {
        messageText = `🔔 *Native Transfer Alert!* 🔔\nTo: \`${event.to}\`\nAmount: ${event.value} ${event.asset}\nChain: ${event.chain}`;
    } else if (event.type === 'ERC20') {
        messageText = `🔔 *Token Transfer Alert!* 🔔\nTo: \`${event.to}\`\nAmount: ${event.value} ${event.asset}\nToken: ${event.tokenSymbol} (${event.tokenAddress})\nChain: ${event.chain}`;
    } else {
        messageText = 'A new transaction was detected.'; // Fallback
    }
    
    // Add transaction hash if available
    if (event.txHash) {
        messageText += `\nTransaction Hash: \`${event.txHash}\``;
    }


    // 3. Send the message
    await sendSlackMessage({
        channelId: channelId,
        text: messageText,
    });
}
```

## 7. Configuration Management

*   **Slack Bot Token:** Store securely as an environment variable.
*   **Channel IDs:**
    *   For MVP, you might hardcode a default channel ID.
    *   For configurable thresholds/alerts per company, you'll need to store Slack channel IDs (or webhook URLs if you chose that route) associated with each company in your PostgreSQL database. The admin panel should allow managing these configurations.

## Next Steps in Your Application

1.  **Implement Configuration Storage:** Add fields to your `Company` model (or a related model) in Prisma to store `slackChannelId`.
2.  **Admin Panel Integration:** Allow users to set/update the Slack channel ID for each company via the admin panel.
3.  **Update `wsEventHandler.ts`:**
    *   Fetch the correct `slackChannelId` based on the company associated with the incoming transfer.
    *   Use the `sendSlackMessage` utility to send notifications.
4.  **Error Handling:** Add robust error handling around Slack API calls (e.g., retries, logging).
5.  **Testing:** Thoroughly test the notification flow.

This guide provides a comprehensive starting point. You'll adapt and expand upon these steps as you integrate Slack notifications deeply into your application's logic and user-configurable settings. 