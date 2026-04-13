function createAuthClient() {
  return {
    async getUser() {
      return { data: { user: null }, error: null };
    },
    async signInWithPassword() {
      return { data: { session: null, user: null }, error: null };
    },
    async signUp() {
      return { data: { user: null, session: null }, error: null };
    },
    async exchangeCodeForSession() {
      return { data: { session: null, user: null }, error: null };
    },
  };
}

function createBrowserClient() {
  return { auth: createAuthClient() };
}

function createServerClient() {
  return { auth: createAuthClient() };
}

module.exports = { createBrowserClient, createServerClient };
