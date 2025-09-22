import { useEffect, useState } from 'react';

const publicKey = 'pk_Osn50U6lzOCALPAuP46SfE42xJfMKY914TMzrWE3Tr4';
const host = 'https://api.apidownwatch.com';
const refreshRate = 5;

export function StatusWidget({ service, className = '' }: { service: string; className?: string }) {
    const [widgetHtml, setWidgetHtml] = useState('');

    useEffect(() => {
        const fetchWidget = () => {
            fetch(`${host}/api/embed/${service}?key=${publicKey}`)
                .then((res) => res.text())
                .then((html) => setWidgetHtml(html))
                .catch((err: unknown) => {
                    console.error('Failed to fetch status widget:', err);
                });
        };

        // Fetch immediately
        fetchWidget();

        // Set up interval to refresh every 5 minutes (300,000 ms)
        const interval = setInterval(fetchWidget, refreshRate * 60 * 1000);

        // Cleanup interval on unmount
        return () => clearInterval(interval);
    }, [service]);

    return <div className={className} dangerouslySetInnerHTML={{ __html: widgetHtml }} />;
}
