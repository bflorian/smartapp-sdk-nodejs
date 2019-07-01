'use strict'

const axios = require('axios')
const qs = require('query-string')
const Base = require('./base')

module.exports = class OAuth extends Base {
	redeemCode(code) {
		const options = {
			url: `${this.st._apiUrl}/oauth/token`,
			method: 'POST',
			headers: {
				'Authorization': `Basic ${Buffer.from(this.st._clientId + ':' + this.st._clientSecret).toString('base64')}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			data: qs.stringify({
				client_id: this.st._clientId,
				code,
				grant_type: 'authorization_code',
				redirect_uri: this.st._redirectUri
			})
		}
		return axios(options)
	}
}
