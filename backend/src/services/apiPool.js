'use strict';

/**
 * API credential pool with round-robin rotation.
 *
 * Telegram requires an (api_id, api_hash) pair per client. To spread load and
 * avoid tying every session to a single credential, we keep a pool of pairs
 * and hand them out round-robin via getNext().
 *
 * Credentials are read from the TELEGRAM_API_POOL env var as a JSON array of
 * { apiId, apiHash } objects, or from the single TELEGRAM_API_ID /
 * TELEGRAM_API_HASH pair as a fallback.
 */

function loadPool() {
  const raw = process.env.TELEGRAM_API_POOL;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((p) => ({
          apiId: Number(p.apiId ?? p.api_id),
          apiHash: String(p.apiHash ?? p.api_hash),
        }));
      }
    } catch (err) {
      // fall through to single-credential mode
      console.warn('Invalid TELEGRAM_API_POOL JSON, ignoring:', err.message);
    }
  }

  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (apiId && apiHash) {
    return [{ apiId: Number(apiId), apiHash: String(apiHash) }];
  }

  // No credentials configured. Return an empty pool; callers surface a clear
  // error when they try to build a client.
  return [];
}

class ApiPool {
  constructor(credentials = loadPool()) {
    this.credentials = credentials;
    this._index = 0;
  }

  get size() {
    return this.credentials.length;
  }

  /**
   * Return the next credential pair in round-robin order.
   * @returns {{apiId:number, apiHash:string}}
   */
  getNext() {
    if (!this.credentials.length) {
      throw new Error(
        'No Telegram API credentials configured. Set TELEGRAM_API_ID/TELEGRAM_API_HASH or TELEGRAM_API_POOL.'
      );
    }
    const cred = this.credentials[this._index % this.credentials.length];
    this._index += 1;
    return cred;
  }

  /** Pool status snapshot for the settings/API-pool UI. */
  status() {
    return {
      size: this.credentials.length,
      current: this.credentials.length ? this._index % this.credentials.length : 0,
      // Never leak the hash; expose only the id and a masked hash.
      credentials: this.credentials.map((c) => ({
        apiId: c.apiId,
        apiHash: c.apiHash ? `${c.apiHash.slice(0, 4)}…` : null,
      })),
    };
  }
}

const apiPool = new ApiPool();

module.exports = { apiPool, ApiPool };
