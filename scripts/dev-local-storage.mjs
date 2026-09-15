#!/usr/bin/env node
/**
 * Point this database's file storage at the local disk, FOR DEVELOPMENT ONLY.
 *
 * Seeds the two `__mj` rows `FileStorageEngine` needs to resolve a driver — a
 * `FileStorageProvider` carrying the `Local Disk Storage` server driver key, and a
 * `FileStorageAccount` selecting it — so uploads land in a directory instead of a cloud
 * bucket. Without them, every FileUpload and Signature answer fails with "no file storage
 * accounts configured", which makes the whole respondent file path untestable locally.
 *
 * WHY A SCRIPT AND NOT A MIGRATION. `migrations/` is the only thing that ships (see
 * migrations/README.md), and shipping a row that sends every install's uploads to a local
 * disk would be a data-loss bug on any host with more than one container. This is a
 * developer action, taken deliberately, against a dev database. `npm run lint:distribution`
 * exists to keep unshipped seeds out of migrations; this file stays on the correct side of
 * that line by never being one.
 *
 * Usage:
 *   FORMS_LOCAL_STORAGE_ROOT=/abs/path node scripts/dev-local-storage.mjs
 *   node scripts/dev-local-storage.mjs --status      # report, change nothing
 *   node scripts/dev-local-storage.mjs --off         # deactivate the provider again
 *
 * Connection settings are read from the same `.env` MJAPI uses; pass MJ_ENV_FILE to point
 * at a different one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sql from 'mssql';

const DRIVER_KEY = 'Local Disk Storage';
const PROVIDER_NAME = 'Local Disk (development)';
const ACCOUNT_NAME = 'Local Disk (development)';

const args = new Set(process.argv.slice(2));
const MODE = args.has('--status') ? 'status' : args.has('--off') ? 'off' : 'on';

/** Read `KEY=value` pairs out of an env file, tolerating quotes and blank lines. */
function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i < 0 || line.trim().startsWith('#')) continue;
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const envPath =
  process.env.MJ_ENV_FILE ?? resolve(process.env.HOME ?? '', 'Projects/MJ/packages/MJAPI/.env');
const env = readEnvFile(envPath);

const pool = await sql.connect({
  server: env.DB_HOST,
  port: Number(env.DB_PORT),
  database: env.DB_DATABASE,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: false },
});

const providerRow = async () =>
  (
    await pool
      .request()
      .input('k', sql.NVarChar, DRIVER_KEY)
      .query('SELECT ID, Name, IsActive FROM __mj.FileStorageProvider WHERE ServerDriverKey = @k')
  ).recordset[0];

if (MODE === 'status') {
  const provider = await providerRow();
  console.log(`env file      : ${envPath}`);
  console.log(`database      : ${env.DB_DATABASE}`);
  console.log(`storage root  : ${process.env.FORMS_LOCAL_STORAGE_ROOT ?? '(FORMS_LOCAL_STORAGE_ROOT not set)'}`);
  console.log(`provider row  : ${provider ? `${provider.Name} (active=${provider.IsActive})` : 'none'}`);
  if (provider) {
    const accounts = (
      await pool
        .request()
        .input('p', sql.UniqueIdentifier, provider.ID)
        .query('SELECT Name FROM __mj.FileStorageAccount WHERE ProviderID = @p')
    ).recordset;
    console.log(`accounts      : ${accounts.map((a) => a.Name).join(', ') || 'none'}`);
  }
  await pool.close();
  process.exit(0);
}

if (MODE === 'off') {
  const provider = await providerRow();
  if (!provider) {
    console.log('Nothing to do — no local-disk provider row exists.');
  } else {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, provider.ID)
      .query('UPDATE __mj.FileStorageProvider SET IsActive = 0 WHERE ID = @id');
    console.log(`Deactivated "${provider.Name}". Uploads will fail with "not configured" again.`);
  }
  await pool.close();
  process.exit(0);
}

// --- on -------------------------------------------------------------------
const root = (process.env.FORMS_LOCAL_STORAGE_ROOT ?? '').trim();
if (!root) {
  console.error(
    'Refusing to enable: set FORMS_LOCAL_STORAGE_ROOT to the directory uploads should be written to,\n' +
      'and set the SAME value in the API\'s environment so the running server agrees with this row.',
  );
  await pool.close();
  process.exit(1);
}

let provider = await providerRow();
if (!provider) {
  const inserted = await pool
    .request()
    .input('n', sql.NVarChar, PROVIDER_NAME)
    .input('k', sql.NVarChar, DRIVER_KEY)
    .query(
      `INSERT INTO __mj.FileStorageProvider (Name, Description, ServerDriverKey, ClientDriverKey, Priority, IsActive)
       OUTPUT INSERTED.ID, INSERTED.Name
       VALUES (@n, 'Writes uploads to a local directory. Development only — never enable on a shared host.', @k, @k, 0, 1)`,
    );
  provider = inserted.recordset[0];
  console.log(`Created provider "${provider.Name}".`);
} else {
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, provider.ID)
    .query('UPDATE __mj.FileStorageProvider SET IsActive = 1 WHERE ID = @id');
  console.log(`Reactivated provider "${provider.Name}".`);
}

const existingAccount = (
  await pool
    .request()
    .input('p', sql.UniqueIdentifier, provider.ID)
    .query('SELECT ID, Name FROM __mj.FileStorageAccount WHERE ProviderID = @p')
).recordset[0];

if (existingAccount) {
  console.log(`Account "${existingAccount.Name}" already present.`);
} else {
  // FileStorageAccount.CredentialID is NOT NULL, so even a driver that authenticates
  // against nothing needs a credential row to point at. An empty API Key credential is the
  // honest shape for that: the local driver never reads it, and leaving it empty means no
  // secret is invented or stored to satisfy a foreign key.
  const credential = (
    await pool
      .request()
      .input('n', sql.NVarChar, ACCOUNT_NAME)
      .query('SELECT ID FROM __mj.Credential WHERE Name = @n')
  ).recordset[0] ??
    (
      await pool
        .request()
        .input('n', sql.NVarChar, ACCOUNT_NAME)
        .query(
          `INSERT INTO __mj.Credential (CredentialTypeID, Name, Description, [Values], IsDefault, IsActive)
           OUTPUT INSERTED.ID
           SELECT TOP 1 ID, @n, 'Placeholder — the local disk driver authenticates against nothing.', '{}', 0, 1
           FROM __mj.CredentialType WHERE Name = 'API Key'`,
        )
    ).recordset[0];

  if (!credential) {
    console.error('Could not find or create a credential row (no "API Key" credential type?).');
    await pool.close();
    process.exit(1);
  }

  await pool
    .request()
    .input('p', sql.UniqueIdentifier, provider.ID)
    .input('c', sql.UniqueIdentifier, credential.ID)
    .input('n', sql.NVarChar, ACCOUNT_NAME)
    .query(
      `INSERT INTO __mj.FileStorageAccount (Name, Description, ProviderID, CredentialID)
       VALUES (@n, 'Development file storage backed by the local disk.', @p, @c)`,
    );
  console.log(`Created account "${ACCOUNT_NAME}".`);
}

console.log(`\nUploads will be written under: ${root}`);
console.log('Restart MJAPI with FORMS_LOCAL_STORAGE_ROOT set to the same path.');
await pool.close();
