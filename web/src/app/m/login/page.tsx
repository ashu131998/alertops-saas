'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../../../features/auth/api/authApi';
import { useAuthStore } from '../../../features/auth/store/authStore';
import { enablePush } from '../../../features/notifications/webPush';

export default function MobileLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If the worker is already signed in, skip straight to the app.
  useEffect(() => {
    if (isAuthenticated) router.replace('/m');
  }, [isAuthenticated, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user, tokens } = await authApi.login(email.trim(), password);
      setAuth(user, tokens.accessToken, tokens.refreshToken);
      // Ask for push permission right after login (best UX moment).
      enablePush().catch(() => {});
      router.replace('/m');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-center px-8 py-12">
      <div className="mb-10 text-center">
        <div className="text-6xl">🏭</div>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">AlertOps</h1>
        <p className="mt-1 text-sm text-gray-500">Industrial Alert Platform</p>
      </div>

      <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="worker@factory.com"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-500"
        />

        <label className="mb-1.5 mt-4 block text-sm font-medium text-gray-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-500"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-base font-semibold text-white active:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
