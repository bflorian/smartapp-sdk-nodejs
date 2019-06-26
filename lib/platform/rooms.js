'use strict'

const Base = require('./base')

module.exports = class Rooms extends Base {
	list() {
		return this.st.client.request(`locations/${this.st.locationId}/rooms`)
	}

	get(id) {
		return this.st.client.request(`locations/${this.st.locationId}/rooms/${id}`)
	}

	update(id, data) {
		return this.st.client.request(`locations/${this.st.locationId}/rooms/${id}`, 'PUT', data)
	}
}
