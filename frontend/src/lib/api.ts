const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: {
        id: number;
        username: string;
        email?: string;
        lastLoginAt?: string;
    };
    expiresAt: string;
}

export interface ApiError {
    error: string;
    code?: string;
}

class ApiClient {
    private token: string | null = null;

    constructor() {
        // Initialize token from localStorage if available
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('auth_token');
        }
    }

    private async makeRequest<T>(
        url: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const errorData: ApiError = await response.json().catch(() => ({
                error: 'Network error occurred'
            }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        return response.json();
    }

    setToken(token: string | null) {
        this.token = token;
        if (typeof window !== 'undefined') {
            if (token) {
                localStorage.setItem('auth_token', token);
            } else {
                localStorage.removeItem('auth_token');
            }
        }
    }

    getToken(): string | null {
        return this.token;
    }

    // Auth endpoints
    async login(credentials: LoginRequest): Promise<LoginResponse> {
        const response = await this.makeRequest<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });

        this.setToken(response.token);
        return response;
    }

    async logout(): Promise<void> {
        try {
            await this.makeRequest('/auth/logout', {
                method: 'POST',
            });
        } finally {
            this.setToken(null);
        }
    }

    async getCurrentUser() {
        return this.makeRequest<{ user: LoginResponse['user'] }>('/auth/me');
    }

    // Companies endpoints
    async getCompanies() {
        return this.makeRequest('/companies');
    }

    async getCompany(id: number) {
        return this.makeRequest(`/companies/${id}`);
    }

    async createCompany(data: { name: string; slackConfiguration?: any }) {
        return this.makeRequest('/companies', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateCompany(id: number, data: { name?: string; slackConfiguration?: any }) {
        return this.makeRequest(`/companies/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteCompany(id: number) {
        return this.makeRequest(`/companies/${id}`, {
            method: 'DELETE',
        });
    }

    // Import endpoints
    async importAddresses(data: {
        companyId: number;
        mode: string;
        addresses: any[];
        original_filename?: string;
    }) {
        return this.makeRequest('/imports', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
}

export const apiClient = new ApiClient();