/**
 * Supabase appends the session of an invite / password-reset e-mail to the Site URL as a hash
 * (#access_token=…&type=invite). Before anything else loads (this module is imported first in main.tsx,
 * ahead of the Supabase client that consumes the hash), send such links to /welcome so the person
 * sets a password instead of landing straight in the app.
 */
const hash = typeof window !== 'undefined' ? window.location.hash : ''
if (/[#&]type=(invite|recovery|magiclink|signup)\b/.test(hash) && window.location.pathname !== '/welcome') {
  window.history.replaceState(null, '', '/welcome' + hash)
}
export {}
