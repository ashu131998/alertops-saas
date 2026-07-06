/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Matches both *.test.ts (unit) and *.ft.test.ts (functional)
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.ft.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  transformIgnorePatterns: ['node_modules'],
  // Set env vars before any module is imported
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  clearMocks: true,
};
