module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: ['/node_modules/', '/src/whatsapp/sessions/'],
    moduleNameMapper: {
        '^@whiskeysockets/baileys$': '<rootDir>/__mocks__/@whiskeysockets/baileys.js'
    }
};
