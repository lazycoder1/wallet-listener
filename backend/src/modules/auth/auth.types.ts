export interface LoginRequestBody {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: {
        id: number;
        username: string;
        email?: string;
        lastLoginAt?: Date;
    };
    expiresAt: Date;
}

export interface CreateUserBody {
    username: string;
    email?: string;
    password: string;
}

export interface AuthenticatedUser {
    id: number;
    username: string;
    email?: string;
    isActive: boolean;
}

export interface TokenPayload {
    userId: number;
    username: string;
    sessionId: string;
    iat?: number;
    exp?: number;
}