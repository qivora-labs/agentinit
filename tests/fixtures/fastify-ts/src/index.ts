import { health } from './routes/health.js';

export async function start(): Promise<{ ok: true }> {
  return health();
}

await start();
