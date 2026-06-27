import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8005/api/v1';

// Custom error class to maintain compatibility if needed, though axios has its own
export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Handle FormData automatically (Axios does this, but we ensure Content-Type is removed)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const message = data?.detail || error.message || 'An unexpected error occurred';

    // Auto logout on 401 Unauthorized
    if (status === 401) {
      useAuthStore.getState().logout();
    }

    // Wrap in ApiError for backward compatibility or more structured handling
    return Promise.reject(new ApiError(status || 500, message, data));
  }
);

/**
 * Legacy wrapper for fetchClient to minimize changes in existing components
 * @deprecated Use apiClient directly for better axios features
 */
export const fetchClient = async (endpoint: string, options: any = {}): Promise<any> => {
  const { method = 'GET', body, headers, ...rest } = options;
  
  const config = {
    method,
    url: endpoint,
    data: body,
    headers,
    ...rest,
  };

  return apiClient(config);
};

export default apiClient;
