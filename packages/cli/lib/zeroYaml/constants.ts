import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const exampleFolder = path.join(__dirname, '../../example');
export const npmPackageRegex = /^[^./\s]/;
export const importRegex = /^import ['"](?<path>\.\/[^'"]+)['"];?/gm;

export const tsconfig: ts.CompilerOptions = {
    module: ts.ModuleKind.Node16,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    allowUnusedLabels: false,
    allowUnreachableCode: false,
    exactOptionalPropertyTypes: true,
    noFallthroughCasesInSwitch: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noPropertyAccessFromIndexSignature: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    declaration: false,
    sourceMap: true,
    composite: false,
    checkJs: false,
    noEmit: true
};
export const tsconfigString: Record<string, any> = {
    ...tsconfig,
    module: 'node16',
    target: 'esnext',
    importsNotUsedAsValues: 'remove',
    jsx: 'react',
    moduleResolution: 'node16'
};

export const allowedPackages = ['url', 'crypto', 'node:crypto', 'nango', 'zod', 'unzipper', 'soap', 'botbuilder'];
