import { getDb } from '../core/db.js';

let cache = new Map();
let lastFetch = 0;
const CACHE_TTL_MS = 30 * 1000;

export const settingsService = {
  async getAll() {
    const now = Date.now();
    if (cache.size > 0 && now - lastFetch < CACHE_TTL_MS) {
      return Object.fromEntries(cache);
    }

    const db = getDb();
    const res = await db.query('SELECT key, value FROM app_settings');
    cache.clear();
    for (const row of res.rows) {
      cache.set(row.key, row.value);
    }
    lastFetch = now;
    return Object.fromEntries(cache);
  },

  async get(key, defaultValue = null) {
    const all = await this.getAll();
    if (key in all) {
      return all[key];
    }
    return defaultValue;
  },

  async set(key, value, updatedBy = null) {
    const db = getDb();
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [key, JSON.stringify(value), updatedBy]
    );
    cache.set(key, value);
  },

  async setMultiple(settingsObj, updatedBy = null) {
    for (const [key, value] of Object.entries(settingsObj)) {
      await this.set(key, value, updatedBy);
    }
    cache.clear();
    lastFetch = 0;
  },

  clearCache() {
    cache.clear();
    lastFetch = 0;
  }
};
