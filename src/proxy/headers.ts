const hopByHopHeaders = [
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'authorization',
  'x-forwarded-for' // to avoid sending the origin IP to the provider (because the rate limiting)
]

const connection = 'connection'
const BEARER_PREFIX = 'bearer-'
const AMAZON_PREFIX = 'x-amzn'

export const stripHopByHopHeaders = function(requestHeaders: any) {
  const requestHeadersCopy = Object.assign({}, requestHeaders)
  hopByHopHeaders.forEach((hopByHopHeaderName: string) => {
    delete requestHeadersCopy[hopByHopHeaderName]
  })
  stripConnectionHeaders(requestHeadersCopy)
  stripHttp2AndBearerHeaders(requestHeadersCopy)
  return requestHeadersCopy
}

const stripHttp2AndBearerHeaders = function(requestHeaders: any) {
  Object.keys(requestHeaders).forEach((headerName: string) => {
    if (headerName.includes(':') || headerName.startsWith(BEARER_PREFIX) || headerName.startsWith(AMAZON_PREFIX)) {
      delete requestHeaders[headerName.trim()]
    }
  })
}

const stripConnectionHeaders = function(requestHeaders: any) {
  let connectionHeaders = requestHeaders[connection]
  if (connectionHeaders) {
    connectionHeaders = lowercaseHeaders(connectionHeaders.split(','))
    delete requestHeaders[connection]
    connectionHeaders.forEach((connectionHeader: string) => {
      delete requestHeaders[connectionHeader.trim()]
    })
  }

  return requestHeaders
}

const lowercaseHeaders = function(headers: string[]): string[] {
  return headers.map((header: string) => {
    return header.toLowerCase()
  })
}
