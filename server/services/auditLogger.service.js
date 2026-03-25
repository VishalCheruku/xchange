import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const ensureLogPath = () => {
  const dir = path.dirname(env.AUDIT_LOG_PATH);
  fs.mkdirSync(dir, { recursive: true });
};

ensureLogPath();

export const auditLog = async (entry) => {
  const row = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });

  fs.appendFile(env.AUDIT_LOG_PATH, `${row}\n`, (error) => {
    if (error) {
      console.error('Failed to write AI audit log:', error);
    }
  });
};

