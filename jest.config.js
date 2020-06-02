module.exports = {
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}', '!<rootDir>/src/**/*.{spec,test}.{ts,tsx}'],
  projects: [
    {
      displayName: 'browser',
      testURL: 'http://localhost/',
      transform: {
        '^.+\\.tsx?$': 'ts-jest'
      },
      testRegex: '(.*/src/clients/.*)((test|spec))\\.(jsx?|tsx?)$',
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      modulePathIgnorePatterns: ['<rootDir>/dist/'],
      setupFiles: ['jest-localstorage-mock'],
      verbose: true
    },
    {
      displayName: 'backend',
      setupFiles: ['<rootDir>/jestSetup.js'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': 'ts-jest'
      },
      testRegex: '(.*/src/lib/.*)(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
      modulePathIgnorePatterns: ['<rootDir>/dist/'],
      testPathIgnorePatterns: ['/node_modules/', '/views/', '/legacy/'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      verbose: true
    }
  ]
}
