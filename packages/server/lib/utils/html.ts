import type { Request, Response } from 'express';

const PROVIDER_ERROR_QUERY_KEYS = ['error', 'error_description', 'error_reason', 'error_uri', 'status_code', 'error_message'] as const;

function getProviderErrorObjectFromQuery(res: Response): Record<string, string> | null {
    const req = (res as Response & { req?: Request }).req;
    const query = req?.query as Record<string, string | undefined> | undefined;
    if (!query) return null;
    const obj: Record<string, string> = {};
    for (const key of PROVIDER_ERROR_QUERY_KEYS) {
        const value = query[key];
        if (value != null && String(value).trim() !== '') {
            obj[key] = String(value).trim();
        }
    }
    return Object.keys(obj).length > 0 ? obj : null;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 *
 * @remarks
 * Yes including a full HTML template here in a string goes against many best practices.
 * Yet it also felt wrong to add another dependency to simply parse 1 template.
 * If you have an idea on how to improve this feel free to submit a pull request.
 */
export function authHtml({ res, error, errorType = 'connection_validation_failed' }: { res: Response; error?: string; errorType?: string }) {
    const providerErrorObj = getProviderErrorObjectFromQuery(res);
    const hasProviderError = providerErrorObj !== null && Object.keys(providerErrorObj).length > 0;
    const hasServerError = error != null && error !== '';
    const hasError = hasServerError || hasProviderError;
    const detailsContent = hasProviderError ? JSON.stringify(providerErrorObj) : (error ?? 'Unknown error');
    const messageToOpener = hasProviderError ? JSON.stringify(providerErrorObj) : (error ?? null);
    const errorPayload =
        hasError && messageToOpener
            ? JSON.stringify({ message: messageToOpener, errorType })
                  .replace(/\u2028/g, '\\u2028')
                  .replace(/\u2029/g, '\\u2029')
                  .replace(/</g, '\\u003c')
                  .replace(/>/g, '\\u003e')
                  .replace(/&/g, '\\u0026')
            : 'null';

    const errorDetailsBlock = hasError
        ? `
        <div style="margin-top: 24px; width: 100%; align-self: stretch; box-sizing: border-box; min-width: 0;">
          <button id="toggleDetails" type="button" style="cursor: pointer; width: 100%; padding: 12px 16px; font-size: 14px; font-weight: 500; border: none; border-radius: 8px; background: #262626; color: #a3a3a3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
            <span id="toggleText">Show error details</span>
            <span id="chevron" class="nango-chevron nango-chevron-down"><svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M0 0 L5 6 L10 0" /></svg></span>
          </button>
          <div id="errorDetails" style="display: none; margin-top: 0; padding: 14px 16px; background: #1f1f1f; border-radius: 0 0 8px 8px; font-size: 13px; line-height: 1.5; font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; color: #ef4444; border: 1px solid #262626; border-top: none; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; overflow-x: auto; text-align: left;">${escapeHtml(detailsContent)}</div>
        </div>
        `
        : '';

    const successContent = `
      <noscript>JavaScript is required to proceed with the authentication.</noscript>
      <div style="text-align: center;">
        <p style="color: #fff; font-size: 18px; margin: 0 0 40px 0; font-weight: 600;">Successful connection <span style="color: #22c55e;">✅</span></p>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">You can close this window.</p>
      </div>`;

    const errorContent = `
      <noscript>JavaScript is required to proceed with the authentication.</noscript>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; text-align: center; width: 100%; max-width: 480px; box-sizing: border-box;">
        <h2 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; letter-spacing: -0.025em; line-height: 1.3;">Connection failed <span style="color: #ef4444;">✕</span></h2>
        <p style="color: #a3a3a3; font-size: 15px; margin: 0 0 4px 0; line-height: 1.5;">An error occurred during authorization.</p>
        <p style="color: #a3a3a3; font-size: 15px; margin: 0 0 0 0; line-height: 1.5;">Please reach out to our support team.</p>
        ${errorDetailsBlock}
        <p style="color: #6b7280; font-size: 14px; margin: 28px 0 0 0; line-height: 1.4;">You can close this window.</p>
        <div id="nangoDebug" style="display: none; margin-top: 24px; padding: 16px; background: #2d2d2d; border-radius: 8px; text-align: left; max-width: 100%; font-size: 12px; font-family: monospace; color: #e5e7eb;">
          <p style="margin: 0 0 8px; font-weight: bold;">Debug (add ?nango_debug=1 to callback URL to show):</p>
          <p id="nangoDebugSteps" style="margin: 0 0 8px;"></p>
          <p id="nangoDebugOpener" style="margin: 0 0 8px;"></p>
          <p style="margin: 0 0 4px; font-weight: bold;">Full URL:</p>
          <p id="nangoDebugUrl" style="margin: 0 0 8px; word-break: break-all;"></p>
          <p style="margin: 0 0 4px; font-weight: bold;">Query params:</p>
          <pre id="nangoDebugParams" style="margin: 0; white-space: pre-wrap; word-break: break-all;"></pre>
        </div>
      </div>`;

    const bodyStyle =
        'font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0a0a0a; min-height: 100vh; display: flex; align-items: center; justify-content: center;';

    const resultHTML = `
<!--
Nango OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/nango
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>.nango-chevron { display: inline-flex; align-items: center; vertical-align: middle; } .nango-chevron.nango-chevron-up svg { transform: rotate(180deg); }</style>
  </head>
  <body style="${bodyStyle}">
  ${hasError ? errorContent : successContent}
    <script type="text/javascript">
      window.__nangoOAuthError = ${errorPayload};
      var showDebug = window.location.search.indexOf('nango_debug=1') !== -1;
      var stepNum = 0;
      function debugStep(label) {
        stepNum++;
        var el = document.getElementById('nangoDebugSteps');
        if (el) { el.textContent = (el.textContent || '') + stepNum + '. ' + label + ' '; }
      }
      function debugUrlAndParams() {
        var urlEl = document.getElementById('nangoDebugUrl');
        var paramsEl = document.getElementById('nangoDebugParams');
        if (urlEl) urlEl.textContent = window.location.href || '(empty)';
        var params = {};
        try {
          var search = window.location.search;
          if (search && search.indexOf('?') === 0) {
            search.slice(1).split('&').forEach(function(pair) {
              var i = pair.indexOf('=');
              var k = i === -1 ? pair : decodeURIComponent(pair.slice(0, i));
              var v = i === -1 ? '' : decodeURIComponent(pair.slice(i + 1));
              params[k] = v;
            });
          }
        } catch (e) { params = { _error: String(e) }; }
        if (paramsEl) paramsEl.textContent = JSON.stringify(params, null, 2);
      }
      if (showDebug) {
        var debugEl = document.getElementById('nangoDebug');
        if (debugEl) debugEl.style.display = 'block';
        debugStep('script_start');
        debugUrlAndParams();
        debugStep('url_printed');
      }
      var openerEl = document.getElementById('nangoDebugOpener');
      if (openerEl) openerEl.textContent = 'window.opener: ' + (window.opener ? 'present' : 'null');
      function closeWindow() {
        try { window.close(); } catch (e) {}
        try { window.open('', '_self').close(); } catch (e) {}
      }
      function notifyOpener(type, payload) {
        try {
          if (window.opener) {
            window.opener.postMessage(payload ? { type: type, payload: payload } : { type: type }, '*');
          }
        } catch (e) {}
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            var ch = new BroadcastChannel('nango-oauth-callback');
            ch.postMessage(payload ? { type: type, payload: payload } : { type: type });
            ch.close();
          }
        } catch (e) {}
      }
      var toggleBtn = document.getElementById('toggleDetails');
      var errorDetails = document.getElementById('errorDetails');
      var toggleText = document.getElementById('toggleText');
      var chevron = document.getElementById('chevron');
      if (toggleBtn && errorDetails && toggleText && chevron) {
        toggleBtn.addEventListener('click', function() {
          var isHidden = errorDetails.style.display === 'none';
          errorDetails.style.display = isHidden ? 'block' : 'none';
          toggleText.textContent = isHidden ? 'Hide error details' : 'Show error details';
          chevron.className = isHidden ? 'nango-chevron nango-chevron-up' : 'nango-chevron nango-chevron-down';
          toggleBtn.style.borderRadius = isHidden ? '8px 8px 0 0' : '8px';
        });
      }
      window.addEventListener('message', function(evt) {
        if (evt.data && evt.data.type === 'nango_oauth_callback_ack') {
          // connect ui has processed our message, now we close
          closeWindow();
        }
      });
      // Server renders this page without error only on success (OAuth2 code, OAuth1 token/verifier, GitHub App install_id, etc.)
      if (window.__nangoOAuthError) {
        notifyOpener('nango_oauth_callback_error', window.__nangoOAuthError);
      } else {
        notifyOpener('nango_oauth_callback_success');
      }
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
