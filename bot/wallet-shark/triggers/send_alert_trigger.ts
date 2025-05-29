import { Trigger } from "deno-slack-api/types.ts";
import { SendAlertWorkflow } from "../workflows/send_alert_workflow.ts";

/**
 * Trigger for the SendAlertWorkflow that can be invoked via a webhook.
 */
const sendAlertTrigger: Trigger<typeof SendAlertWorkflow.definition> = {
    type: "webhook",
    name: "Send Alert Webhook",
    description: "Webhook to trigger sending an alert message to a channel.",
    workflow: `#/workflows/${SendAlertWorkflow.definition.callback_id}`,
    inputs: {
        channel_id: {
            value: "{{data.channel_id}}", // Comes from the webhook payload
        },
        text: {
            value: "{{data.text}}", // Comes from the webhook payload
        },
        // If you added 'blocks' to the workflow input:
        // blocks: {
        //   value: "{{data.blocks}}",
        // }
    },
};

export default sendAlertTrigger; 