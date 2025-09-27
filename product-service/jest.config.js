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
    '!src/shared.ts',   
    '!src/**/*.dto.ts',
    '!src/common/**',                             
    '!src/products/products.bff.controller.ts',  
  ],
  coverageThreshold: {    
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },

  },
  transform: { '^.+\\.ts$': 'ts-jest' },
};
