import { Storage } from './storage'

function authenticate() {
  document.cookie = 'uuid=spongebob'
  document.cookie = 'session-uuid=spongebob'
}

describe('Storage', () => {
  beforeEach(() => {
    document.cookie = 'session-uuid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
  })
  describe('cookieUserId', () => {
    it('returns empty string if no current id set', () => {
      expect(Storage.cookieUserId).toBeFalsy()
    })

    it('returns uuid previously set', () => {
      document.cookie = 'uuid=spongebob'
      expect(Storage.cookieUserId).toEqual('spongebob')
    })
  })

  describe('storageUserId', () => {
    it('returns empty string if no current id set', () => {
      expect(Storage.storageUserId).toBeFalsy()
    })

    it('returns uuid previously set', () => {
      document.cookie = 'session-uuid=spongebob'
      expect(Storage.storageUserId).toEqual('spongebob')
    })
  })

  describe('isNewUser', () => {
    describe('new user', () => {
      it('returns true', () => {
        expect(Storage.isNewUser).toBe(true)
      })
    })

    describe('returning user', () => {
      it('same session', () => {
        authenticate()
        expect(Storage.isNewUser).toBe(false)
      })

      it('different session', () => {
        document.cookie = 'uuid=spongebob'
        document.cookie = 'session-uuid=patrick'
        expect(Storage.isNewUser).toBe(true)
      })
    })
  })
  describe('clearStorage', () => {
    it('clear everything and set uuid with the new userId', () => {
      document.cookie = 'uuid=cleaned-for-sponge-bob'
      document.cookie = 'session-uuid=patrick'
      Storage.clearStorage()
      expect(Storage.storageUserId).toEqual('cleaned-for-sponge-bob')
    })
  })
  describe('authorize | hasAuthorized', () => {
    const scenarioTarget = 'scenarioTarget'
    const integrationTarget = 'integrationTarget'
    const otherScenario = 'otherScenario'
    const otherIntegration = 'otherIntegration'

    beforeEach(() => {
      document.cookie = 'session-uuid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      authenticate()
      Storage.authorize(scenarioTarget, integrationTarget)
    })

    describe('known user', () => {
      it('not authorized then authorized', () => {
        // Only the correct one is authorized
        expect(Storage.hasAuthorized(scenarioTarget, integrationTarget)).toBe(
          true
        )
        expect(Storage.hasAuthorized(scenarioTarget, otherIntegration)).toBe(
          false
        )
        expect(Storage.hasAuthorized(otherScenario, integrationTarget)).toBe(
          false
        )
        expect(Storage.hasAuthorized(otherScenario, otherIntegration)).toBe(
          false
        )
      })
    })

    describe('new user', () => {
      // Everything is not authorized
      it('alaways return false', () => {
        document.cookie = 'uuid=unknow'

        expect(Storage.hasAuthorized(scenarioTarget, integrationTarget)).toBe(
          false
        )
        expect(Storage.hasAuthorized(scenarioTarget, otherIntegration)).toBe(
          false
        )
        expect(Storage.hasAuthorized(otherScenario, integrationTarget)).toBe(
          false
        )
        expect(Storage.hasAuthorized(otherScenario, otherIntegration)).toBe(
          false
        )
      })
    })
  })
  describe('ensureCurrentUser', () => {
    describe('new user', () => {
      it('clears storage', () => {})
    })

    describe('returning user', () => {
      it('does nothing', () => {})
    })
  })
})
