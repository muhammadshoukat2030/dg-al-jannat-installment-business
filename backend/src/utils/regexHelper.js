/**
 * Escapes special regular expression characters in user-provided search strings
 * to protect against Regular Expression Denial of Service (ReDoS) and regex injection.
 *
 * @param {string} str - Raw user input string
 * @returns {string} Sanitized string safe for use in RegExp or MongoDB $regex
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
