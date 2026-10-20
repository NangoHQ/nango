import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import PageNotFound from '../../pages/PageNotFound';
import { ErrorBoundary } from './ErrorBoundary';

export const RouteErrorPage: React.FC = () => {
    const error = useRouteError();
    const notFound = isRouteErrorResponse(error) && error.status === 404;

    // React Router catches a page crash before SentryErrorBoundary sees it, so this is the only report.
    useEffect(() => {
        if (!notFound) {
            Sentry.captureException(error, { tags: { error_page: 'route' } });
        }
    }, [error, notFound]);

    if (notFound) {
        return <PageNotFound />;
    }

    return <ErrorBoundary />;
};
