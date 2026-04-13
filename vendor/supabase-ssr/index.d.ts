export type CookieMethodsServer = {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options?: unknown }>) => void;
};

export declare function createBrowserClient(
  url: string,
  key: string,
  options?: unknown,
): {
  auth: {
    getUser: () => Promise<{ data: { user: unknown | null }; error: unknown | null }>;
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{ data: unknown; error: { message: string } | null }>;
    signUp: (credentials: {
      email: string;
      password: string;
      options?: unknown;
    }) => Promise<{ data: unknown; error: { message: string } | null }>;
    exchangeCodeForSession: (
      code: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
};

export declare function createServerClient(
  url: string,
  key: string,
  options?: { cookies?: CookieMethodsServer },
): ReturnType<typeof createBrowserClient>;
