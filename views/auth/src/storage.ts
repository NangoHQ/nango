const COOKIE_KEY = 'uuid'
const USER_KEY = 'session-uuid'
import * as Cookies from 'js-cookie'

export class Storage {
  static get cookieUserId(): string {
    return getCookie(COOKIE_KEY) || ''
  }

  static get storageUserId(): string {
    return getCookie(USER_KEY)
  }

  static get isNewUser(): boolean {
    return this.cookieUserId !== this.storageUserId
  }

  static clearStorage(): void {
    console.debug('[BEARER]', 'clearing Storage')
    const uuid = getCookie(COOKIE_KEY)
    const cookies = Cookies.get()
    let k
    for (k in cookies) {
      removeCookie(k)
    }
    setCookie(COOKIE_KEY, uuid)
    setCookie(USER_KEY, this.cookieUserId)
  }

  static authorize(scenarioId: string, clientId: string): void {
    setCookie(scenarioAuthorizationKey(scenarioId, clientId), true)
  }

  static revoke(scenarioId: string, clientId: string): void {
    removeCookie(scenarioAuthorizationKey(scenarioId, clientId))
  }

  static hasAuthorized(scenarioId: string, clientId: string): boolean {
    if (this.isNewUser) {
      return false
    }
    return !!getCookie(scenarioAuthorizationKey(scenarioId, clientId))
  }

  static ensureCurrentUser(): void {
    if (this.isNewUser) {
      this.clearStorage()
    }
  }
}

function scenarioAuthorizationKey(scenarioId: string, clientId: string) {
  return [scenarioId, clientId].join('|')
}

function getCookie(name) {
  return Cookies.get(name)
}

function setCookie(name, value) {
  Cookies.set(name, value)
}

function removeCookie(name) {
  Cookies.remove(name)
}
