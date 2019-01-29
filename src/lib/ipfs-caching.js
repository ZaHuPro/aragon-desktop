const url = require('url')
const { promisify } = require('util')
const { IpfsConnector } = require('@akashaproject/ipfs-connector')
const { session } = require('electron')
const storage = require('./storage')

// 7 days is the default expiration time if the pinned hash is not accessed
const IPFS_EXPIRATION = 7

const ipfsInstance = IpfsConnector.getInstance()

// Simple promisified cache for pinning operations
let promisifiedIpfsPinAdd
let promisifiedIpfsPinRm
const ipfsPinAdd = (...args) => {
  if (!promisifiedIpfsPinAdd) {
    promisifiedIpfsPinAdd = promisify(ipfsInstance.api.ipfsApi.pin.add)
  }
  return promisifiedIpfsPinAdd(...args)
}
const ipfsPinRm = (...args) => {
  if (!promisifiedIpfsPinRm) {
    promisifiedIpfsPinRm = promisify(ipfsInstance.api.ipfsApi.pin.add)
  }
  return promisifiedIpfsPinRm(...args)
}

const ipfsFilter = {
  urls: ['https://localhost:8080/ipfs/*']
}

async function pinAragonClientForNetwork (newHash, network) {
  const storageKey = `${network}:aragon.aragonpm.eth`
  const storedHash = storage.get(storageKey)
  if (storedHash !== newHash) {
    await ipfsPinAdd(newHash)
    if (storedHash) {
      await ipfsPinRm(storedHash)
    }
    await storage.set(storageKey, { hash: newHash })
    console.log(`Pinned new client hash for ${network}:`, newHash)
  }
}

async function updateExpiration (hash) {
  const expirationDate = new Date()
  expirationDate.setDate((expirationDate.getDate() + IPFS_EXPIRATION))
  await storage.set(hash, { expiration: expirationDate.getTime() })
}

async function purgeUnusedIpfsResources () {
  const keys = await storage.keys()
  for (const key of keys) {
    const data = await storage.get(key)
    if (data.expiration) {
      if (data.expiration < new Date().getTime()) {
        await ipfsPinRm(hash)
        await storage.delete(hash)
      }
    }
  }
  console.log('Purged old IPFS resources')
}

function pinIpfsResources () {
  session.defaultSession.webRequest.onBeforeSendHeaders(ipfsFilter, (details, cb) => {
    const path = url.parse(details.url).path
    if (path.startsWith('/ipfs/')) {
      const hash = path.split('/')[2]
      if (!storage.has(hash)) {
        ipfsPinAdd(hash)
      }
      updateExpiration(hash)
      console.log('Pinned new IPFS resource:', hash)
    }
    cb({ cancel: false, requestHeaders: details.requestHeaders })
  })
}

module.exports = { pinAragonClientForNetwork, pinIpfsResources, purgeUnusedIpfsResources }
