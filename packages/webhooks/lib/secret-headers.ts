/** The header a provider that does not sign its webhooks sends the connection's Nango webhook secret in. */
export const NANGO_WEBHOOK_SECRET_HEADER = 'x-nango-webhook-secret';
/** Telegram sends a bot's webhook secret back in its own header, so that header carries the connection's secret too. */
export const TELEGRAM_SECRET_TOKEN_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Incoming headers that carry a connection's webhook secret. The server redacts them from the request it logs
 * and hands to webhook functions, and they are never forwarded.
 */
export const WEBHOOK_SECRET_HEADERS = [NANGO_WEBHOOK_SECRET_HEADER, TELEGRAM_SECRET_TOKEN_HEADER];
