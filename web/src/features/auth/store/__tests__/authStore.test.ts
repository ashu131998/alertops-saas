/**
 * authStore — Zustand + persist middleware.
 * environment: jsdom (localStorage available)
 *
 * The persist middleware syncs `user` and `isAuthenticated` to localStorage
 * under the key "auth-store". Tokens are written to localStorage manually
 * inside setAuth/clearAuth but are NOT part of the Zustand-persisted state
 * (partialize only keeps user + isAuthenticated).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore';
import type { User } from '@/lib/types';

const TEST_USER: User = {
  id: 'user-1',
  email: 'worker@factory.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: 'WORKER',
  factoryId: 'factory-1',
  factory: { id: 'factory-1', name: 'Main Plant' },
};

const ACCESS  = 'test-access-token';
const REFRESH = 'test-refresh-token';

beforeEach(() => {
  // Prefer the store's own action over setState() to avoid bypassing persist middleware
  useAuthStore.getState().clearAuth();
  // Also clear any direct localStorage keys that setAuth writes manually
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('auth-store');
});

// ── initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('is unauthenticated', () => {
    const { isAuthenticated } = useAuthStore.getState();
    expect(isAuthenticated).toBe(false);
  });

  it('has no user', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('has no tokens', () => {
    const { accessToken, refreshToken } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });
});

// ── setAuth ───────────────────────────────────────────────────────────────────

describe('setAuth', () => {
  it('sets isAuthenticated to true', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('stores the user object', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    const { user } = useAuthStore.getState();
    expect(user?.id).toBe('user-1');
    expect(user?.email).toBe('worker@factory.com');
    expect(user?.role).toBe('WORKER');
  });

  it('stores both tokens in the Zustand slice', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    const { accessToken, refreshToken } = useAuthStore.getState();
    expect(accessToken).toBe(ACCESS);
    expect(refreshToken).toBe(REFRESH);
  });

  it('writes access_token to localStorage', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    expect(localStorage.getItem('access_token')).toBe(ACCESS);
  });

  it('writes refresh_token to localStorage', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    expect(localStorage.getItem('refresh_token')).toBe(REFRESH);
  });
});

// ── clearAuth ─────────────────────────────────────────────────────────────────

describe('clearAuth', () => {
  beforeEach(() => {
    // Pre-populate via setAuth so there is something to clear
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
  });

  it('sets isAuthenticated to false', () => {
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('clears user to null', () => {
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('clears tokens to null', () => {
    useAuthStore.getState().clearAuth();
    const { accessToken, refreshToken } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });

  it('removes access_token from localStorage', () => {
    useAuthStore.getState().clearAuth();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('removes refresh_token from localStorage', () => {
    useAuthStore.getState().clearAuth();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});

// ── setAuth → clearAuth → setAuth round-trip ──────────────────────────────────

describe('round-trip: login → logout → login', () => {
  it('second login restores full state', () => {
    const state = useAuthStore.getState();
    state.setAuth(TEST_USER, ACCESS, REFRESH);
    state.clearAuth();
    const secondUser = { ...TEST_USER, id: 'user-2', email: 'admin@factory.com' };
    state.setAuth(secondUser, 'new-access', 'new-refresh');

    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.user?.id).toBe('user-2');
    expect(s.accessToken).toBe('new-access');
    expect(localStorage.getItem('access_token')).toBe('new-access');
  });
});

// ── persist partialize ────────────────────────────────────────────────────────

describe('persist partialize', () => {
  it('persists user and isAuthenticated in localStorage auth-store key', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    const raw = localStorage.getItem('auth-store');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.state.user).toBeDefined();
    expect(stored.state.isAuthenticated).toBe(true);
  });

  it('does NOT persist tokens inside auth-store key', () => {
    useAuthStore.getState().setAuth(TEST_USER, ACCESS, REFRESH);
    const raw = JSON.parse(localStorage.getItem('auth-store')!);
    // accessToken and refreshToken should not be in the persisted slice
    expect(raw.state.accessToken).toBeUndefined();
    expect(raw.state.refreshToken).toBeUndefined();
  });
});
