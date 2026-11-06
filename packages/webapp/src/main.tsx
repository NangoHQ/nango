import posthog from 'posthog-js';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { Providers } from './app/providers';
import { INVITE_PREFILL_PARAM } from './pages/Team/components/inviteForm';
import { removeIdleAgentPlaygroundChats } from './store/agentPlaygroundChat';
import { globalEnv } from './utils/env';
import { maskCapturedNetworkRequest, redactSensitiveProperties } from './utils/sensitive-url';

if (globalEnv.publicPosthogKey) {
    posthog.init(globalEnv.publicPosthogKey, {
        api_host: globalEnv.publicPosthogHost,
        // The website shares the .nango.dev cookie; without this, a stale per-origin localStorage overrides it.
        cookieWinsOnConflict: true,
        autocapture: false,
        capture_pageview: 'history_change',
        mask_personal_data_properties: true,
        // mask_personal_data_properties only covers ad/click params, so name the rest explicitly.
        // invite_email carries a requester's address and the first $pageview fires here, before
        // React can strip it from the URL.
        custom_personal_data_properties: ['session_token', 'token', 'next', INVITE_PREFILL_PARAM],
        mask_all_text: true,
        mask_all_element_attributes: true,
        // Auth routes carry tokens in the URL path (NAN-6506), which no masking option covers.
        before_send: (event) => {
            if (!event) {
                return event;
            }
            // Skipped for cost: $snapshot payloads are large and their urls go through maskCapturedNetworkRequestFn.
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
        // Starting at load would record a BAA account before /meta says it may not be recorded.
        disable_session_recording: true,
        session_recording: {
            maskAllInputs: true,
            // Replaces the project's `*` selector, so leaving it out masks all text again.
            // Payloads and secrets render in pre/code blocks; mark other customer data with data-ph-mask.
            maskTextSelector: 'pre, code, [data-ph-mask]',
            // Third-party iframe srcs embed the page url, tokens included (Stripe's `referrer=`).
            // Setting this replaces the project's "Privacy and masking" selector, so keep `img` from it.
            blockSelector: 'img, iframe',
            maskCapturedNetworkRequestFn: maskCapturedNetworkRequest
        }
    });
}

removeIdleAgentPlaygroundChats();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <Providers>
            <App />
        </Providers>
    </React.StrictMode>
);
