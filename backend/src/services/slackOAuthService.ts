import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Attempting direct import
import axios from 'axios'; // Or use Bun's fetch or node-fetch
import crypto from 'crypto'; // For generating a secure random state
import logger from '../config/logger'; // Assuming you have a logger configured

// Placeholder for custom error handling - replace with your actual error module
class AppError extends Error {
    public httpCode: number;
    public description: string;
    public isOperational: boolean;
    public cause?: any;

    constructor(args: { httpCode: number; description: string; isOperational?: boolean; cause?: any }) {
        super(args.description);
        Object.setPrototypeOf(this, new.target.prototype);
        this.httpCode = args.httpCode;
        this.description = args.description;
        this.isOperational = args.isOperational === undefined ? true : args.isOperational;
        this.cause = args.cause;
        Error.captureStackTrace(this);
    }
}

enum HttpCode {
    OK = 200,
    CREATED = 201,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    INTERNAL_SERVER_ERROR = 500,
    SERVICE_UNAVAILABLE = 503,
}
// End placeholder for custom error handling

// Assuming prisma client is initialized and exported from a central place
// import prisma from '../lib/prisma'; 
const prisma = new PrismaClient(); // Or however you access your Prisma instance

// TODO: Implement token encryption/decryption using Node.js crypto or a library like 'jose'
// const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// async function encryptToken(token: string): Promise<string> {
//     if (!ENCRYPTION_KEY) {
//         logger.warn('ENCRYPTION_KEY not set. Storing Slack token in plaintext.');
//         return token;
//     }
//     // Implement encryption (e.g., using AES-256-GCM with Node's crypto module)
//     return token; // Placeholder
// }

// async function decryptToken(encryptedToken: string): Promise<string> {
//     if (!ENCRYPTION_KEY) {
//         return encryptedToken; // Assuming plaintext if no key
//     }
//     // Implement decryption
//     return encryptedToken; // Placeholder
// }

interface SlackOAuthV2AccessResponse {
    ok: boolean;
    app_id: string;
    authed_user?: { // Can be missing in some grant types, but expected for new installs
        id: string;
        scope?: string;
        access_token?: string;
        token_type?: string;
    };
    team?: { // Can be missing in some grant types
        id: string;
        name: string;
    };
    access_token: string; // This is the xoxb Bot token we need
    token_type: string; // Should be 'bot'
    scope?: string;      // Scopes granted to the bot token. Can also be in authed_user for user tokens.
    bot_user_id?: string; // Should be present for bot tokens
    [key: string]: any;
}

// --- State Management --- 
const OAUTH_STATE_EXPIRY_MINUTES = 15; // How long the state is valid

export async function generateAndStoreOAuthState(companyId: number): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_EXPIRY_MINUTES * 60 * 1000);

    try {
        await prisma.slackOAuthState.create({
            data: {
                state,
                companyId,
                expiresAt,
            },
        });
        logger.info(`Stored OAuth state for companyId: ${companyId}`);
        return state;
    } catch (dbError) {
        logger.error(`Database error storing OAuth state for companyId ${companyId}: ${dbError}`, { error: dbError });
        throw new AppError({
            httpCode: HttpCode.INTERNAL_SERVER_ERROR,
            description: 'Failed to prepare Slack authorization state.',
            cause: dbError
        });
    }
}

export async function verifyOAuthStateAndGetCompanyId(state: string): Promise<number | null> {
    if (!state) {
        logger.warn('OAuth callback state is missing.');
        return null;
    }
    try {
        const storedState = await prisma.slackOAuthState.findUnique({
            where: { state },
        });

        if (!storedState) {
            logger.warn(`OAuth callback state not found in store: ${state}`);
            return null;
        }

        // Delete the state as it's single-use
        await prisma.slackOAuthState.delete({ where: { state } });

        if (new Date() > storedState.expiresAt) {
            logger.warn(`OAuth callback state expired for companyId: ${storedState.companyId}, state: ${state}`);
            return null;
        }

        logger.info(`OAuth state verified for companyId: ${storedState.companyId}`);
        return storedState.companyId;
    } catch (dbError) {
        logger.error(`Database error verifying OAuth state ${state}: ${dbError}`, { error: dbError });
        // Do not throw critical error here, let the callback handle as invalid state
        return null;
    }
}

export async function exchangeCodeForToken(code: string): Promise<SlackOAuthV2AccessResponse> {
    const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI } = process.env;

    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET || !SLACK_REDIRECT_URI) {
        logger.error('Slack OAuth environment variables are not properly configured.');
        throw new AppError({
            httpCode: HttpCode.INTERNAL_SERVER_ERROR,
            description: 'Slack integration is not configured correctly on the server.',
            isOperational: false
        });
    }

    const slackTokenUrl = 'https://slack.com/api/oauth.v2.access';
    const params = new URLSearchParams();
    params.append('client_id', SLACK_CLIENT_ID);
    params.append('client_secret', SLACK_CLIENT_SECRET);
    params.append('code', code);
    params.append('redirect_uri', SLACK_REDIRECT_URI);

    try {
        const response = await axios.post<SlackOAuthV2AccessResponse>(slackTokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Check for presence of bot_user_id and team.id as they are crucial for our DB schema
        if (!response.data.ok || !response.data.access_token || response.data.token_type !== 'bot' || !response.data.bot_user_id || !response.data.team?.id) {
            logger.error(`Slack OAuth error or incomplete data: ${response.data.error || 'Key fields missing'}. Response: ${JSON.stringify(response.data)}`);
            throw new AppError({
                httpCode: HttpCode.BAD_REQUEST,
                description: `Slack OAuth error: ${response.data.error || 'Failed to authenticate with Slack or received incomplete data'}`
            });
        }
        logger.info(`Successfully exchanged OAuth code for token for team: ${response.data.team?.id}`);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            logger.error(`Axios HTTP error during Slack OAuth token exchange: ${error.message}. Response: ${JSON.stringify(error.response.data)}`);
            throw new AppError({
                httpCode: HttpCode.SERVICE_UNAVAILABLE,
                description: `Failed to communicate with Slack: ${error.response.data?.error || error.message}`
            });
        } else if (error instanceof AppError) {
            throw error; // Re-throw AppErrors directly
        } else {
            logger.error(`Unexpected error during Slack OAuth token exchange: ${error}`);
            throw new AppError({
                httpCode: HttpCode.INTERNAL_SERVER_ERROR,
                description: 'An unexpected error occurred while trying to communicate with Slack.',
                cause: error
            });
        }
    }
}

// Using 'any' for return type temporarily to bypass SlackConfiguration import issue
export async function saveOrUpdateSlackInstallation(
    oauthData: SlackOAuthV2AccessResponse,
    companyId: number
): Promise<Prisma.SlackConfigurationGetPayload<{ include: { company: false } }>> { // More specific return type
    const teamId = oauthData.team?.id;
    const teamName = oauthData.team?.name;
    const appId = oauthData.app_id;
    const botUserId = oauthData.bot_user_id;
    const accessToken = oauthData.access_token;
    const scopes = oauthData.scope;

    if (!teamId || !accessToken || !botUserId) {
        logger.error(`saveOrUpdateSlackInstallation: Missing critical information: ${JSON.stringify(oauthData)}`);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Incomplete data from Slack.' });
    }

    try {
        return await prisma.$transaction(async (tx) => {
            // Data to be set on the target SlackConfiguration record
            const commonUpdateData = {
                slackTeamName: teamName,
                accessToken: accessToken,
                botUserId: botUserId,
                scopes: scopes,
                slackAppId: appId,
                rawOAuthResponse: oauthData as any, // Consider a more specific type or JSON.stringify if needed
                installationStatus: 'linked' as const,
                isEnabled: true,
                lastError: null,
                updatedAt: new Date(), // Explicitly set updatedAt for updates
            };

            // 1. Find any existing configuration for the incoming teamId
            const existingConfigForTeam = await tx.slackConfiguration.findUnique({
                where: { slackTeamId: teamId },
            });

            // 2. Find any existing configuration for the current companyId
            // This is the record we ideally want to update or create if it doesn't exist.
            const existingConfigForCompany = await tx.slackConfiguration.findUnique({
                where: { companyId: companyId },
            });

            let finalInstallation: Prisma.SlackConfigurationGetPayload<{ include: { company: false } }>;

            if (existingConfigForCompany) {
                // Case 1: The company already has a SlackConfiguration record.
                // We need to update this record with the new teamId and OAuth data.

                if (existingConfigForTeam && existingConfigForTeam.id !== existingConfigForCompany.id) {
                    // The new teamId (from OAuth) is currently associated with a *different* SlackConfiguration record.
                    // This different record is now effectively an orphan (its companyId should be null or different).
                    // To maintain slackTeamId uniqueness, we must delete this orphaned record.
                    logger.info(`Deleting orphaned Slack config (ID: ${existingConfigForTeam.id}) for team ${teamId} before reassigning to company ${companyId}.`);
                    await tx.slackConfiguration.delete({
                        where: { id: existingConfigForTeam.id },
                    });
                }

                // Update the company's existing SlackConfiguration record.
                logger.info(`Updating existing Slack config (ID: ${existingConfigForCompany.id}) for company ${companyId} with new team ${teamId}.`);
                finalInstallation = await tx.slackConfiguration.update({
                    where: { id: existingConfigForCompany.id },
                    data: {
                        ...commonUpdateData,
                        slackTeamId: teamId, // Assign/update to the new teamId
                    },
                });
            } else {
                // Case 2: The company does NOT have an existing SlackConfiguration record.

                if (existingConfigForTeam) {
                    // A SlackConfiguration record for the new teamId already exists (it's an orphan).
                    // We can take over this record by updating its companyId and other details.
                    logger.info(`Taking over existing Slack config (ID: ${existingConfigForTeam.id}) for team ${teamId} and linking to new company ${companyId}.`);
                    finalInstallation = await tx.slackConfiguration.update({
                        where: { id: existingConfigForTeam.id }, // or where: { slackTeamId: teamId }
                        data: {
                            ...commonUpdateData,
                            companyId: companyId,   // Link to the current company
                            slackTeamId: teamId,    // Ensure teamId is set (should already be correct)
                        },
                    });
                } else {
                    // Case 3: No record for the company, and no pre-existing record for the teamId.
                    // Create a brand new SlackConfiguration record.
                    logger.info(`Creating new Slack config for company ${companyId} and team ${teamId}.`);
                    finalInstallation = await tx.slackConfiguration.create({
                        data: {
                            ...commonUpdateData,
                            companyId: companyId,
                            slackTeamId: teamId,
                        },
                    });
                }
            }
            logger.info(`Successfully saved/updated Slack config for company ${companyId}, team ${teamId}. Final ID: ${finalInstallation.id}`);
            return finalInstallation;
        });
    } catch (dbError: any) {
        logger.error(`DB transaction error for companyId ${companyId}, teamId ${teamId}: ${dbError.message}`, { stack: dbError.stack, code: dbError.code, meta: dbError.meta });
        // Removed the specific P2002 check here as the logic above should prevent it.
        // If it still occurs, it indicates a flaw in the transaction logic or an unexpected race condition.
        throw new AppError({
            httpCode: HttpCode.INTERNAL_SERVER_ERROR,
            description: 'Failed to save Slack integration details due to a database issue.',
            cause: dbError
        });
    }
}

// --- Other Slack Service Functions (Get Installation, Send Message etc.) ---

// ... existing code ... 