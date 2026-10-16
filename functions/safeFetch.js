/**
 * Hardened server-side fetch for user-supplied calendar URLs (SSRF guard).
 *
 * - https only, standard port, no embedded credentials
 * - every resolved IP is checked against private / loopback / link-local /
 *   metadata ranges, and the connection is pinned to the checked address
 *   (via a custom `lookup`), so DNS rebinding can't swap in an internal IP
 * - redirects are followed manually and each hop is re-validated
 * - overall timeout and response size cap protect the shared instance
 */
const https = require('node:https')
const dns = require('node:dns')
const net = require('node:net')

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const USER_AGENT = 'MoodleTasks/1.0 (+https://github.com/yarintsukrun/MoodleTasks)'

class SafeFetchError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'SafeFetchError'
    this.code = code
    this.status = status
  }
}

// IPv4 rules also match IPv4-mapped IPv6 (::ffff:a.b.c.d), so no ::ffff:0:0/96
// rule is needed — adding one would block every IPv4 address.
const blockList = new net.BlockList()
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blockList.addSubnet(addr, prefix, 'ipv4')
}
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blockList.addSubnet(addr, prefix, 'ipv6')
}

function isBlockedAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return blockList.check(address, 'ipv4')
  if (family === 6) return blockList.check(address, 'ipv6')
  return true
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal']

/** Validate a user-supplied URL without network access. Returns a URL object. */
function parseAllowedUrl(raw) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    throw new SafeFetchError('invalid_url', 'That does not look like a valid URL.')
  }
  if (url.protocol !== 'https:') {
    throw new SafeFetchError('invalid_url', 'Only https:// calendar links are supported.')
  }
  if (url.username || url.password) {
    throw new SafeFetchError('invalid_url', 'Links with embedded credentials are not supported.')
  }
  if (url.port && url.port !== '443') {
    throw new SafeFetchError('invalid_url', 'Only the standard https port is supported.')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    !host ||
    host === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)) ||
    (net.isIP(host) && isBlockedAddress(host))
  ) {
    throw new SafeFetchError('blocked', 'That address is not allowed.')
  }
  return url
}

/** dns.lookup wrapper that refuses to connect to any blocked address. */
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(new SafeFetchError('blocked', 'That address is not allowed.'))
    }
    if (options && options.all) return callback(null, addresses)
    return callback(null, addresses[0].address, addresses[0].family)
  })
}

const agent = new https.Agent({ lookup: safeLookup })

function requestOnce(url, { maxBytes, deadline }) {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      reject(new SafeFetchError('timeout', 'The server took too long to respond.'))
      return
    }

    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }

    const req = https.get(
      url,
      {
        agent,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          finish(resolve, { location: res.headers.location })
          return
        }
        if (status < 200 || status >= 300) {
          res.resume()
          finish(reject, new SafeFetchError('bad_status', `Upstream responded with ${status}.`, status))
          return
        }
        const tooLarge = () => new SafeFetchError('too_large', 'The response is too large.')
        if (Number(res.headers['content-length']) > maxBytes) {
          req.destroy(tooLarge())
          return
        }
        const chunks = []
        let size = 0
        res.on('data', (chunk) => {
          size += chunk.length
          if (size > maxBytes) req.destroy(tooLarge())
          else chunks.push(chunk)
        })
        res.on('end', () => finish(resolve, { body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', (err) => finish(reject, toSafeError(err)))
      },
    )

    const timer = setTimeout(() => {
      req.destroy(new SafeFetchError('timeout', 'The server took too long to respond.'))
    }, remaining)
    req.on('error', (err) => finish(reject, toSafeError(err)))
  })
}

function toSafeError(err) {
  if (err instanceof SafeFetchError) return err
  return new SafeFetchError('network', 'Could not reach the server.')
}

/**
 * GET a user-supplied https URL and return the body as text.
 * Throws SafeFetchError with code: invalid_url | blocked | bad_status |
 * too_large | timeout | too_many_redirects | network. Messages never include
 * the URL (it carries the user's Moodle token).
 */
async function safeFetchText(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const deadline = Date.now() + timeoutMs
  let url = parseAllowedUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(url, { maxBytes, deadline })
    if (res.location === undefined) return res.body
    let next
    try {
      next = new URL(res.location, url)
    } catch {
      throw new SafeFetchError('invalid_url', 'The server sent an invalid redirect.')
    }
    url = parseAllowedUrl(next.toString())
  }
  throw new SafeFetchError('too_many_redirects', 'Too many redirects.')
}

module.exports = { safeFetchText, parseAllowedUrl, isBlockedAddress, SafeFetchError }
