import { TokenService } from '../services/token/tokenService';
import logger from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';

interface TokenData {
    symbol: string;
    name: string;
    decimals: number;
    price: number;
    addresses: {
        ethereum?: string;
        polygon?: string;
        bsc?: string;
    };
}

async function uploadTokens() {
    try {
        // Read the tokens.json file
        const tokensPath = path.join(__dirname, '../data/tokens.json');
        const tokensFile = fs.readFileSync(tokensPath, 'utf8');
        const { tokens } = JSON.parse(tokensFile) as { tokens: TokenData[] };

        const tokenService = TokenService.getInstance();
        logger.info(`Starting token upload. Found ${tokens.length} tokens to process.`);

        // Upload each token
        for (const token of tokens) {
            try {
                await tokenService.addToken(token);
                logger.info(`Successfully uploaded token: ${token.symbol}`);
            } catch (error) {
                logger.error(`Failed to upload token ${token.symbol}:`, error);
            }
        }

        logger.info('Token upload completed.');
    } catch (error) {
        logger.error('Error during token upload:', error);
        process.exit(1);
    }
}

// Run the upload
uploadTokens().catch((error) => {
    logger.error('Unhandled error during token upload:', error);
    process.exit(1);
}); 