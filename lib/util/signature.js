'use strict'

const fs = require('fs')
const sshpk = require('sshpk')
const httpSignature = require('http-signature')
const axios = require('axios')

module.exports = class Signature {
	constructor(log, publicKeyUrl) {
		this.log = log
		this.publicKeyUrl = publicKeyUrl
		this.padlockSignature = true
	}

	/**
	 * Set the public key with raw text, or point to a file with the prefix `@`
	 *
	 * @param {String} certKey Key contents or key path
	 * @returns {Object} Public key
	 */
	setPublicKey(certKey) {
		this.padlockSignature = false
		if (certKey.startsWith('@')) {
			this.publicKey = fs.readFileSync(certKey.slice(1), 'utf8')
		} else {
			this.publicKey = certKey
		}
	}

	/**
	 * Checks if signature is valid
	 *
	 * @param {*} request HTTP request
	 * @returns {Boolean}
	 */
	async isAuthorized(request) {
		try {
			const parsed = httpSignature.parseRequest(request)
			if (this.padlockSignature && this.publicKeyId !== parsed.keyId) {
				const certKey = await axios.get(`${this.publicKeyUrl}${parsed.keyId}`)
				const pem = sshpk.parseCertificate(certKey, 'pem')
				this.publicKeyId = parsed.keyId
				this.publicKey = pem.subjectKey
			}

			const verifyResult = httpSignature.verifySignature(parsed, this.publicKey)
			if (!verifyResult) {
				this.log.error('forbidden - failed verifySignature')
				return false
			}
		} catch (error) {
			this.log.exception(error)
			return false
		}

		return true
	}
}
