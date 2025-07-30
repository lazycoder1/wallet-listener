import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma';
import type { CreateUserBody, LoginRequestBody, LoginResponse, AuthenticatedUser, TokenPayload } from './auth.types';
import logger from '../../config/logger';

class AuthService {
    private readonly JWT_SECRET: string;
    private readonly JWT_EXPIRES_IN = '24h';
    private readonly SALT_ROUNDS = 12;

    constructor() {
        this.JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
        if (!process.env.JWT_SECRET) {
            logger.warn('JWT_SECRET not set in environment variables. Using default (not secure for production).');
        }
    }

    async createUser(data: CreateUserBody): Promise<AuthenticatedUser> {
        const { username, email, password } = data;

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    ...(email ? [{ email }] : [])
                ]
            }
        });

        if (existingUser) {
            throw new Error('User with this username or email already exists');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                username,
                email,
                passwordHash
            },
            select: {
                id: true,
                username: true,
                email: true,
                isActive: true
            }
        });

        logger.info(`User created: ${username}`);
        return user;
    }

    async login(data: LoginRequestBody): Promise<LoginResponse> {
        const { username, password } = data;

        // Find user
        const user = await prisma.user.findUnique({
            where: { username },
            select: {
                id: true,
                username: true,
                email: true,
                passwordHash: true,
                isActive: true,
                lastLoginAt: true
            }
        });

        if (!user || !user.isActive) {
            throw new Error('Invalid credentials');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new Error('Invalid credentials');
        }

        // Create session
        const expiresAt = new Date();
        expiresAt.setTime(expiresAt.getTime() + (24 * 60 * 60 * 1000)); // 24 hours

        const session = await prisma.session.create({
            data: {
                userId: user.id,
                token: '', // Will be set after JWT generation
                expiresAt
            }
        });

        // Generate JWT token
        const tokenPayload: TokenPayload = {
            userId: user.id,
            username: user.username,
            sessionId: session.id
        };

        const token = jwt.sign(tokenPayload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRES_IN
        });

        // Update session with token
        await prisma.session.update({
            where: { id: session.id },
            data: { token }
        });

        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });

        logger.info(`User logged in: ${username}`);

        return {
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                lastLoginAt: user.lastLoginAt
            },
            expiresAt
        };
    }

    async logout(token: string): Promise<void> {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;

            await prisma.session.delete({
                where: {
                    id: decoded.sessionId,
                    token: token
                }
            });

            logger.info(`User logged out: ${decoded.username}`);
        } catch (error) {
            // Token might be invalid or session already deleted
            logger.warn('Logout attempt with invalid token');
        }
    }

    async validateToken(token: string): Promise<AuthenticatedUser | null> {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;

            // Check if session exists and is valid
            const session = await prisma.session.findUnique({
                where: {
                    id: decoded.sessionId,
                    token: token
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            isActive: true
                        }
                    }
                }
            });

            if (!session || session.expiresAt < new Date() || !session.user.isActive) {
                return null;
            }

            return session.user;
        } catch (error) {
            return null;
        }
    }

    async cleanupExpiredSessions(): Promise<number> {
        const result = await prisma.session.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date()
                }
            }
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} expired sessions`);
        }

        return result.count;
    }

    async getAllUsers(): Promise<AuthenticatedUser[]> {
        return await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                isActive: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
    }

    async getUserById(id: number): Promise<AuthenticatedUser | null> {
        return await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                isActive: true
            }
        });
    }

    async deactivateUser(id: number): Promise<void> {
        await prisma.user.update({
            where: { id },
            data: { isActive: false }
        });

        // Also cleanup their sessions
        await prisma.session.deleteMany({
            where: { userId: id }
        });

        logger.info(`User deactivated: ${id}`);
    }
}

export default new AuthService();