import { useEffect, useRef } from 'react';

import LinkWithIcon from '../../components/LinkWithIcon';

interface ThirdStepProps {
    onDocumentationLinkClicked: (link: string) => void;
    onSlackLinkClicked: () => void;
}

export const ThirdStep = ({ onDocumentationLinkClicked, onSlackLinkClicked }: ThirdStepProps) => {
    const componentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (componentRef.current) {
            componentRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }, []);

    return (
        <div ref={componentRef}>
            <h3 className="text-text-primary text-lg font-semibold mb-3">Go deeper</h3>
            <p className="text-text-secondary text-sm">Add nango to your app in less than an hour.</p>

            <div className="mt-5 flex flex-col">
                <LinkWithIcon
                    to="https://docs.nango.dev/getting-started/quickstart/embed-in-your-app"
                    type="external"
                    onClick={() => onDocumentationLinkClicked('embed-in-your-app')}
                >
                    Embed the auth flow in your app
                </LinkWithIcon>
                <LinkWithIcon
                    to="https://docs.nango.dev/guides/syncs/overview"
                    type="external"
                    onClick={() => onDocumentationLinkClicked('explore-syncs-actions-webhooks')}
                >
                    Explore Syncs, Actions & Webhooks
                </LinkWithIcon>
            </div>

            <p className="text-text-secondary text-sm mt-5 flex flex-row gap-1">
                Questions? We&apos;re happy to help on the
                <LinkWithIcon to="https://nango.dev/slack" type="external" onClick={onSlackLinkClicked}>
                    Slack Community
                </LinkWithIcon>
            </p>
        </div>
    );
};
