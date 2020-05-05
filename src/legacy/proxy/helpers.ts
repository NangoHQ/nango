import { AxiosRequestConfig, Method } from 'axios'
import querystring from 'querystring'
const METHODS_WITH_BODY = ['PUT', 'POST', 'PATCH', 'DELETE']

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
export function isObject(item: any) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
export function mergeDeep(target: any, ...sources: any): any {
  if (!sources.length) return target
  const source = sources.shift()

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} })
        mergeDeep(target[key], source[key])
      } else {
        Object.assign(target, { [key]: source[key] })
      }
    }
  }

  return mergeDeep(target, ...sources)
}

interface IBuildAxiosRequestParams {
  templateRequestConfig: any
  method: string
  headers: Record<string, string>
  path: string
  data: any
}

export const buildAxiosRequest = ({ templateRequestConfig, method, headers, path, data }: IBuildAxiosRequestParams) => {
  const axiosConfig: Partial<AxiosRequestConfig> = {
    headers,
    method: method as Method,
    url: path
  }

  let dataToSend: any
  if (headers && headers['content-type'] === 'application/x-www-form-urlencoded' && typeof data === 'object') {
    dataToSend = querystring.stringify(data)
  } else {
    dataToSend = data
  }

  if (METHODS_WITH_BODY.includes(method)) {
    axiosConfig.data = dataToSend
  }

  return mergeDeep(axiosConfig, templateRequestConfig) as AxiosRequestConfig
}

export const BACKEND_ONLY_ERROR = {
  code: 'UNAUTHORIZED_FUNCTION_CALL',
  message:
    // tslint:disable-next-line:max-line-length
    "This function can't be called from the frontend. If you want to call APIs from the frontend, please refer to this link for more information: https://docs.bearer.sh/integration-clients/javascript#calling-apis"
}
