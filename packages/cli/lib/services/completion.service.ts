import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import chalk from 'chalk';

import { state } from '../state.js';
import { http } from '../utils.js';

const GITHUB_API_BASE = 'https://api.github.com/repos/NangoHQ/integration-templates/contents/integrations';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface GitHubContent {
    name: string;
    type: 'file' | 'dir' | 'symlink';
}

/**
 * Fetch list of integrations from GitHub API
 */
async function fetchIntegrations(): Promise<string[]> {
    const cache = state.get('completionCache')?.integrations;

    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return cache.data;
    }

    const response = await http.get<GitHubContent[]>(GITHUB_API_BASE, {
        headers: {
            Accept: 'application/vnd.github.v3+json'
        }
    });

    const integrations = response.data.filter((item) => item.type === 'dir' && !item.name.startsWith('.')).map((item) => item.name);

    // Update cache
    const currentCache = state.get('completionCache') || {};
    state.set('completionCache', {
        ...currentCache,
        integrations: { data: integrations, timestamp: Date.now() }
    });

    return integrations;
}

/**
 * Fetch scripts for a specific integration and type
 */
async function fetchScripts(integration: string, type: string): Promise<string[]> {
    const cacheKey = `${integration}/${type}`;
    const cache = state.get('completionCache')?.scripts?.[cacheKey];

    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return cache.data;
    }

    const url = `${GITHUB_API_BASE}/${integration}/${type}`;
    const response = await http.get<GitHubContent[]>(url, {
        headers: {
            Accept: 'application/vnd.github.v3+json'
        }
    });

    const scripts = response.data.filter((item) => item.type === 'file' && item.name.endsWith('.ts')).map((item) => item.name.replace('.ts', ''));

    // Update cache
    const currentCache = state.get('completionCache') || {};
    const currentScripts = currentCache.scripts || {};
    state.set('completionCache', {
        ...currentCache,
        scripts: {
            ...currentScripts,
            [cacheKey]: { data: scripts, timestamp: Date.now() }
        }
    });

    return scripts;
}

interface CompletionResult {
    value: string;
    addSpace: boolean;
}

/**
 * Get completions for the pull command
 */
async function getPullCompletions(partial: string): Promise<CompletionResult[]> {
    const parts = partial.split('/');

    // Completing integration name: "" or "git" -> suggest integrations
    if (parts.length === 1) {
        const integrations = await fetchIntegrations();
        return integrations.filter((i) => i.startsWith(parts[0] || '')).map((i) => ({ value: `${i}/`, addSpace: false }));
    }

    // Completing type: "github/" or "github/act" -> suggest types
    if (parts.length === 2) {
        const integration = parts[0]!;
        const typePartial = parts[1] || '';
        const types = ['actions', 'syncs'];
        return types.filter((t) => t.startsWith(typePartial)).map((t) => ({ value: `${integration}/${t}/`, addSpace: false }));
    }

    // Completing script: "github/actions/" or "github/actions/list" -> suggest scripts
    if (parts.length === 3) {
        const integration = parts[0]!;
        const type = parts[1]!;
        const scriptPartial = parts[2] || '';

        if (!['actions', 'syncs'].includes(type)) {
            return [];
        }

        const scripts = await fetchScripts(integration, type);
        return scripts.filter((s) => s.startsWith(scriptPartial)).map((s) => ({ value: `${integration}/${type}/${s}`, addSpace: true }));
    }

    return [];
}

/**
 * Handle shell completion requests
 * Called when shell invokes nango for completions (COMP_LINE is set)
 */
export async function handleCompletion(): Promise<void> {
    const compLine = process.env['COMP_LINE'] || '';
    const compPoint = parseInt(process.env['COMP_POINT'] || '0', 10);

    // Get the portion of the line up to the cursor
    const lineUpToCursor = compLine.slice(0, compPoint);
    const words = lineUpToCursor.split(/\s+/);

    try {
        // Check if we're completing the "pull:templates" command
        const pullIndex = words.indexOf('pull:templates');

        if (pullIndex === -1) {
            // Not completing pull:templates command, return empty
            return;
        }

        // Get the partial word being completed (after "pull:templates")
        const partial = words[pullIndex + 1] || '';

        const completions = await getPullCompletions(partial);

        // Output completions in a format our shell scripts understand
        // Format: value<TAB>addSpace (1 or 0)
        for (const completion of completions) {
            console.log(`${completion.value}\t${completion.addSpace ? '1' : '0'}`);
        }
    } catch {
        // Fail silently - completion should never break the shell
    }
}

/**
 * Get the shell configuration file path
 */
function getShellConfigPath(): { shell: string; configPath: string } | null {
    const shell = process.env['SHELL'] || '';
    const home = os.homedir();

    if (shell.includes('zsh')) {
        return { shell: 'zsh', configPath: path.join(home, '.zshrc') };
    } else if (shell.includes('bash')) {
        // Check for .bash_profile first (macOS), then .bashrc (Linux)
        const bashProfile = path.join(home, '.bash_profile');
        const bashrc = path.join(home, '.bashrc');
        if (fs.existsSync(bashProfile)) {
            return { shell: 'bash', configPath: bashProfile };
        }
        return { shell: 'bash', configPath: bashrc };
    } else if (shell.includes('fish')) {
        return { shell: 'fish', configPath: path.join(home, '.config', 'fish', 'config.fish') };
    }

    return null;
}

/**
 * Generate the zsh completion script
 */
function generateZshScript(): string {
    return `
###-begin-nango-completion-###
_nango_completion() {
    local -a completions
    local -a completions_with_space
    local -a completions_no_space
    local line

    # Get completions from nango
    while IFS=$'\\t' read -r value add_space; do
        if [[ -n "$value" ]]; then
            if [[ "$add_space" == "1" ]]; then
                completions_with_space+=("$value")
            else
                completions_no_space+=("$value")
            fi
        fi
    done < <(COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" nango completion 2>/dev/null)

    # Add completions that should have a space after them
    if [[ \${#completions_with_space[@]} -gt 0 ]]; then
        compadd -S ' ' -a completions_with_space
    fi

    # Add completions that should NOT have a space after them (like paths ending in /)
    if [[ \${#completions_no_space[@]} -gt 0 ]]; then
        compadd -S '' -a completions_no_space
    fi
}

compdef _nango_completion nango
###-end-nango-completion-###
`.trim();
}

/**
 * Generate the bash completion script
 */
function generateBashScript(): string {
    return `
###-begin-nango-completion-###
_nango_completion() {
    local cur completions
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"

    # Get completions from nango
    while IFS=$'\\t' read -r value add_space; do
        if [[ -n "$value" ]]; then
            COMPREPLY+=("$value")
        fi
    done < <(COMP_LINE="$COMP_LINE" COMP_POINT="$COMP_POINT" nango completion 2>/dev/null)

    # If only one completion and it ends with /, don't add space
    if [[ \${#COMPREPLY[@]} -eq 1 && "\${COMPREPLY[0]}" == */ ]]; then
        compopt -o nospace
    fi
}

complete -F _nango_completion nango
###-end-nango-completion-###
`.trim();
}

/**
 * Generate the fish completion script
 */
function generateFishScript(): string {
    return `
###-begin-nango-completion-###
function _nango_completion
    set -l cmd (commandline -opc)
    set -l cursor (commandline -C)
    COMP_LINE=(commandline) COMP_POINT=$cursor nango completion 2>/dev/null | while read -l value add_space
        if test -n "$value"
            echo $value
        end
    end
end

complete -c nango -f -a '(_nango_completion)'
###-end-nango-completion-###
`.trim();
}

const COMPLETION_MARKER_START = '###-begin-nango-completion-###';
const COMPLETION_MARKER_END = '###-end-nango-completion-###';

/**
 * Install shell completion
 */
export function installCompletion(): void {
    if (process.platform === 'win32') {
        console.log(chalk.yellow('Shell completion is not supported on Windows.'));
        return;
    }

    const shellConfig = getShellConfigPath();
    if (!shellConfig) {
        console.log(chalk.red('Could not detect your shell. Supported shells: bash, zsh, fish'));
        return;
    }

    const { shell, configPath } = shellConfig;

    // Generate the appropriate script
    let script: string;
    switch (shell) {
        case 'zsh':
            script = generateZshScript();
            break;
        case 'bash':
            script = generateBashScript();
            break;
        case 'fish':
            script = generateFishScript();
            break;
        default:
            console.log(chalk.red(`Unsupported shell: ${shell}`));
            return;
    }

    // Read existing config
    let existingConfig = '';
    if (fs.existsSync(configPath)) {
        existingConfig = fs.readFileSync(configPath, 'utf-8');
    }

    // Check if already installed
    if (existingConfig.includes(COMPLETION_MARKER_START)) {
        // Remove existing completion block
        const startIdx = existingConfig.indexOf(COMPLETION_MARKER_START);
        const endIdx = existingConfig.indexOf(COMPLETION_MARKER_END) + COMPLETION_MARKER_END.length;
        existingConfig = existingConfig.slice(0, startIdx) + existingConfig.slice(endIdx);
        existingConfig = existingConfig.trim();
    }

    // Append new completion script
    const newConfig = existingConfig + '\n\n' + script + '\n';
    fs.writeFileSync(configPath, newConfig);

    console.log(chalk.green(`Shell completion installed successfully for ${shell}.`));
    console.log(chalk.gray(`Updated: ${configPath}`));
    console.log(chalk.gray(`Restart your shell or run: source ${configPath}`));
}

/**
 * Uninstall shell completion
 */
export function uninstallCompletion(): void {
    if (process.platform === 'win32') {
        console.log(chalk.yellow('Shell completion is not supported on Windows.'));
        return;
    }

    const shellConfig = getShellConfigPath();
    if (!shellConfig) {
        console.log(chalk.red('Could not detect your shell.'));
        return;
    }

    const { shell, configPath } = shellConfig;

    if (!fs.existsSync(configPath)) {
        console.log(chalk.yellow('Shell completion is not installed.'));
        return;
    }

    let existingConfig = fs.readFileSync(configPath, 'utf-8');

    if (!existingConfig.includes(COMPLETION_MARKER_START)) {
        console.log(chalk.yellow('Shell completion is not installed.'));
        return;
    }

    // Remove completion block
    const startIdx = existingConfig.indexOf(COMPLETION_MARKER_START);
    const endIdx = existingConfig.indexOf(COMPLETION_MARKER_END) + COMPLETION_MARKER_END.length;
    existingConfig = existingConfig.slice(0, startIdx) + existingConfig.slice(endIdx);

    // Clean up extra newlines
    existingConfig = existingConfig.replace(/\n{3,}/g, '\n\n').trim() + '\n';

    fs.writeFileSync(configPath, existingConfig);

    console.log(chalk.green(`Shell completion uninstalled successfully for ${shell}.`));
    console.log(chalk.gray(`Updated: ${configPath}`));
    console.log(chalk.gray(`Restart your shell or run: source ${configPath}`));
}
