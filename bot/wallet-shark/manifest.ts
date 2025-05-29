import { Manifest } from "deno-slack-sdk/mod.ts";
import { WelcomeMessageDatastore } from "./datastores/messages.ts";
import { MessageSetupWorkflow } from "./workflows/create_welcome_message.ts";
import { SendWelcomeMessageWorkflow } from "./workflows/send_welcome_message.ts";
import { SendAlertWorkflow } from "./workflows/send_alert_workflow.ts";
import { SendAlertFunctionDefinition } from "./functions/send_alert_function.ts";

export default Manifest({
  name: "wallet-shark",
  description:
    "Sets up automated welcome messages for channels. Can also receive and post alerts to channels from an external server.",
  icon: "assets/default_new_app_icon.png",
  workflows: [
    MessageSetupWorkflow,
    SendWelcomeMessageWorkflow,
    SendAlertWorkflow,
  ],
  outgoingDomains: [],
  datastores: [WelcomeMessageDatastore],
  botScopes: [
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "channels:read",
    "triggers:write",
    "triggers:read",
  ],
  functions: [SendAlertFunctionDefinition],
});
