import { describe, expect, it, vi } from 'vitest';

import { Ensure } from './ensure.service.js';
import * as interactive from './interactive.service.js';
import { MissingArgumentError } from '../utils/errors.js';

describe('Ensure', () => {
    it('should return current value if it exists', async () => {
        const ensure = new Ensure(true);
        const result = await ensure.projectPath('existing-path');
        expect(result).toBe('existing-path');
    });

    it('should throw MissingArgumentError if not interactive and no current value', async () => {
        const ensure = new Ensure(false);
        await expect(ensure.projectPath(undefined)).rejects.toThrow(MissingArgumentError);
    });

    it('should call prompt function if interactive and no current value', async () => {
        const ensure = new Ensure(true);
        const promptSpy = vi.spyOn(interactive, 'promptForProjectPath').mockResolvedValue('new-path');
        const result = await ensure.projectPath(undefined);
        expect(promptSpy).toHaveBeenCalled();
        expect(result).toBe('new-path');
    });

    it('should throw error if prompt fails', async () => {
        const ensure = new Ensure(true);
        vi.spyOn(interactive, 'promptForProjectPath').mockRejectedValue(new Error('Prompt failed'));
        await expect(ensure.projectPath(undefined)).rejects.toThrow('Prompt failed');
    });

    it('should throw TTY error if prompt fails with isTtyError', async () => {
        const ensure = new Ensure(true);
        const ttyError = new Error('TTY error');
        (ttyError as any).isTtyError = true;
        vi.spyOn(interactive, 'promptForProjectPath').mockRejectedValue(ttyError);
        await expect(ensure.projectPath(undefined)).rejects.toThrow(
            "Prompt couldn't be rendered in the current environment. Please use the --no-interactive flag and pass all required arguments."
        );
    });
});
