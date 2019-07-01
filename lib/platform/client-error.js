'use strict'

module.exports = class ClientError {
	constructor(error) {
		const {name, message, request, response} = error
		const {status, config} = response
		const {url, data} = config

		this.name = name === 'StatusCodeError' ? 'SmartThingsApiError' : name
		this.statusCode = status
		this.message = messageString(message)
		this.url = url
		this.body = data
		this.cause = error
	}

	toString() {
		const stack = this.cause && this.cause.stack ? '\n' + this.cause.stack : ''
		if (this.body) {
			return `${this.name}: ${this.message}, statusCode=${this.status}, url=${this.url}, body=${this.body}${stack}`
		}

		return `${this.name}: ${this.message}, statusCode=${this.status}, url=${this.url}${stack}`
	}
}

function messageString(msg) {
	if (typeof msg === 'object') {
		return JSON.stringify(msg)
	}

	return msg
}
