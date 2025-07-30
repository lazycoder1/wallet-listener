import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import authService from './auth.service';
import { authenticateToken } from './auth.middleware';
import type { LoginRequestBody, CreateUserBody } from './auth.types';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // POST /auth/login - User login
    fastify.post<{ Body: LoginRequestBody }>(
        '/login',
        async (request, reply) => {
            try {
                const { username, password } = request.body;

                if (!username || !password) {
                    reply.status(400).send({
                        error: 'Username and password are required'
                    });
                    return;
                }

                const loginResponse = await authService.login({ username, password });
                reply.send(loginResponse);
            } catch (error: any) {
                fastify.log.error(error);

                if (error.message === 'Invalid credentials') {
                    reply.status(401).send({ error: 'Invalid username or password' });
                } else {
                    reply.status(500).send({ error: 'Internal Server Error' });
                }
            }
        }
    );

    // POST /auth/logout - User logout
    fastify.post(
        '/logout',
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const authHeader = request.headers.authorization;
                const token = authHeader && authHeader.split(' ')[1];

                if (token) {
                    await authService.logout(token);
                }

                reply.send({ message: 'Logged out successfully' });
            } catch (error: any) {
                fastify.log.error(error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        }
    );

    // GET /auth/me - Get current user
    fastify.get(
        '/me',
        { preHandler: authenticateToken },
        async (request, reply) => {
            reply.send({ user: request.user });
        }
    );

    // POST /auth/register - Create new user (admin only for now)
    fastify.post<{ Body: CreateUserBody }>(
        '/register',
        { preHandler: authenticateToken }, // Require authentication to create users
        async (request, reply) => {
            try {
                const { username, email, password } = request.body;

                if (!username || !password) {
                    reply.status(400).send({
                        error: 'Username and password are required'
                    });
                    return;
                }

                if (password.length < 6) {
                    reply.status(400).send({
                        error: 'Password must be at least 6 characters long'
                    });
                    return;
                }

                const user = await authService.createUser({ username, email, password });
                reply.status(201).send({ user });
            } catch (error: any) {
                fastify.log.error(error);

                if (error.message.includes('already exists')) {
                    reply.status(409).send({ error: error.message });
                } else {
                    reply.status(500).send({ error: 'Internal Server Error' });
                }
            }
        }
    );

    // GET /auth/users - List all users (admin only)
    fastify.get(
        '/users',
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const users = await authService.getAllUsers();
                reply.send({ users });
            } catch (error: any) {
                fastify.log.error(error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        }
    );

    // POST /auth/cleanup - Cleanup expired sessions
    fastify.post(
        '/cleanup',
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const cleanedCount = await authService.cleanupExpiredSessions();
                reply.send({
                    message: 'Session cleanup completed',
                    cleanedSessions: cleanedCount
                });
            } catch (error: any) {
                fastify.log.error(error);
                reply.status(500).send({ error: 'Internal Server Error' });
            }
        }
    );
};

export default authRoutes;