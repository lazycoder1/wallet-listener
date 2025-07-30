import type { FastifyRequest, FastifyReply } from 'fastify';
import authService from './auth.service';
import type { AuthenticatedUser } from './auth.types';

// Extend Fastify request interface to include user
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthenticatedUser;
    }
}

export async function authenticateToken(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    try {
        const authHeader = request.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            reply.status(401).send({
                error: 'Access token required',
                code: 'NO_TOKEN'
            });
            return;
        }

        const user = await authService.validateToken(token);

        if (!user) {
            reply.status(401).send({
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
            return;
        }

        // Attach user to request for use in route handlers
        request.user = user;
    } catch (error) {
        reply.status(401).send({
            error: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
}

export function requireAuth() {
    return authenticateToken;
}