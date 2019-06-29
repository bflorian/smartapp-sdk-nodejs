'use strict'

const httpSignature = require('http-signature')
const sshpk = require('sshpk')
const rp = require('request-promise-native')
const {Mutex} = require('async-mutex')
const responders = require('./util/responders')
const ApiContext = require('./util/api-context')
const Log = require('./util/log')
const OAuth = require('./platform/oauth')

module.exports = class SmartApp {
	/**
	 * @typedef {Object} ApiAppOptions
	 * @prop {String} appId
	 * @prop {String} clientId
	 * @prop {String} clientSecret
	 * @prop {String} redirectUrl
	 * @prop {Array.<String>|String} permissions
	 * @prop {String} apiUrl
	 * @prop {String} keyUrl
	 * @prop {String} refreshUrl
	 * @prop {String} logger
	 * @prop {number} jsonSpace
	 * @prop {Boolean} enableEventLogging
	 * @prop {String} publicKey
	 * @prop {Boolean} logUnhandledRejections
	 */
	/**
	 * Create an ApiApp instance
	 * @param {ApiAppOptions} [options] Optionally, pass in a configuration object
	 */
	constructor(options = {}) {
		this._appId = options.appId
		this._clientId = options.clientId
		this._clientSecret = options.clientSecret
		this._redirectUri = options.redirectUri
		this._log = new Log(options.logger, options.jsonSpace, options.enableEventLogging)
		this._permissions = options.permissions ? options.permissions : []
		this._subscribedEventHandlers = {}
		this._scheduledEventHandlers = {}
		this._uninstalledHandler = (() => {})
		this._oauthHandler = (() => {})
		this._deviceCommandHandler = null
		this._defaultDeviceCommandHandler = ((ctx, deviceId, cmd) => {
			this._log.warn(`No command handler for ${JSON.stringify(cmd)} of device ${deviceId}`)
		})
		this._deviceCommands = {}
		this._executeHandler = (() => {})
		this._localizationEnabled = false
		this._apiUrl = options.apiUrl ? options.apiUrl : 'https://api.smartthings.com'
		this._keyUrl = options.keyUrl ? options.keyUrl : 'https://key.smartthings.com'
		this._refreshUrl = options.refreshUrl ? options.refreshUrl : 'https://auth-global.api.smartthings.com/oauth/token'

		this._unhandledRejectionHandler = (reason => {
			this._log.exception(reason)
		})

		if (options.logUnhandledRejections !== false) {
			process.on('unhandledRejection', this._unhandledRejectionHandler)
		}

		if (options.contextStore) {
			this.contextStore(options.contextStore)
		}
	}

	/**
	 * Manually set the SmartThings API URL
	 * @param {String} url
	 * @default https://api.smartthings.com
	 * @returns {SmartApp} SmartApp instance
	 */
	apiUrl(url) {
		this._apiUrl = url
		return this
	}

	/**
	 * Manually set the refresh token URL
	 * @param {String} url
	 * @default https://auth-global.api.smartthings.com/oauth/token
	 * @returns {SmartApp} SmartApp instance
	 */
	refreshUrl(url) {
		this._refreshUrl = url
		return this
	}

	/**
	 * Set your smartapp automation's client id. Cannot be
	 * acquired until your app has been created through the
	 * Developer Workspace.
	 * @param {String} id
	 * @returns {SmartApp} SmartApp instance
	 */
	clientId(id) {
		this._clientId = id
		return this
	}

	/**
	 * Set your smartapp automation's client secret. Cannot be
	 * acquired until your app has been created through the
	 * Developer Workspace. This secret should never be shared
	 * or committed into a public repository.
	 * @param {String} secret
	 * @returns {SmartApp} SmartApp instance
	 */
	clientSecret(secret) {
		this._clientSecret = secret
		return this
	}

	redirectUri(uri) {
		this._redirectUri = uri
		return this
	}

	/**
	 * Set your app identifier for use elsewhere in the app
	 * @param {String} id A globally unique, developer-defined identifier
	 * for an app. It is alpha-numeric, may contain dashes, underscores,
	 * periods, and must be less then 250 characters long.
	 * @returns {SmartApp} SmartApp instance
	 */
	appId(id) {
		this._appId = id
		return this
	}

	configureLogger(logger, jsonSpace = null, enableEvents = false) {
		this._log = new Log(logger, jsonSpace, enableEvents)
		return this
	}

	enableEventLogging(jsonSpace = null, enableEvents = true) {
		this._log.enableEvents(jsonSpace, enableEvents)
		return this
	}

	/**
	 * Set app permissions as a string or array of strings.
	 *
	 * @example
	 * // sets single permission
	 * smartapp.permissions('r:devices:*')
	 * @example
	 * // sets multiple permissions
	 * smartapp.permissions('r:devices:* r:locations:*')
	 * @example
	 * // sets multiple permissions
	 * smartapp.permissions(['r:devices:*', 'r:locations:*'])
	 * @param {Array<String> | String} value
	 * @returns {SmartApp} SmartApp instance
	 */
	permissions(value) {
		this._permissions = value
		return this
	}

	/**
	 * Provide a custom context store used for storing in-flight credentials
	 * for each installed instance of the app.
	 *
	 * @param {*} value
	 * @example Use the AWS DynamoDB plugin
	 * smartapp.contextStore(new DynamoDBContextStore('aws-region', 'app-table-name'))
	 * @example
	 * // Use Firebase Cloud Firestore
	 * smartapp.contextStore(new FirestoreDBContextStore(firebaseServiceAccount, 'app-table-name'))
	 * @returns {SmartApp} SmartApp instance
	 */
	contextStore(value) {
		this._contextStore = value
		return this
	}

	/**
	 * Replaces the default unhandled rejection handler. If you don't want to have a default handler at
	 * all then instantiate the app with new SmartApp({logUnhandledRejections: false})
	 *
	 * @param {Function} callback when a promise rejection is not handled
	 * @returns {SmartApp} SmartApp instance */
	unhandledRejectionHandler(callback) {
		this._unhandledRejectionHandler = callback
		return this
	}

	/// /////////////
	// Uninstall  //
	/// /////////////

	uninstalled(callback) {
		this._uninstalledHandler = callback
		return this
	}

	/// ///////////
	// Events   //
	/// ///////////

	/**
	 * @typedef {Object} ModeEvent
	 * @property {String} eventId The id of the event
	 * @property {String} locationId The id of the location in which the event was triggered.
	 * @property {String} modeId The ID of the mode associated with a MODE_EVENT.
	 */

	/**
	 * @typedef {Object} DeviceEvent An event on a device that matched a subscription for this app.
	 * @property {String} eventId The ID of the event.
	 * @property {String} locationId The ID of the location in which the event was triggered.
	 * @property {String} deviceId The ID of the location in which the event was triggered.
	 * @property {String} componentId The name of the component on the device that the event is associated with.
	 * @property {String} capability The name of the capability associated with the DEVICE_EVENT.
	 * @property {String} attribute The name of the DEVICE_EVENT. This typically corresponds to an attribute name of the device-handler’s capabilities.
	 * @property {Object} value The value of the event. The type of the value is dependent on the capability's attribute type.
	 * @property {String} valueType The root level data type of the value field. The data types are representitive of standard JSON data types.
	 * @property {Boolean} stateChange Whether or not the state of the device has changed as a result of the DEVICE_EVENT.
	 * @property {Map} data json map as defined by capability data schema
	 * @property {String} subscriptionName The name of subscription that caused delivery.
	 */

	/**
	 * @typedef {Object} TimerEvent
	 * @property {String} eventId The ID of the event.
	 * @property {String} name The name of the schedule that caused this event.
	 * @property {Object} type
	 * @property {String} time The IS0-8601 date time strings in UTC that this event was scheduled for.
	 * @property {String} expression The CRON expression if the schedule was of type CRON.
	 */

	/**
	 * @callback EventCallback
	 * @param context { import('./util/endpoint-context') }
	 * @param {ModeEvent|DeviceEvent|TimerEvent} event
	 * @returns {EventCallback}
	 */

	/**
	 * Handler for named subscriptions to events
	 *
	 * @param {String} name Provide the name matching a created subscription
	 * @param {EventCallback} callback Callback handler object
	 * @returns {SmartApp} SmartApp instance
	 */
	subscribedEventHandler(name, callback) {
		this._subscribedEventHandlers[name] = callback
		return this
	}

	/**
	 * Handler for named subscriptions to **scheduled** events
	 *
	 * @param {String} name Provide the name matching a created subscription
	 * @param {Object} callback Callback handler object
	 * @returns {SmartApp} SmartApp instance
	 */
	scheduledEventHandler(name, callback) {
		this._scheduledEventHandlers[name] = callback
		return this
	}

	/**
	 * Handler for device commands
	 *
	 * @param {Object} callback Callback handler object
	 * @returns {SmartApp} SmartApp instance
	 */
	deviceCommandHandler(callback) {
		this._deviceCommandHandler = callback
		return this
	}

	/**
	 * Handler for device commands
	 *
	 * @param {Object} callback Callback handler object
	 * @returns {SmartApp} SmartApp instance
	 */
	defaultDeviceCommandHandler(callback) {
		this._defaultDeviceCommandHandler = callback
		return this
	}

	/**
	 * Device command and callback
	 *
	 * @param {String} command Device command
	 * @param {Object} callback Callback handler object
	 * @returns {SmartApp} SmartApp instance
	 */
	deviceCommand(command, callback) {
		this._deviceCommands[command] = callback
		return this
	}

	/// //////////////
	// Utilities   //
	/// //////////////

	/**
	 * Use with a standard HTTP webhook endpoint app. Signature verification is required.
	 *
	 * @param {*} request
	 * @param {*} response
	 */
	async handleOAuthCallback(request) {
		const auth = await new OAuth(this).redeemCode(request.query.code)
		const ctx = await this.withContext({
			installedAppId: auth.installed_app_id,
			authToken: auth.access_token,
			refreshToken: auth.refresh_token
		})

		const isa = await ctx.api.installedApps.get(auth.installed_app_id)
		ctx.setLocationId(isa.locationId)

		if (this._contextStore) {
			this._contextStore.put(ctx)
		}

		return ctx
	}

	async _isAuthorized(req) {
		try {
			const parsed = httpSignature.parseRequest(req)
			if (this._certKeyId !== parsed.keyId) {
				this._certKeyId = parsed.keyId
				this._certKey = await this._getCertificate(parsed.keyId)
			}

			const par = sshpk.parseCertificate(this._certKey, 'pem')
			const verifyResult = httpSignature.verifySignature(parsed, par.subjectKey)
			if (!verifyResult) {
				this._log.error('forbidden - failed verifySignature')
				return false
			}
		} catch (error) {
			this._log.error(`Error verifying request ${JSON.stringify(error, null, 2)}`)
			return false
		}

		return true
	}

	async _getCertificate(keyId) {
		return rp.get(`${this._keyUrl}${keyId}`)
	}

	/**
	 * Use with a standard HTTP webhook endpoint app. Signature verification is required.
	 *
	 * @param {*} request
	 * @param {*} response
	 */
	handleEventCallback(request, response) {
		if (this._isAuthorized(request)) {
			this._handleCallback(request.body, responders.httpResponder(response, this._log))
		} else {
			response.status(401).send('Forbidden')
		}
	}

	/**
	 * Use with a standard HTTP webhook endpoint app, but
	 * disregard the HTTP verification process.
	 *
	 * @param {*} request
	 * @param {*} response
	 */
	handleHttpCallbackUnverified(request, response) {
		this._handleCallback(request.body, responders.httpResponder(response, this._log))
	}

	/**
	 * Used for internal unit testing.
	 *
	 * @param {Object} body
	 */
	async handleMockCallback(body) {
		const responder = responders.mockResponder(this._log)
		await this._handleCallback(body, responder)
		return responder.response
	}

	/**************************************************************
	 ** Proactive API calls (not in response to lifecycle events **
	 **************************************************************/

	async withContext(installedAppIdOrObject) {
		if (typeof installedAppIdOrObject === 'object') {
			return new ApiContext(this, installedAppIdOrObject, new Mutex())
		}

		const data = await this._contextStore.get(installedAppIdOrObject)

		return new ApiContext(this, data, new Mutex())
	}

	/************************
	 ** Event Dispatching  **
	 ************************/

	async _handleCallback(body, responder) {
		const {messageType} = body
		switch (messageType) {
			case 'EVENT': {
				const {eventData} = body
				const {installedAppId} = eventData.installedApp
				const context = await this.withContext(installedAppId)
				const results = []
				for (const event of eventData.events) {
					switch (event.eventType) {
						case 'INSTALLED_APP_LIFECYCLE_EVENT': {
							const {installedAppLifecycleEvent} = event
							switch (installedAppLifecycleEvent.lifecycle) {
								case 'DELETE':
									this._uninstalledHandler(context, event)
									break
								default:
									this._log.debug(`Unhandled installed app lifecycle event '${installedAppLifecycleEvent.lifecycle}`)
							}

							break
						}

						case 'DEVICE_EVENT': {
							const handlerName = event.deviceEvent.subscriptionName.split('_')[0]
							const handler = this._subscribedEventHandlers[handlerName]
							results.push(handler(context, event.deviceEvent))
							break
						}

						case 'TIMER_EVENT': {
							const handlerName = event.timerEvent.name
							const handler = this._scheduledEventHandlers[handlerName]
							results.push(handler(context, event.timerEvent))
							break
						}

						case 'DEVICE_COMMANDS_EVENT': {
							if (this._deviceCommandHandler) {
								results.push(this._deviceCommandHandler(context, event.deviceCommandsEvent))
							} else {
								const {deviceCommandsEvent} = event
								for (const cmd of deviceCommandsEvent.commands) {
									const compKey = `${cmd.componentId}/${cmd.capability}/${cmd.command}`
									const capKey = `${cmd.capability}/${cmd.command}`
									let handler = this._deviceCommands[compKey]
									if (!handler) {
										handler = this._deviceCommands[capKey]
									}

									if (handler) {
										results.push(handler(context, deviceCommandsEvent.deviceId, cmd, deviceCommandsEvent))
									} else {
										this._defaultDeviceCommandHandler(context, deviceCommandsEvent.deviceId, cmd)
									}
								}
							}

							break
						}

						case 'MODE_EVENT': {
							// TODO - there is no mode handler name!!!
							const handlerName = 'modeChangeHandler'
							const handler = this._subscribedEventHandlers[handlerName]
							results.push(handler(context, event.modeEvent))
							break
						}

						case 'SECURITY_ARM_STATE_EVENT': {
							// TODO - name specified but not returned!!!
							// const handlerName = event.securityArmStateEvent.name
							const handlerName = 'securityArmStateHandler'
							const handler = this._subscribedEventHandlers[handlerName]
							results.push(handler(context, event.securityArmStateEvent))
							break
						}

						default: {
							this._log.warn(`Unhandled event of type ${event.eventType}`)
						}
					}
				}

				await Promise.all(results)
				responder.respond({statusCode: 200, eventData: {}})
				break
			}

			default:
				break
		}
	}
}
