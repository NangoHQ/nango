import posthog from 'posthog-js';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { Providers } from './app/providers';
import { globalEnv } from './utils/env';
import { redactSensitiveProperties, redactSensitiveText } from './utils/sensitive-url';

if (globalEnv.publicPosthogKey) {
    posthog.init(globalEnv.publicPosthogKey, {
        api_host: globalEnv.publicPosthogHost,
        mask_personal_data_properties: true,
        custom_personal_data_properties: ['session_token', 'token', 'next'],
        // The dashboard renders customer-supplied data that can contain PHI (NAN-6428):
        // mask all text by default, opt Nango-owned static chrome out with data-ph-unmask.
        mask_all_text: true,
        mask_all_element_attributes: true,
        // Auth routes carry tokens in the URL path (NAN-6506), which no masking option covers.
        before_send: (event) => {
            if (!event) {
                return event;
            }
            // Skipped for cost: $snapshot payloads are large and their urls go through maskNetworkRequestFn.
            if (event.event === '$snapshot') {
                return event;
            }

            redactSensitiveProperties(event.properties);
            if (event.$set) {
                redactSensitiveProperties(event.$set);
            }
            if (event.$set_once) {
                redactSensitiveProperties(event.$set_once);
            }

            return event;
        },
        session_recording: {
            maskAllInputs: true,
            // rrweb matches maskTextSelector against ancestors too, so a :not() opt-out can
            // never apply (body always matches). Mask everything, unmask via maskTextFn.
            maskTextSelector: '*',
            maskTextFn: (text, element) => (element?.closest('[data-ph-unmask]') ? text : text.replace(/\S/g, '*')),
            // Masks the recording's own url. Deprecated, but the only key posthog-js 1.212 reads
            // here; newer versions prefer maskCapturedNetworkRequestFn, whose payload is `name`.
            maskNetworkRequestFn: (data) => ({ ...data, url: redactSensitiveText(data.url) })
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
