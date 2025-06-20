import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import logger from '../config/logger';

// Create a centralized HTTP client with connection pooling
class HttpClient {
    private static instance: HttpClient;
    private axiosInstance: AxiosInstance;

    private constructor() {
        this.axiosInstance = axios.create({
            timeout: 30000, // 30 seconds timeout
            maxRedirects: 5,
            // Enable connection pooling
            httpAgent: new (require('http').Agent)({
                keepAlive: true,
                keepAliveMsecs: 30000,
                maxSockets: 50,
                maxFreeSockets: 10,
                timeout: 60000,
                freeSocketTimeout: 30000,
            }),
            httpsAgent: new (require('https').Agent)({
                keepAlive: true,
                keepAliveMsecs: 30000,
                maxSockets: 50,
                maxFreeSockets: 10,
                timeout: 60000,
                freeSocketTimeout: 30000,
            }),
        });

        // Add request interceptor for logging
        this.axiosInstance.interceptors.request.use(
            (config) => {
                logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('HTTP Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for logging
        this.axiosInstance.interceptors.response.use(
            (response) => {
                logger.debug(`HTTP Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                logger.error('HTTP Response Error:', error);
                return Promise.reject(error);
            }
        );
    }

    public static getInstance(): HttpClient {
        if (!HttpClient.instance) {
            HttpClient.instance = new HttpClient();
        }
        return HttpClient.instance;
    }

    public getAxiosInstance(): AxiosInstance {
        return this.axiosInstance;
    }

    public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return this.axiosInstance.get<T>(url, config).then(response => response.data);
    }

    public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        return this.axiosInstance.post<T>(url, data, config).then(response => response.data);
    }

    public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        return this.axiosInstance.put<T>(url, data, config).then(response => response.data);
    }

    public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return this.axiosInstance.delete<T>(url, config).then(response => response.data);
    }

    public async cleanup(): Promise<void> {
        try {
            // Close all connections
            if (this.axiosInstance.defaults.httpAgent) {
                this.axiosInstance.defaults.httpAgent.destroy();
            }
            if (this.axiosInstance.defaults.httpsAgent) {
                this.axiosInstance.defaults.httpsAgent.destroy();
            }
            logger.info('HTTP client connections cleaned up');
        } catch (error) {
            logger.error('Error cleaning up HTTP client:', error);
        }
    }
}

export const httpClient = HttpClient.getInstance();
export default httpClient; 