# Required Services and API Keys

This document outlines the services your client will need to register for and the API keys that need to be generated to ensure full functionality of the application.

## Services and API Key Requirements

Below is a list of services that require registration and API key generation:

1.  **Alchemy**
    *   **Purpose:** EVM (Ethereum Virtual Machine) compatible blockchain transaction monitoring. This includes networks like Ethereum, Polygon, Arbitrum, etc.
    *   **Action Required:** Register for an Alchemy account and create an API key.
    *   **Website:** [https://www.alchemy.com/](https://www.alchemy.com/)

2.  **Trongrid**
    *   **Purpose:** TRON native (TRX) and TRC20 token transaction monitoring.
    *   **Action Required:** Register for a Trongrid account and obtain an API key.
    *   **Website:** [https://www.trongrid.io/](https://www.trongrid.io/)

3.  **Tronscan**
    *   **Purpose:** Retrieval of TRON account balances.
    *   **Action Required:** Register for a Tronscan account and generate an API key.
    *   **Website:** [https://tronscan.org/](https://tronscan.org/)
        *   *Note:* While Trongrid is the primary service for TRON transactions, Tronscan might offer specific API endpoints for balance checks that are preferred or more reliable.

4.  **Amazon Web Services (AWS)**
    *   **Purpose:** Website hosting and potentially other cloud services (e.g., databases, serverless functions).
    *   **Action Required:** Create an AWS account. Specific services to be used (e.g., S3 for static hosting, EC2 for servers, Amplify for web apps) will determine further setup, but general account registration is the first step. API keys (Access Key ID and Secret Access Key) will be needed for programmatic access if CI/CD pipelines or other automated deployment/management scripts are used.
    *   **Website:** [https://aws.amazon.com/](https://aws.amazon.com/)

5.  **Slack API**
    *   **Purpose:** Setting up a production bot for notifications or alerts.
    *   **Action Required:**
        1.  Go to [https://api.slack.com/](https://api.slack.com/).
        2.  Create a new Slack App within your desired Slack workspace.
        3.  Configure the necessary permissions (scopes) for the bot (e.g., `chat:write` to send messages).
        4.  Install the app to your workspace and obtain the Bot User OAuth Token (usually starts with `xoxb-`).
    *   **Website:** [https://api.slack.com/](https://api.slack.com/)

## General Instructions for API Keys

*   **Security:** Treat all API keys as sensitive information. Do not embed them directly in client-side code or commit them to version control. Use environment variables or secure secret management services.
*   **Permissions/Scopes:** When generating API keys, grant only the minimum necessary permissions required for the application's functionality.
*   **Rate Limits:** Be aware of the rate limits associated with each API key and service to avoid disruptions.

Please ensure these accounts are set up and the respective API keys are securely stored and made available to the development team as needed. 