import { getConfig } from '../auth/clients/integrations'

class Integration {
  private _config!: any

  constructor(readonly buid: string) {}

  config = async () => {
    if (!this._config) {
      this._config = await getConfig({
        buid: this.buid
      })
    }
    return this._config
  }
}

export default Integration
