const adapter=process.env.DATABASE_URL?await import('./postgres-database.mjs'):await import('./sqlite-database.mjs');
export const databasePath=adapter.databasePath;
export const readInventory=(...args)=>adapter.readInventory(...args);
export const replaceInventory=(...args)=>adapter.replaceInventory(...args);
export {validateTables} from './inventory-validation.mjs';
