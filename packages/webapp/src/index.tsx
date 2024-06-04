import { SentryErrorBoundary } from './utils/sentry';

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { PostHogProvider } from 'posthog-js/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_KEY, WEB_BASE_PATH } from './utils/env';

const options = {
    api_host: PUBLIC_POSTHOG_HOST,
    maskAllInputs: true
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <SentryErrorBoundary fallback={<ErrorBoundary />}>
            <PostHogProvider apiKey={PUBLIC_POSTHOG_KEY} options={options}>
                <BrowserRouter basename={WEB_BASE_PATH}>
                    <App />
                </BrowserRouter>
            </PostHogProvider>
        </SentryErrorBoundary>
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
