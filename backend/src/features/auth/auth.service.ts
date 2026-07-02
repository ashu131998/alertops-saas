import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import { AppError } from '../../core/errors/AppError';
import { AuthRepository } from './auth.repository';
import type { AuthResponse, LoginDto, RefreshTokenDto, RegisterDto, TokenPair } from './auth.types';

const SALT_ROUNDS = 12;

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async login(dto: LoginDto, meta: { userAgent?: string; ipAddress?: string }): Promise<AuthResponse> {
    const user = await this.repo.findUserByEmail(dto.email);
    if (!user || !user.isActive) throw AppError.unauthorized('Invalid email or password');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw AppError.unauthorized('Invalid email or password');

    const tokens = this.generateTokens(user);
    await this.repo.createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.repo.findUserByEmail(dto.email);
    if (existing) throw AppError.conflict('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.repo.createUser({ ...dto, passwordHash });
    const tokens = this.generateTokens(user);

    await this.repo.createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  async refresh(dto: RefreshTokenDto): Promise<TokenPair> {
    const session = await this.repo.findSession(dto.refreshToken);
    if (!session) throw AppError.unauthorized('Invalid refresh token');
    if (session.expiresAt < new Date()) {
      await this.repo.deleteSession(dto.refreshToken);
      throw AppError.unauthorized('Refresh token expired');
    }

    const tokens = this.generateTokens(session.user);
    await this.repo.updateSession(session.id, {
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repo.deleteSession(refreshToken);
  }

  async getMe(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) throw AppError.notFound('User not found');
    return this.sanitizeUser(user);
  }

  private generateTokens(user: { id: string; email: string; role: string; factoryId: string }): TokenPair {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, factoryId: user.factoryId, type: 'access' },
      config.JWT_ACCESS_SECRET,
      { expiresIn: config.JWT_ACCESS_EXPIRES_IN },
    );

    const refreshToken = jwt.sign(
      { sub: user.id, jti: uuidv4(), type: 'refresh' },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN },
    );

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  private sanitizeUser(user: any) {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }
}
