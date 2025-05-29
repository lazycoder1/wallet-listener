import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SendAlertFunctionDefinition } from "../functions/send_alert_function.ts";

/**
 * Workflow definition for sending an alert.
 * This workflow can be triggered by an external webhook.
 */
export const SendAlertWorkflow = DefineWorkflow({
    callback_id: "send_alert_workflow",
    title: "Send Alert Workflow",
    description: "Receives alert data and sends it to a specified channel.",
    input_parameters: {
        properties: {
            channel_id: {
                type: Schema.slack.types.channel_id,
                description: "The Slack Channel ID to send the alert to",
            },
            text: {
                type: Schema.types.string,
                description: "The alert message text",
            },
            // Optional: Add if you want to support blocks from the webhook
            // blocks: {
            //   type: Schema.types.array,
            //   items: { type: Schema.slack.types.blocks },
            //   description: "Richly formatted message blocks (optional)",
            // }
        },
        required: ["channel_id", "text"],
    },
});

// Step 1: Use the SendAlertFunction
SendAlertWorkflow.addStep(SendAlertFunctionDefinition, {
    channel_id: SendAlertWorkflow.inputs.channel_id,
    text: SendAlertWorkflow.inputs.text,
    // To pass blocks through:
    // blocks: SendAlertWorkflow.inputs.blocks,
});

export default SendAlertWorkflow; 