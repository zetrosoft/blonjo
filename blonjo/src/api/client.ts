import { useAuthStore } from '../store/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8005/api/v1';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const fetchClient = async (endpoint: string, options: RequestInit = {}) => {
  const token = useAuthStore.getState().token;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is FormData (e.g. for OAuth2PasswordRequestForm), don't set Content-Type
  if (options.body instanceof FormData) {
    delete (headers as Record<string, string>)['Content-Type'];
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }
    const message = errorData?.detail || response.statusText || 'An error occurred';
    
    // Auto logout on 401
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }
    
    throw new ApiError(response.status, message, errorData);
  }

  return response.json();
};
