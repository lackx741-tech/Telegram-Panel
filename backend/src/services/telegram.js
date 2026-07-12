'use strict';

/**
 * TelegramService — GramJS-backed Telegram operations.
 *
 * This is the Node.js port of MODULE579's Telethon-based operations
 * (src/actions.py). Every method builds a short-lived GramJS client from a
 * StringSession, connects, performs one operation, and disconnects — matching
 * the existing connect()/disconnect() lifecycle used elsewhere in the panel.
 *
 * The bulk wrapper (executeBulkOperation) mirrors the Python
 * `execute_bulk_operation`: bounded concurrency, per-account error isolation,
 * FloodWait handling, revoked-session detection, and a random inter-op delay.
 */

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { FloodWaitError } = require('telegram/errors');

const { apiPool } = require('./apiPool');
const { parseTelegramLink } = require('../utils/parseTelegramLink');

/** Reactions supported by the UI. */
const SUPPORTED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

/**
 * Detect whether an error indicates a revoked / unregistered session.
 * Ported from utils.is_session_revoked_error.
 * @param {Error} error
 * @returns {boolean}
 */
function isSessionRevokedError(error) {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  const type = String(error.constructor && error.constructor.name || '').toLowerCase();
  const keywords = [
    'session revoked',
    'revoked',
    'not logged in',
    'auth key',
    'authorization',
    'key is not registered',
    'unregistered',
    'invalidated',
    'auth_key_unregistered',
    'session_revoked',
    'user_deactivated',
  ];
  return (
    keywords.some((k) => msg.includes(k)) ||
    ['revoked', 'unregistered'].some((k) => type.includes(k))
  );
}

/** Sleep for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random float in [min, max]. */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

class SessionRevokedError extends Error {
  constructor(message = 'Session revoked or unregistered') {
    super(message);
    this.name = 'SessionRevokedError';
    this.revoked = true;
  }
}

class TelegramService {
  /**
   * @param {object} [opts]
   * @param {object} [opts.pool] api credential pool (defaults to shared apiPool)
   * @param {number} [opts.concurrency] default bulk concurrency (default 5)
   * @param {[number,number]} [opts.delayRange] inter-op delay seconds (default [1,3])
   */
  constructor(opts = {}) {
    this.pool = opts.pool || apiPool;
    this.concurrency = opts.concurrency || 5;
    this.delayRange = opts.delayRange || [1, 3];
  }

  /**
   * Build a connected GramJS client from a session string. Caller MUST call
   * client.disconnect() when done (use withClient() to do this automatically).
   * @param {string} sessionString
   * @returns {Promise<TelegramClient>}
   */
  async getClient(sessionString) {
    const { apiId, apiHash } = this.pool.getNext();
    const client = new TelegramClient(
      new StringSession(sessionString || ''),
      apiId,
      apiHash,
      { connectionRetries: 3 }
    );
    await client.connect();
    return client;
  }

  /**
   * Run `fn(client)` with a connected client and always disconnect afterwards.
   * Normalises revoked-session errors into SessionRevokedError.
   * @template T
   * @param {string} sessionString
   * @param {(client: TelegramClient) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withClient(sessionString, fn) {
    let client;
    try {
      client = await this.getClient(sessionString);
      return await fn(client);
    } catch (err) {
      if (isSessionRevokedError(err)) throw new SessionRevokedError(err.message);
      throw err;
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch (_) {
          /* ignore disconnect errors */
        }
      }
    }
  }

  /**
   * Resolve a chat entity for a parsed link. For private links we resolve the
   * numeric channel id; for public links we resolve the @username.
   * @param {TelegramClient} client
   * @param {{chatId?:number, username?:string}} parsed
   */
  async _resolveFromParsed(client, parsed) {
    const target = parsed.username != null ? parsed.username : parsed.chatId;
    return client.getEntity(target);
  }

  // --------------------------------------------------------------------------
  // Message-target operations
  // --------------------------------------------------------------------------

  /**
   * Apply a reaction emoji to a message.
   * Ported from actions.apply_reaction.
   * @param {string} sessionString
   * @param {string} link
   * @param {string} reactionEmoji
   * @param {number} [accountId]
   */
  async applyReaction(sessionString, link, reactionEmoji, accountId) {
    const parsed = parseTelegramLink(link);
    return this.withClient(sessionString, async (client) => {
      const peer = await this._resolveFromParsed(client, parsed);
      await client.invoke(
        new Api.messages.SendReaction({
          peer,
          msgId: parsed.messageId,
          reaction: [new Api.ReactionEmoji({ emoticon: reactionEmoji })],
        })
      );
      return { ok: true, accountId, messageId: parsed.messageId };
    });
  }

  /**
   * Vote on a poll. Reads the poll message to map the 1-based option number to
   * its answer bytes, then submits the vote.
   * Ported from actions._execute_individual_poll_vote / vote_operation.
   * @param {string} sessionString
   * @param {string} link
   * @param {number} optionNumber 1-based option index
   * @param {number} [accountId]
   */
  async votePoll(sessionString, link, optionNumber, accountId) {
    const parsed = parseTelegramLink(link);
    return this.withClient(sessionString, async (client) => {
      const peer = await this._resolveFromParsed(client, parsed);

      const messages = await client.getMessages(peer, { ids: [parsed.messageId] });
      const message = messages && messages[0];
      const poll = message && message.poll;
      if (!poll || !poll.poll || !Array.isArray(poll.poll.answers)) {
        throw new Error('Target message does not contain a poll');
      }

      const idx = Number(optionNumber) - 1; // convert 1-based -> 0-based
      const answers = poll.poll.answers;
      if (idx < 0 || idx >= answers.length) {
        throw new Error(
          `Invalid poll option ${optionNumber}; poll has ${answers.length} option(s)`
        );
      }

      await client.invoke(
        new Api.messages.SendVote({
          peer,
          msgId: parsed.messageId,
          options: [answers[idx].option],
        })
      );
      return { ok: true, accountId, option: optionNumber };
    });
  }

  /**
   * Post a comment / reply to a message.
   * Ported from actions.comment (send_message with reply_to=message_id).
   * @param {string} sessionString
   * @param {string} link
   * @param {string} commentText
   * @param {number} [accountId]
   */
  async postComment(sessionString, link, commentText, accountId) {
    const parsed = parseTelegramLink(link);
    return this.withClient(sessionString, async (client) => {
      const peer = await this._resolveFromParsed(client, parsed);
      await client.sendMessage(peer, {
        message: commentText,
        replyTo: parsed.messageId,
      });
      return { ok: true, accountId, messageId: parsed.messageId };
    });
  }

  // --------------------------------------------------------------------------
  // Channel-membership operations
  // --------------------------------------------------------------------------

  /**
   * Join a channel/group by link.
   * Ported from actions.join (JoinChannelRequest).
   * @param {string} sessionString
   * @param {string} link
   * @param {number} [accountId]
   */
  async joinChat(sessionString, link, accountId) {
    return this.withClient(sessionString, async (client) => {
      const channel = await this._resolveJoinTarget(client, link);
      await client.invoke(new Api.channels.JoinChannel({ channel }));
      return { ok: true, accountId };
    });
  }

  /**
   * Leave a channel/group by link.
   * Ported from actions.leave (LeaveChannelRequest).
   * @param {string} sessionString
   * @param {string} link
   * @param {number} [accountId]
   */
  async leaveChat(sessionString, link, accountId) {
    return this.withClient(sessionString, async (client) => {
      const channel = await this._resolveJoinTarget(client, link);
      await client.invoke(new Api.channels.LeaveChannel({ channel }));
      return { ok: true, accountId };
    });
  }

  /**
   * Resolve a join/leave target. Accepts full message links (t.me/username/123),
   * invite/username links (t.me/username), or bare @usernames.
   * @param {TelegramClient} client
   * @param {string} link
   */
  async _resolveJoinTarget(client, link) {
    // Try to parse as a message link first; fall back to treating the whole
    // string as a username/entity reference (e.g. "@channel" or "t.me/channel").
    let target;
    try {
      const parsed = parseTelegramLink(link);
      target = parsed.username != null ? parsed.username : parsed.chatId;
    } catch (_) {
      target = String(link)
        .replace('https://', '')
        .replace('http://', '')
        .replace('t.me/', '')
        .trim();
    }
    return client.getEntity(target);
  }

  // --------------------------------------------------------------------------
  // User-target operations
  // --------------------------------------------------------------------------

  /**
   * Block a user.
   * Ported from actions.block (contacts.BlockRequest).
   * @param {string} sessionString
   * @param {string} usernameOrId
   * @param {number} [accountId]
   */
  async blockUser(sessionString, usernameOrId, accountId) {
    return this.withClient(sessionString, async (client) => {
      const entity = await client.getEntity(usernameOrId);
      await client.invoke(new Api.contacts.Block({ id: entity }));
      return { ok: true, accountId, target: String(usernameOrId) };
    });
  }

  /**
   * Send a private message to a user.
   * Ported from actions send-pv flow (send_message).
   * @param {string} sessionString
   * @param {string} usernameOrId
   * @param {string} message
   * @param {number} [accountId]
   */
  async sendPrivateMessage(sessionString, usernameOrId, message, accountId) {
    return this.withClient(sessionString, async (client) => {
      const entity = await client.getEntity(usernameOrId);
      await client.sendMessage(entity, { message });
      return { ok: true, accountId, target: String(usernameOrId) };
    });
  }

  // --------------------------------------------------------------------------
  // Bulk wrapper
  // --------------------------------------------------------------------------

  /**
   * Run an operation across many accounts with bounded concurrency, per-account
   * error isolation, FloodWait handling, revoked-session detection and a random
   * inter-op delay. Ported from utils.execute_bulk_operation.
   *
   * @param {Array<{id?:number, sessionString:string}>} accounts
   * @param {(account:{id?:number, sessionString:string}) => Promise<any>} operation
   * @param {object} [opts]
   * @param {number} [opts.concurrency]
   * @param {[number,number]} [opts.delayRange] seconds
   * @param {(entry:object) => void} [opts.onResult] callback per settled account
   * @returns {Promise<{successCount:number, errorCount:number, errors:Array, revokedSessions:Array, results:Array}>}
   */
  async executeBulkOperation(accounts, operation, opts = {}) {
    const concurrency = Math.max(1, opts.concurrency || this.concurrency);
    const [minDelay, maxDelay] = opts.delayRange || this.delayRange;

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const revokedSessions = [];
    const results = [];

    let cursor = 0;
    const queue = accounts.slice();

    const runOne = async (account) => {
      const accountId = account.id;
      try {
        const result = await operation(account);
        successCount += 1;
        const entry = { accountId, status: 'success', result };
        results.push(entry);
        if (opts.onResult) opts.onResult(entry);
        // Random delay between operations (matches Python delay_range).
        await sleep(randomBetween(minDelay, maxDelay) * 1000);
      } catch (err) {
        errorCount += 1;
        if (err instanceof FloodWaitError) {
          // Count as failed and do NOT retry/sleep — mirrors the Python note
          // about not holding a concurrency slot for the flood-wait window.
          const entry = {
            accountId,
            status: 'flood_wait',
            error: `FloodWait ${err.seconds}s`,
            seconds: err.seconds,
          };
          errors.push(entry);
          results.push(entry);
          if (opts.onResult) opts.onResult(entry);
        } else if (err instanceof SessionRevokedError || isSessionRevokedError(err)) {
          revokedSessions.push(accountId != null ? accountId : account.sessionString);
          const entry = { accountId, status: 'revoked', error: 'Session revoked' };
          errors.push(entry);
          results.push(entry);
          if (opts.onResult) opts.onResult(entry);
        } else {
          const entry = { accountId, status: 'error', error: err.message || String(err) };
          errors.push(entry);
          results.push(entry);
          if (opts.onResult) opts.onResult(entry);
        }
      }
    };

    // Worker pool: `concurrency` workers pull from the shared queue.
    const worker = async () => {
      while (cursor < queue.length) {
        const account = queue[cursor];
        cursor += 1;
        await runOne(account);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () =>
      worker()
    );
    await Promise.all(workers);

    return { successCount, errorCount, errors, revokedSessions, results };
  }
}

module.exports = {
  TelegramService,
  SessionRevokedError,
  isSessionRevokedError,
  SUPPORTED_REACTIONS,
};
