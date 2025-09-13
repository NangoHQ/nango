import { useState, useEffect } from 'react';

export const StatusWidget = ({ service }) => {
  const [widgetHtml, setWidgetHtml] = useState('');
  const apiDownWatchPublicKey = 'pk_wDkTwEJORAN3jhVBZoSyIGObbcE77JrRKnZ-bgQtq6c';
  //const apiDownWatchHost = 'https://api.apidownwatch.com';
  const apiDownWatchHost = 'http://localhost:8080';
  const refreshRate = 5;

  useEffect(() => {
      const fetchWidget = () => {
          fetch(`${apiDownWatchHost}/api/embed/${service}?key=${apiDownWatchPublicKey}`)
              .then((res) => res.text())
              .then((html) => setWidgetHtml(html))
              .catch((err) => {
                  console.error('Failed to fetch status widget:', err);
              });
      };

      fetchWidget();

      const interval = setInterval(fetchWidget, refreshRate * 60 * 1000);

      return () => clearInterval(interval);
  }, [service]);

  return <div className="mb-1 -mt-8" dangerouslySetInnerHTML={{ __html: widgetHtml }} />;
}

