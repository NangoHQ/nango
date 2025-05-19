import { defineConfig } from 'tsup';

const sdkSrc = '../runner-sdk/lib/scripts.ts';

export default defineConfig([
    {
        entry: { index: sdkSrc },
        format: ['cjs'],
        outDir: 'cjs',
        bundle: true,
        dts: true,
        external: [/node_modules/],
        splitting: true,
        treeshake: true,
        clean: true,
        noExternal: ['@nangohq/runner-sdk'], // force inclusion
        outExtension() {
            return {
                js: `.cjs`
            };
        }
    }
]);
