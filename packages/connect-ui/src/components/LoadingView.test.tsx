import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingView } from '@/components/LoadingView';
import { I18nProvider } from '@/lib/i18n';
import { expectAccessibleInBothThemes } from '@/test/harness';

function renderLoadingView(): HTMLElement {
    const { container } = render(
        <I18nProvider defaultLanguage="en">
            <LoadingView />
        </I18nProvider>
    );
    return container;
}

// LoadingView is shown during suspense/loading — a surface the four main views never expose.
describe('LoadingView', () => {
    // NAN-5906 #9: the loading container carries an `aria-label` on a role-less <div>, which screen
    // readers ignore. axe only downgrades this to "incomplete" (it has child content), so we assert
    // the fix's contract directly: a status live region announces loading.
    it('exposes a status region so screen readers announce loading', () => {
        renderLoadingView();

        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has no other accessibility violations in light or dark mode', async () => {
        await expectAccessibleInBothThemes(renderLoadingView());
    });
});
