const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
console.log('🔧 API_BASE_URL configured as:', API_BASE_URL);

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
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        };

        // Get fresh token for each request
        const currentToken = this.getToken();
        console.log('🌐 Making request to:', url);
        console.log('🔑 Current token:', currentToken ? currentToken.substring(0, 20) + '...' : 'None');

        if (currentToken) {
            headers['Authorization'] = `Bearer ${currentToken}`;
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
                console.log('🔑 Token stored:', token.substring(0, 20) + '...');
            } else {
                localStorage.removeItem('auth_token');
                console.log('🗑️ Token removed');
            }
        }
    }

    getToken(): string | null {
        // Always try to get fresh token from localStorage
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('auth_token');
            if (storedToken && storedToken !== this.token) {
                this.token = storedToken;
            }
        }
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
    async getCompanies(): Promise<any[]> {
        return this.makeRequest<any[]>('/companies');
    }

    async getCompany(id: number): Promise<any> {
        return this.makeRequest<any>(`/companies/${id}`);
    }

    async createCompany(data: { name: string; slackConfiguration?: any }): Promise<any> {
        return this.makeRequest<any>('/companies', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateCompany(id: number, data: { name?: string; slackConfiguration?: any; dailyReportsEnabled?: boolean; dailyReportsEmail?: string | null }): Promise<any> {
        return this.makeRequest<any>(`/companies/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteCompany(id: number): Promise<void> {
        // Get fresh token for DELETE request
        const currentToken = this.getToken();
        const headers: Record<string, string> = {};

        if (currentToken) {
            headers['Authorization'] = `Bearer ${currentToken}`;
        }

        const response = await fetch(`${API_BASE_URL}/companies/${id}`, {
            method: 'DELETE',
            headers,
        });

        if (!response.ok) {
            const errorData: ApiError = await response.json().catch(() => ({
                error: 'Network error occurred'
            }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Don't try to parse JSON response for DELETE (it should return 204 No Content)
        return;
    }

    // Import endpoints
    async importAddresses(data: {
        companyId: number;
        mode: string;
        addresses: any[];
        original_filename?: string;
    }): Promise<any> {
        return this.makeRequest<any>('/imports', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Slack integration endpoints
    async generateSlackInstallUrl(companyId: number): Promise<any> {
        return this.makeRequest<any>('/api/v1/slack/generate-install-url', {
            method: 'POST',
            body: JSON.stringify({ companyId }),
        });
    }
}

export const apiClient = new ApiClient();