// Runs via jest setupFiles — before any module is imported in test files.
// Sets required env vars so config/index.ts doesn't call process.exit(1).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/alertops_test';
process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-minimum-32chars!';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-minimum-32!';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.INTEGRATION_API_KEY = 'test-integration-key-16ch!';
process.env.LOG_LEVEL = 'error'; // silence logs in test output
