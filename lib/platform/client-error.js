'use strict'

module.exports = class ClientError {
	constructor(error) {
		const {name, message, response} = error
		const {statusCode, request} = response
		const {href, body} = request

		this.name = name === 'StatusCodeError' ? 'SmartThingsApiError' : name
		this.statusCode = statusCode
		this.message = messageString(message)
		this.url = href
		this.body = body
		this.cause = error
	}

	toString() {
		const stack = this.cause && this.cause.stack ? '\n' + this.cause.stack : ''
		if (this.body) {
			return `${this.name}: ${this.message}, statusCode=${this.statusCode}, url=${this.url}, body=${this.body}${stack}`
		}

		return `${this.name}: ${this.message}, statusCode=${this.statusCode}, url=${this.url}${stack}`
	}
}

function messageString(msg) {
	if (typeof msg === 'object') {
		return JSON.stringify(msg)
	}

	return msg
}
