import { useState, useEffect } from 'react';

export const StatusWidget = ({ service }) => {
  const [widgetHtml, setWidgetHtml] = useState('');
  const apiDownWatchPublicKey = 'pk_wDkTwEJORAN3jhVBZoSyIGObbcE77JrRKnZ-bgQtq6c';
  //const apiDownWatchHost = 'https://api.apidownwatch.com';
  const apiDownWatchHost = 'http://localhost:8080';

  useEffect(() => {
    fetch(`${apiDownWatchHost}/api/embed/${service}?key=${apiDownWatchPublicKey}`)
      .then(response => response.text())
      .then(html => setWidgetHtml(html));
  }, [service]);

  return <div className="mb-3" dangerouslySetInnerHTML={{ __html: widgetHtml }} />;
}

