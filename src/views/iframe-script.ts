import * as postRobot from 'post-robot'
import * as d from './types'
import { Storage } from './storage'

postRobot.send(window.parent, d.Events.SESSION_INITIALIZED)

// Has user authorized the service?
postRobot.on(
  d.Events.HAS_AUTHORIZED,
  (event: d.THasAuthorizedPayload): d.THasAuthorizedResponse => {
    console.debug('[BEARER]', 'hasAuthorized?', event.data)
    return {
      authorized: Storage.hasAuthorized(event.data.scenarioId, event.data.clientId)
    }
  }
)

// Revoke user access (remove local storage key for the moment)
postRobot.on(
  d.Events.REVOKE,
  (event: d.TLogoutPayload): void => {
    const { clientId, scenarioId, authId } = event.data
    Storage.revoke(scenarioId, clientId)
    fetch(`/v2/auth/${scenarioId}/revoke/${authId}?clientId=${clientId}`, {
      method: 'DELETE'
    })
      .then(response => {
        // 200 request
        if (response.ok) {
          postRobot.send(window.parent, d.Events.REVOKE_SUCCEEDED, event.data)
        } else {
          postRobot.send(window.parent, d.Events.REVOKE_FAILED, event.data)
        }
      })
      .catch(() => {
        postRobot.send(window.parent, d.Events.REVOKE_FAILED, event.data)
      })
  }
)
