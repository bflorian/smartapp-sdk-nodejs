'use strict'

const i18n = require('i18n')
const SmartThingsApi = require('../api')

module.exports = class ApiContext {
	constructor(app, body, apiMutex) {
		this.event = body
		this.app = app;
		this.apiMutex;

		const {messageType} = body;
		switch (messageType) {
			case 'EVENT':
				this.installedAppId = body.eventData.installedApp.installedAppId
				this.locationId = body.eventData.installedApp.locationId
				break

			case 'EXECUTE':
				this.installedAppId = body.executeData.installedApp.installedAppId
				this.locationId = body.executeData.installedApp.locationId
				break

			default:
				this.installedAppId = body.installedAppId
				this.locationId = body.locationId
				this.authToken = body.authToken
				this.refreshToken = body.refreshToken
				this.api = new SmartThingsApi({
					authToken: body.authToken,
					refreshToken: body.refreshToken,
					clientId: app._clientId,
					clientSecret: app._clientSecret,
					log: app._log,
					apiUrl: app._apiUrl,
					refreshUrl: app._refreshUrl,
					locationId: body.locationId,
					installedAppId: body.installedAppId,
					contextStore: app._contextStore,
					apiMutex: apiMutex
				})
				break
		}
	}

	setLocationId(id) {
		this.locationId = id
		if (this.api) {
			this.api.locationId = id
		}
	}

	async getApi() {
		if (!this.api) {
			const app = this.app;
			const data = await app._contextStore.get(this.installedAppId)
			this.authToken = data.authToken
			this.refreshToken = data.refreshToken
			this.locationId = data.locationId
			this.api = new SmartThingsApi({
				authToken: data.authToken,
				refreshToken: data.refreshToken,
				clientId: app._clientId,
				clientSecret: app._clientSecret,
				log: app._log,
				apiUrl: app._apiUrl,
				refreshUrl: app._refreshUrl,
				locationId: this.locationId || data.locationId,
				installedAppId: this.installedAppId,
				contextStore: app._contextStore,
				apiMutex: this.apiMutex
			})
		}
		return this.api
	}
}
