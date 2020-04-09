import * as postRobot from 'post-robot'
import { Events } from './types'
import { Storage } from './storage'

declare const window: Window & {
  authError?: string
  authErrorDescription?: string
}
// Reset uuid and clear local storage if no existing session
Storage.ensureCurrentUser()

// Integration should be provided at some point to scope authorizations
Storage.authorize(window['scenarioId'], '')
if (window.authError) {
  postRobot
    .send(window.opener, Events.REJECTED, {
      scenarioId: window['scenarioId'],
      authId: window['authId']
    })
    .then(() => {
      window.close()
    })
    .catch(error => {
      console.error(error)
      window.close()
    })
} else {
  // Tell the world the user has authorized the scenario
  postRobot
    .send(window.opener, Events.AUTHORIZED, {
      scenarioId: window['scenarioId'],
      authId: window['authId']
    })
    .then(() => {
      window.close()
    })
    .catch(error => {
      console.error(error)
      window.close()
    })
}
