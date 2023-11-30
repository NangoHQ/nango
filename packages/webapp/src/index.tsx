import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { PostHogProvider } from 'posthog-js/react';
import * as Sentry from "@sentry/react";
import ErrorBoundary from './components/ErrorBoundary';

const options = {
    api_host: process.env.REACT_APP_PUBLIC_POSTHOG_HOST,
    maskAllInputs: true
};

Sentry.init({
  dsn: process.env.REACT_APP_PUBLIC_SENTRY_KEY,
  integrations: [
    new Sentry.BrowserTracing({
      tracePropagationTargets: [/^https:\/\/app.nango\.dev\/api/],
    }),
    new Sentry.Replay(),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 0.3,
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <PostHogProvider apiKey={process.env.REACT_APP_PUBLIC_POSTHOG_KEY} options={options}>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </PostHogProvider>
        </ErrorBoundary>
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
