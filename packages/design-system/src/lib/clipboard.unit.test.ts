// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText } from './clipboard';

describe('copyText', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('uses the clipboard API when the page has it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        await copyText('hello');

        expect(writeText).toHaveBeenCalledWith('hello');
    });

    it('falls back to the copy command without the clipboard API, as on plain HTTP', async () => {
        vi.stubGlobal('navigator', {});
        let copied = '';
        document.execCommand = vi.fn(() => {
            copied = document.querySelector('textarea')?.value ?? '';
            return true;
        });

        await copyText('hello');

        expect(copied).toBe('hello');
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('falls back to the copy command when the clipboard API rejects', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } });
        document.execCommand = vi.fn(() => true);

        await copyText('hello');

        expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    it('fails when the copy command does', async () => {
        vi.stubGlobal('navigator', {});
        document.execCommand = vi.fn(() => false);

        await expect(copyText('hello')).rejects.toThrow('copy_command_failed');
        expect(document.querySelector('textarea')).toBeNull();
    });
});
