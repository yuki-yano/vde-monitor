import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "@vde-monitor/shared";
import webpush from "web-push";

type PersistedVapid = {
  version: 1;
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
};

type StoreOptions = {
  filePath?: string;
  now?: () => string;
  resolveSubject?: () => string;
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const LEGACY_DEFAULT_SUBJECT = "mailto:vde-monitor@localhost.localdomain";
const DEFAULT_SUBJECT = "mailto:vde-monitor@example.com";

const getDefaultVapidPath = () => {
  return path.join(os.homedir(), ".vde-monitor", "push-vapid.json");
};

const resolveSubjectFromEnv = () => {
  const fromEnv = process.env.VDE_MONITOR_PUSH_SUBJECT?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return null;
};

const resolveDefaultSubject = () => {
  const fromEnv = resolveSubjectFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_SUBJECT;
};

const isPersistedVapid = (value: unknown): value is PersistedVapid => {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.version === 1 &&
    typeof value.publicKey === "string" &&
    value.publicKey.length > 0 &&
    typeof value.privateKey === "string" &&
    value.privateKey.length > 0 &&
    typeof value.subject === "string" &&
    value.subject.length > 0 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
};

export const createVapidStore = (options: StoreOptions = {}) => {
  const filePath = options.filePath ?? getDefaultVapidPath();
  const fileDirectoryPath = path.dirname(filePath);
  const now = options.now ?? (() => new Date().toISOString());
  const resolveSubject = options.resolveSubject ?? resolveDefaultSubject;

  const ensureDir = () => {
    fs.mkdirSync(fileDirectoryPath, { recursive: true, mode: 0o700 });
  };

  const writeFileSafe = (raw: string) => {
    const tempFilePath = path.join(
      fileDirectoryPath,
      `${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      fs.writeFileSync(tempFilePath, raw, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(tempFilePath, filePath);
    } catch (error) {
      try {
        fs.rmSync(tempFilePath, { force: true });
      } catch {
        // ignore
      }
      throw error;
    }
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // ignore
    }
  };

  const read = () => {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isPersistedVapid(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const save = (keys: VapidKeys) => {
    ensureDir();
    const timestamp = now();
    const data: PersistedVapid = {
      version: 1,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: keys.subject,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    writeFileSafe(`${JSON.stringify(data, null, 2)}\n`);
    return data;
  };

  const saveWithExistingCreatedAt = (keys: VapidKeys, createdAt: string) => {
    ensureDir();
    const timestamp = now();
    const data: PersistedVapid = {
      version: 1,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: keys.subject,
      createdAt,
      updatedAt: timestamp,
    };
    writeFileSafe(`${JSON.stringify(data, null, 2)}\n`);
    return data;
  };

  const ensureKeys = (): VapidKeys => {
    const existing = read();
    if (existing) {
      const envSubject = resolveSubjectFromEnv();
      const configuredSubject = resolveSubject();
      let nextSubject = existing.subject;
      if (envSubject && envSubject !== existing.subject) {
        nextSubject = envSubject;
      } else if (
        existing.subject === LEGACY_DEFAULT_SUBJECT &&
        configuredSubject === DEFAULT_SUBJECT
      ) {
        nextSubject = DEFAULT_SUBJECT;
      }
      if (nextSubject !== existing.subject) {
        const persisted = saveWithExistingCreatedAt(
          {
            publicKey: existing.publicKey,
            privateKey: existing.privateKey,
            subject: nextSubject,
          },
          existing.createdAt,
        );
        return {
          publicKey: persisted.publicKey,
          privateKey: persisted.privateKey,
          subject: persisted.subject,
        };
      }
      return {
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        subject: existing.subject,
      };
    }
    const generated = webpush.generateVAPIDKeys();
    const subject = resolveSubject();
    const persisted = save({
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
    });
    return {
      publicKey: persisted.publicKey,
      privateKey: persisted.privateKey,
      subject: persisted.subject,
    };
  };

  return {
    ensureKeys,
  };
};

export type VapidStore = ReturnType<typeof createVapidStore>;
