export const { COOKIE_SECRET, HOSTNAME } = process.env as {
  COOKIE_SECRET: string
  HOSTNAME: string
}

export const AUTH_CALLBACK_URL = `https://${HOSTNAME}/v2/auth/callback`

// const AUTH_VHOST = `https://${AUTH_SUBDOMAIN}.${HOSTNAME}`
// const PROXY_VHOST = `https://${PROXY_SUBDOMAIN}.${HOSTNAME}`
