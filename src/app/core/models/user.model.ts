export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'owner' | 'admin' | 'media_buyer' | 'designer' | 'viewer';
  onboardingComplete: boolean;
  plan: 'starter' | 'growth' | 'scale';
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
