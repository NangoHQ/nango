import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { LoadingView } from '@/components/LoadingView';
import { I18nProvider } from '@/lib/i18n';
import { expectAccessibleInBothThemes } from '@/test/a11y';

async function renderLoadingView(): Promise<HTMLElement> {
    const { container } = await render(
        <I18nProvider defaultLanguage="en">
            <LoadingView />
        </I18nProvider>
    );
    return container;
}

describe('LoadingView', () => {
    it('exposes a status region so screen readers announce loading', async () => {
        await renderLoadingView();

        // Assert the name too, so it verifies "Loading" is actually announced, not just that a status region exists.
        await expect.element(page.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('has no other accessibility violations in light or dark mode', async () => {
        await expectAccessibleInBothThemes(await renderLoadingView());
    });
});
