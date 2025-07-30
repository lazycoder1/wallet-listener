'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { apiClient, type LoginRequest, type LoginResponse } from './api';

interface AuthContextType {
  isAuthenticated: boolean;
  user: LoginResponse['user'] | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already authenticated on mount
    const checkAuth = async () => {
      const token = apiClient.getToken();
      if (token) {
        try {
          const response = await apiClient.getCurrentUser();
          setUser(response.user);
          setIsAuthenticated(true);
          setError(null);
        } catch (error) {
          // Token is invalid or expired
          apiClient.setToken(null);
          setIsAuthenticated(false);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (
    username: string,
    password: string
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const credentials: LoginRequest = { username, password };
      const response = await apiClient.login(credentials);

      setUser(response.user);
      setIsAuthenticated(true);
      return true;
    } catch (error: any) {
      setError(error.message || 'Login failed');
      setIsAuthenticated(false);
      setUser(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.logout();
    } catch (error) {
      // Continue with logout even if server request fails
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      setError(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        login,
        logout,
        isLoading,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
