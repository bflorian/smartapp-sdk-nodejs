'use strict'

const Base = require('./base')

module.exports = class Capabilities extends Base {
	list(query = {max: 500}) {
		return this.st.client.request('capabilities', 'GET', null, null, query)
	}

	versions(id) {
		return this.st.client.request(`capabilities/${id}`)
	}

	get(id, version) {
		return this.st.client.request(`capabilities/${id}/${version}`)
	}
}
