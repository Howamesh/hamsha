/** localStorage keys of the demo store. Alias-free so Node unit tests can import it. */
export const MOCK_DATA_KEY = 'hamsha.mock.v4'
export const MOCK_SESSION_KEY = 'hamsha.mock.session'
/** Only this key is cleared by "reset demo data" — never the session or preferences. */
export const MOCK_KEYS = [MOCK_DATA_KEY]
