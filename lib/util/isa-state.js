'use strict'

const map = Symbol('private')

module.exports = class IsaState {
	constructor(installedAppId, contextStore) {
		this.installedAppId = installedAppId
		this.contextStore = contextStore
		this[map] = null
	}

	async get(name) {
		if (this[map] === null) {
			this[map] = await this.api.contextStore.get(this.installedAppId)
		}

		if (name) {
			return this[map][name]
		}

		return this[map]
	}

	set(map) {
		this[map] = map
	}

	async update(name, value) {
		return this.api.contextStore.update(this.installedAppId, {state: {name: value}})
	}

	save() {
		return this.api.contextStore.update(this.installedAppId, {state: this[map]})
	}
}
