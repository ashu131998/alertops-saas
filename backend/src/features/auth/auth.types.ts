import { Role } from '@prisma/client';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  factoryId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  factoryId: string;
  factory: { id: string; name: string };
}

export interface AuthResponse {
  user: AuthUser;
  tokens: TokenPair;
}
