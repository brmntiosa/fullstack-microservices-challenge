const { createDefaultPreset } = require('ts-jest');
const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/shared/**',
    '!src/shared.ts',   // file tunggal non-logic
    '!src/**/*.dto.ts',
    '!src/common/**',                              // filter/infra
    '!src/products/products.bff.controller.ts',  
  ],
  coverageThreshold: {     // opsional tapi enak buat “hijau”
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },
    // kamu bisa naikkan bertahap setelah controller test ditambah
  },
  transform: { '^.+\\.ts$': 'ts-jest' },
};
