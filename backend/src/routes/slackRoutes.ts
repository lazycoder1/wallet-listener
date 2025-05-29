import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
    generateAndStoreOAuthState,
    verifyOAuthStateAndGetCompanyId,
    exchangeCodeForToken,
    saveOrUpdateSlackInstallation
} from '../services/slackOAuthService';
import logger from '../config/logger'; // Assuming you have a logger

// Assuming placeholder AppError/HttpCode are used in service or replaced by actuals

interface GenerateInstallUrlQuery {
    companyId: number;
}

interface SlackOAuthCallbackQuery {
    code?: string;
    error?: string;
    state?: string;
}

async function slackRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Endpoint to generate the Slack installation URL for a specific company
    fastify.post('/generate-install-url',
        {
            schema: {
                body: { // Assuming companyId comes in the body for a POST
                    type: 'object',
                    required: ['companyId'],
                    properties: {
                        companyId: { type: 'number' }
                    }
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            installUrl: { type: 'string' },
                            message: { type: 'string' }
                        }
                    },
                    // Define error responses based on your global error handler or AppError
                }
            }
        },
        async (request: FastifyRequest<{ Body: GenerateInstallUrlQuery }>, reply: FastifyReply) => {
            const { companyId } = request.body;
            const { SLACK_CLIENT_ID, SLACK_REDIRECT_URI } = process.env;
            // SIMPLIFIED scope for testing
            const scopes = 'chat:write';

            if (!SLACK_CLIENT_ID || !SLACK_REDIRECT_URI) {
                logger.error('Slack client ID or redirect URI not configured for generate-install-url');
                // Consider throwing your AppError here if you have it configured
                reply.code(500).send({ success: false, error: { code: 'CONFIG_ERROR', message: 'Slack integration not configured on server.' } });
                return;
            }

            try {
                const state = await generateAndStoreOAuthState(companyId);
                const params = new URLSearchParams({
                    client_id: SLACK_CLIENT_ID,
                    scope: scopes,
                    redirect_uri: SLACK_REDIRECT_URI,
                    state: state,
                });
                const installUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

                logger.info(`Generated Slack install URL for companyId: ${companyId}`);
                return reply.send({
                    success: true,
                    installUrl: installUrl,
                    message: 'Slack installation link generated successfully.'
                });
            } catch (err: any) {
                logger.error(`Error generating Slack install URL for companyId ${companyId}: ${err.message || err}`, { errorDetail: err });
                reply.code(err.httpCode || 500).send({
                    success: false,
                    error: { code: 'URL_GENERATION_FAILED', message: err.description || err.message || 'Failed to generate install link.' }
                });
            }
        }
    );

    // Existing OAuth callback endpoint - now with state verification
    fastify.get('/oauth/callback',
        {
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        code: { type: 'string' },
                        error: { type: 'string' },
                        state: { type: 'string' }
                    }
                }
            }
        },
        async (request: FastifyRequest<{ Querystring: SlackOAuthCallbackQuery }>, reply: FastifyReply) => {
            const { code, error, state } = request.query;
            const SLACK_INSTALL_SUCCESS_URL = process.env.SLACK_INSTALL_SUCCESS_URL || '/';
            const SLACK_INSTALL_FAILURE_URL = process.env.SLACK_INSTALL_FAILURE_URL || '/';

            let failureRedirectUrl = new URL(SLACK_INSTALL_FAILURE_URL);

            if (error) {
                logger.error(`Slack OAuth callback error: ${error}. State: ${state}`);
                failureRedirectUrl.searchParams.set('error', 'oauth_denied');
                failureRedirectUrl.searchParams.set('description', error);
                return reply.redirect(failureRedirectUrl.toString());
            }

            if (!code || !state) { // State is now mandatory
                logger.error(`Slack OAuth callback missing code or state. Code: ${code}, State: ${state}`);
                failureRedirectUrl.searchParams.set('error', 'missing_params');
                failureRedirectUrl.searchParams.set('description', 'Missing required code or state from Slack.');
                return reply.redirect(failureRedirectUrl.toString());
            }

            const companyId = await verifyOAuthStateAndGetCompanyId(state);
            if (!companyId) {
                logger.error(`Invalid or expired state received in Slack OAuth callback: ${state}`);
                failureRedirectUrl.searchParams.set('error', 'invalid_state');
                failureRedirectUrl.searchParams.set('description', 'Invalid or expired authorization state.');
                return reply.redirect(failureRedirectUrl.toString());
            }

            try {
                logger.info(`Received Slack OAuth callback with valid state for companyId ${companyId}. Exchanging code.`);
                const oauthResponseData = await exchangeCodeForToken(code);
                // Pass the verified companyId to link the installation
                await saveOrUpdateSlackInstallation(oauthResponseData, companyId);

                logger.info(`Slack installation successful for team: ${oauthResponseData.team?.id}, linked to companyId: ${companyId}.`);
                // Optionally add companyId or teamId to success redirect for frontend context
                const successRedirectUrl = new URL(SLACK_INSTALL_SUCCESS_URL);
                successRedirectUrl.searchParams.set('install_status', 'success');
                successRedirectUrl.searchParams.set('team_id', oauthResponseData.team?.id || '');
                return reply.redirect(successRedirectUrl.toString());
            } catch (err: any) {
                logger.error(`Error processing Slack OAuth callback for companyId ${companyId}: ${err.message || err}`, { errorDetail: err });
                failureRedirectUrl.searchParams.set('error', 'processing_failure');
                failureRedirectUrl.searchParams.set('description', err.description || err.message || 'Internal error during installation.');
                return reply.redirect(failureRedirectUrl.toString());
            }
        }
    );
}

export default slackRoutes; 