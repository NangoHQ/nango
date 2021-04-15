import Types from './types'

/**
 * Helper to build a new URL from different params
 */
export function toURL(origin: string, baseURL: string, endpoint: string, queryString?: Types.RequestQueryString): URL {
  const removeLeadingSlash = (text: string) => {
    return text.replace(/^\//, '')
  }

  const removeTrailingSlash = (text: string) => {
    return text.replace(/\/$/, '')
  }

  const urlParts: string[] = []
  urlParts.push(removeTrailingSlash(origin))
  urlParts.push(removeLeadingSlash(removeTrailingSlash(baseURL)))
  urlParts.push(removeLeadingSlash(endpoint))

  const url = new URL(urlParts.join('/'))

  if (queryString) {
    Object.keys(queryString).forEach(key => url.searchParams.append(key, String(queryString[key])))
  }

  return url
}

/**
 * Helper to remove all undefined keys
 * @param obj {object}
 */
export function cleanHeaders(obj: Record<string, any>) {
  return Object.keys(obj).reduce((acc, key: string) => {
    if (obj[key] !== undefined) {
      acc[key] = obj[key]
    }
    return acc
  }, {} as Record<string, any>)
}
