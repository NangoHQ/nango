import { execSync } from 'node:child_process';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { Plugin, UserConfig } from 'vite';

// Emit a static version.json at the dist root carrying the real git SHA this bundle was built
// from, so an outside observer can read the deployed commit at <origin>/version.json. The SHA
// comes from CI ($GITHUB_SHA), an explicit $GIT_HASH, or local git as a fallback.
function emitVersionJson(): Plugin {
    return {
        name: 'emit-version-json',
        apply: 'build',
        generateBundle() {
            let sha = process.env['GITHUB_SHA'] ?? process.env['GIT_HASH'];
            if (!sha) {
                try {
                    sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
                } catch {
                    sha = '';
                }
            }
            this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ sha }) });
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), svgr(), tailwindcss(), emitVersionJson()] as UserConfig['plugins'],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // https://github.com/tabler/tabler-icons/issues/1233
            // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
            '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs'
        }
    },
    build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    // Put each language file in its own chunk
                    if (id.includes('i18n/translations/')) {
                        const lang = id.split('/').pop()?.split('.')[0];
                        return `lang-${lang}`;
                    }
                }
            }
        }
    }
});
