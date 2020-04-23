import * as express from 'express'
import authV3 from '../auth/v3/router'
import { initializeDB } from '../lib/database'

const auth = express.Router()

auth.use('/', initializeDB, authV3())

export { auth }
