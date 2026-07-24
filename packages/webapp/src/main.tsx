import posthog from 'posthog-js';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { Providers } from './app/providers';
import { globalEnv } from './utils/env';
import { redactConnectionIdFromUrl } from './utils/telemetry';

if (globalEnv.publicPosthogKey) {
    posthog.init(globalEnv.publicPosthogKey, {
        api_host: globalEnv.publicPosthogHost,
        mask_personal_data_properties: true,
        // The dashboard renders customer-supplied data that can contain PHI (NAN-6428):
        // mask all text by default, opt Nango-owned static chrome out with data-ph-unmask.
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: {
            maskAllInputs: true,
            maskTextSelector: '*:not([data-ph-unmask])'
        },
        before_send: (event) => {
            if (event?.properties) {
                for (const key of ['$current_url', '$pathname', '$referrer']) {
                    const value = event.properties[key];
                    if (typeof value === 'string') {
                        event.properties[key] = redactConnectionIdFromUrl(value);
                    }
                }
            }
            return event;
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
