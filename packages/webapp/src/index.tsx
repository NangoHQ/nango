import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import reportWebVitals from './reportWebVitals';
import { queryClient } from './store';
import { globalEnv } from './utils/env';
import { SentryErrorBoundary } from './utils/sentry';

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
        <SentryErrorBoundary fallback={<ErrorBoundary />}>
            <PostHogProvider client={posthog}>
                <BrowserRouter>
                    <NuqsAdapter>
                        <QueryClientProvider client={queryClient}>
                            <App />
                        </QueryClientProvider>
                    </NuqsAdapter>
                </BrowserRouter>
            </PostHogProvider>
        </SentryErrorBoundary>
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
