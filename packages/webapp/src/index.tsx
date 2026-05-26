import posthog from 'posthog-js';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { Providers } from './app/providers';
import { globalEnv } from './utils/env';

import './index.css';

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
