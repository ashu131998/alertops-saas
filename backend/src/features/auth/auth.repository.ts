import { PrismaClient, User } from '@prisma/client';

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.db.user.findFirst({
      where: { email, deletedAt: null },
      include: { factory: { select: { id: true, name: true } } },
    });
  }

  findUserById(id: string) {
    return this.db.user.findFirst({
      where: { id, deletedAt: null },
      include: { factory: { select: { id: true, name: true } } },
    });
  }

  createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: User['role'];
    factoryId: string;
  }) {
    return this.db.user.create({ data, include: { factory: { select: { id: true, name: true } } } });
  }

  createSession(data: {
    userId: string;
    refreshToken: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }) {
    return this.db.session.create({ data });
  }

  findSession(refreshToken: string) {
    return this.db.session.findUnique({ where: { refreshToken }, include: { user: { include: { factory: { select: { id: true, name: true } } } } } });
  }

  deleteSession(refreshToken: string) {
    return this.db.session.deleteMany({ where: { refreshToken } });
  }

  deleteUserSessions(userId: string) {
    return this.db.session.deleteMany({ where: { userId } });
  }

  updateSession(id: string, data: { refreshToken: string; expiresAt: Date }) {
    return this.db.session.update({ where: { id }, data });
  }
}
