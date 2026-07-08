/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  setupFiles: ['dotenv/config'],
  testTimeout: 10000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};