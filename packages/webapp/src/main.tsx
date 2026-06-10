import posthog from 'posthog-js';

// Show focus rings only during keyboard navigation, not on mouse/touch click.
// :focus-visible fires for text inputs on any focus method (browser design), so
// we gate on a .keyboard-nav class that we toggle here.
document.documentElement.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-nav'), true);
document.documentElement.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.documentElement.classList.add('keyboard-nav'); }, true);
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { Providers } from './app/providers';
import { globalEnv } from './utils/env';

if (globalEnv.publicPosthogKey) {
    posthog.init(globalEnv.publicPosthogKey, {
        api_host: globalEnv.publicPosthogHost,
        mask_personal_data_properties: true,
        session_recording: {
            maskAllInputs: true
        }
    });
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <Providers>
            <App />
        </Providers>
    </React.StrictMode>
);
