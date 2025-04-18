import type { Response } from 'express';

/**
 *
 * @remarks
 * Yes including a full HTML template here in a string goes against many best practices.
 * Yet it also felt wrong to add another dependency to simply parse 1 template.
 * If you have an idea on how to improve this feel free to submit a pull request.
 */
export function authHtml({ res, error }: { res: Response; error?: string }) {
    const resultHTML = `
<!--
Nango OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/nango
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
  </head>
  <body style="font-family: sans-serif;">
    <noscript>JavaScript is required to proceed with the authentication.</noscript>

    <div id="content" style="display: flex; width: 100vw; height: 100vh; align-items: center; justify-content: center; font-size: 14px; opacity: 0">
      <div>
        ${error ? `<div style="color: #ef665b;">An error occurred during authorization, please reach out to the support (code: ${error}).</div>` : '<div>You are now connected</div>'}
        <button onClick="closeWindow()" style="padding: 8px 16px; background-color: #4a5568; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">
          Close this window
        </button>
      </div>
    </div>

    <script type="text/javascript">
      function closeWindow() {
        window.open('', '_self').close();
      }

      // Close the modal
      window.setTimeout(function() {
        window.close();
      }, 300);
      // Try something else
      window.setTimeout(function() {
        closeWindow();
      }, 600);
      // Display message
      window.setTimeout(function() {
        document.getElementById('content').style.opacity = 1
      }, 1000);
    </script>
  </body>
</html>
`;

    if (error) {
        res.status(400);
    } else {
        res.status(200);
    }
    res.set('Content-Type', 'text/html');
    res.send(Buffer.from(resultHTML));
}
