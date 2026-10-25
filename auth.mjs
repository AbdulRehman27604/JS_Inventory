const adapter=process.env.DATABASE_URL?await import('./postgres-auth.mjs'):await import('./sqlite-auth.mjs');
export const setUser=(...args)=>adapter.setUser(...args);
export const login=(...args)=>adapter.login(...args);
export const session=(...args)=>adapter.session(...args);
export const logout=(...args)=>adapter.logout(...args);
