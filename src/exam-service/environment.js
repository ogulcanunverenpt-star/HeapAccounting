import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const serviceDirectory = dirname(fileURLToPath(import.meta.url));

export function loadServiceEnvironment(filename = resolve(serviceDirectory, '.env')) {
  try {
    process.loadEnvFile(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
