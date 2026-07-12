'use strict';

/**
 * Telegram link parser — a faithful port of MODULE579's Python
 * `parse_telegram_link` / `_parse_private_channel_link` /
 * `_parse_public_channel_link` (see src/actions.py in the source repo).
 *
 * Supported formats:
 *   - Private:  t.me/c/123456/789        -> { chatId: -100123456, messageId: 789 }
 *   - Public:   t.me/username/123        -> { username: 'username', messageId: 123 }
 *   - Topic:    t.me/c/123/456/789       -> last segment is the message id
 *               t.me/username/456/789    -> last segment is the message id
 *
 * Protocol (http/https), query params (?a=b) and fragments (#x) are stripped.
 */

/**
 * Strip protocol, query params and fragments.
 * @param {string} link
 * @returns {string}
 */
function cleanTelegramLink(link) {
  let clean = String(link).replace('https://', '').replace('http://', '').trim();
  if (clean.includes('?')) clean = clean.split('?')[0];
  if (clean.includes('#')) clean = clean.split('#')[0];
  return clean;
}

const DIGITS = /^\d+$/;

/**
 * Parse a private channel link: t.me/c/<chat>/<...>/<msg>.
 * @param {string} cleanLink
 * @returns {{chatId:number, messageId:number}|null}
 */
function parsePrivateChannelLink(cleanLink) {
  if (!cleanLink.includes('/c/')) return null;

  const parts = cleanLink.split('/c/');
  if (parts.length !== 2) return null;

  const chatAndMsg = parts[1].split('/').filter((s) => s.length > 0);
  if (chatAndMsg.length < 2) return null;

  const chatIdStr = chatAndMsg[0].trim();
  // Forum/topic links (t.me/c/<chat>/<topic>/<msg>): the real message id is the
  // LAST segment, not the topic id in the middle.
  const messageIdStr = chatAndMsg[chatAndMsg.length - 1].trim();

  if (!DIGITS.test(chatIdStr) || !DIGITS.test(messageIdStr)) return null;

  const chatId = Number('-100' + chatIdStr);
  const messageId = Number(messageIdStr);
  if (messageId <= 0) return null;

  return { chatId, messageId };
}

/**
 * Parse a public channel link: t.me/<username>/<...>/<msg>.
 * @param {string} cleanLink
 * @returns {{username:string, messageId:number}|null}
 */
function parsePublicChannelLink(cleanLink) {
  if (!cleanLink.includes('t.me/')) return null;

  const parts = cleanLink.split('t.me/');
  if (parts.length !== 2) return null;

  const rest = parts[1].split('/').filter((s) => s.length > 0);
  if (rest.length < 2) return null;

  const username = rest[0].trim();
  // Topic/comment links (t.me/<user>/<topic>/<msg>): last segment is the msg id.
  const messageIdStr = rest[rest.length - 1].trim();

  if (!DIGITS.test(messageIdStr)) return null;

  const messageId = Number(messageIdStr);
  if (messageId <= 0) return null;

  return { username, messageId };
}

/**
 * Parse any supported Telegram message link.
 *
 * @param {string} link
 * @returns {{chatId?:number, username?:string, messageId:number}}
 * @throws {Error} if the link cannot be parsed
 */
function parseTelegramLink(link) {
  if (!link || typeof link !== 'string') {
    throw new Error('Telegram link must be a non-empty string');
  }

  const clean = cleanTelegramLink(link);

  const priv = parsePrivateChannelLink(clean);
  if (priv) return priv;

  const pub = parsePublicChannelLink(clean);
  if (pub) return pub;

  throw new Error(`Unable to parse Telegram link: ${link}`);
}

module.exports = {
  parseTelegramLink,
  cleanTelegramLink,
  parsePrivateChannelLink,
  parsePublicChannelLink,
};
