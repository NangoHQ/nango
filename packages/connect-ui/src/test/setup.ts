import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Real app stylesheet so Tailwind utilities + theme CSS variables resolve in the browser.
// Without this, axe's color-contrast checks have no computed colors to evaluate.
import '@/index.css';

import { useGlobal } from '@/lib/store';

afterEach(() => {
    cleanup();
    // Reset shared singletons so state never leaks between tests.
    useGlobal.setState({
        sessionToken: null,
        provider: null,
        integration: null,
        isDirty: false,
        isSingleIntegration: false,
        session: null,
        nango: null,
        apiURL: 'https://api.nango.dev',
        isEmbedded: false,
        isAuthLink: false,
        detectClosedAuthWindow: false,
        isPreview: false,
        showWatermark: false
    });
    document.documentElement.classList.remove('dark');
});
