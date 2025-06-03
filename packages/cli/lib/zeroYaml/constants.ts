import ts from 'typescript';

export const npmPackageRegex = /^[^./\s]/;
export const importRegex = /^import ['"](?<path>\.\/[^'"]+)['"];/gm;

export const tsconfig: ts.CompilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
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
    module: 'commonjs',
    target: 'esnext',
    importsNotUsedAsValues: 'remove',
    jsx: 'react',
    moduleResolution: 'node16'
};

export type BabelErrorType = 'nango_unsupported_export' | 'nango_invalid_function_param' | 'nango_invalid_default_export' | 'nango_invalid_export_constant';
export class BabelError extends Error {
    type;
    constructor(type: BabelErrorType) {
        super(type);
        this.type = type;
    }
}

const defaultMsg = 'Invalid default export: should be createAction(), createSync() or createOnEvent()';
export const customErrors: Record<BabelErrorType, string> = {
    nango_unsupported_export: defaultMsg,
    nango_invalid_function_param: 'Invalid function parameter, should be an object',
    nango_invalid_default_export: defaultMsg,
    nango_invalid_export_constant: defaultMsg
};
export class CompileError extends Error {
    type: BabelErrorType | 'failed_to_build_unknown';
    msg: string;
    filePath?: string;
    constructor(type: BabelErrorType | 'failed_to_build_unknown', msg: string) {
        super(msg);
        this.type = type;
        this.msg = msg;
    }
}
