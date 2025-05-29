import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

/**
 * Function definition for sending an alert message.
 */
export const SendAlertFunctionDefinition = DefineFunction({
    callback_id: "send_alert_function",
    title: "Send Alert",
    description: "Sends an alert message to a specified channel.",
    source_file: "functions/send_alert_function.ts",
    input_parameters: {
        properties: {
            channel_id: {
                type: Schema.slack.types.channel_id,
                description: "Channel to send the alert to",
            },
            text: {
                type: Schema.types.string,
                description: "The alert message text",
            },
            // Optional: Add more parameters like message blocks for richer formatting
            // blocks: {
            //   type: Schema.types.array,
            //   items: { type: Schema.slack.types.blocks },
            //   description: "Richly formatted message blocks (optional)",
            // }
        },
        required: ["channel_id", "text"],
    },
    output_parameters: {
        properties: {
            message_ts: {
                type: Schema.types.string,
                description: "Timestamp of the sent message",
            },
        },
        required: ["message_ts"],
    },
});

export default SlackFunction(
    SendAlertFunctionDefinition,
    async ({ inputs, client }) => {
        const { channel_id, text } = inputs;

        try {
            const response = await client.chat.postMessage({
                channel: channel_id,
                text: text,
                // To use blocks:
                // blocks: inputs.blocks ? inputs.blocks : undefined,
            });

            if (!response.ok) {
                return { error: `Failed to send message: ${response.error}` };
            }

            return { outputs: { message_ts: response.ts } };
        } catch (error) {
            console.error("Error in send_alert_function:", error);
            return { error: `Error sending message: ${error.message}` };
        }
    },
); 