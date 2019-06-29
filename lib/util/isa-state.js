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
			const ctx = await this.contextStore.get(this.installedAppId)
			this[map] = ctx.state
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
		await this.contextStore.update(this.installedAppId, {state: {name: value}})
		putSegmentedName(name, value)
	}

	save() {
		return this.contextStore.update(this.installedAppId, {state: this[map]})
	}
}

function putSegmentedName(name, value) {
	let item = this[map]
	const segs = name.split('.')
	const key = segs[segs.length - 1]
	if (segs.length > 1) {
		for (let i = 0; i < segs.length - 1; i++) {
			item = item[segs[i]]
		}
	}

	item[key] = value
}
