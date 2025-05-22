import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';

/**
 * This script compile a special CJS bundle for the script
 * The main issue is that we are executing scripts in CJS format, but our whole codebase is ESM
 * So we need a CJS bundle that contains the createAction (and others function)
 * and d.ts file to make the local compilation works.
 */
export default defineConfig([
    // JS bundle
    {
        input: 'lib/scripts.ts',
        output: {
            file: 'cjs/index.cjs',
            format: 'cjs'
        },
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfig: './tsconfig.build.json',
                declaration: false
            })
        ],
        external: [/node_modules/]
    },
    // Types bundle
    {
        input: 'lib/scripts.ts',
        output: {
            file: 'cjs/index.d.ts',
            format: 'es'
        },
        plugins: [dts()]
    }
]);
