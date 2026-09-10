import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { resumeOAuthInteraction } from './api';
import { OAuthFailure, OAuthLayout } from './Layout';

export function OAuthContinue() {
    const { uid = '' } = useParams();
    const [error, setError] = useState<unknown>();
    useEffect(() => {
        try {
            resumeOAuthInteraction(uid);
        } catch (err) {
            setError(err);
        }
    }, [uid]);
    return (
        <OAuthLayout>
            {error ? (
                <OAuthFailure error={error} retry={() => resumeOAuthInteraction(uid)} />
            ) : (
                <p role="status" className="text-text-secondary">
                    Continuing securely to Nango…
                </p>
            )}
        </OAuthLayout>
    );
}
