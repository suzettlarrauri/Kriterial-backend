import type { UserRole } from '../generated/prisma/enums.js';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}
