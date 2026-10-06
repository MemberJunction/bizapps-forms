/**
 * Pure verdicts on the three `FORMS_*_STORAGE_ACCOUNT` pins, judged against the File Storage
 * Accounts the host actually has (#290).
 *
 * Reads now probe every account on the file's provider, so an unset or wrong DOWNLOAD pin costs
 * nothing. Writes cannot probe: an upload goes to exactly one account, and with several to choose
 * from and no pin it is whichever the engine happens to resolve first — which is not stable across
 * hosts sharing one database. That is the only unset pin worth a warning.
 */
import { UUIDsEqual } from '@memberjunction/global';

export interface StorageAccountSummary {
  id: string;
  name: string;
  providerName: string;
}

export interface StoragePin {
  envVar: string;
  value: string | undefined;
}

export interface StorageReadiness {
  warnings: string[];
  errors: string[];
}

/** The pins whose absence makes an upload's destination ambiguous. Download is excluded: reads probe. */
const WRITE_PIN_ENV_VARS: ReadonlySet<string> = new Set(['FORMS_ASSET_STORAGE_ACCOUNT', 'FORMS_UPLOAD_STORAGE_ACCOUNT']);

function describeAccount(a: StorageAccountSummary): string {
  return `"${a.name}" (${a.id}, ${a.providerName})`;
}

/**
 * @param accounts Accounts whose provider is active; the caller filters, so this stays pure.
 * @param pins The pins as configured; an empty string counts as unset.
 */
export function assessStoragePins(
  accounts: ReadonlyArray<StorageAccountSummary>,
  pins: ReadonlyArray<StoragePin>,
): StorageReadiness {
  const list = accounts.map(describeAccount).join(', ') || 'none';
  const errors: string[] = [];
  const unsetWritePins: string[] = [];

  for (const pin of pins) {
    if (!pin.value) {
      if (WRITE_PIN_ENV_VARS.has(pin.envVar)) unsetWritePins.push(pin.envVar);
      continue;
    }
    const value = pin.value;
    if (!accounts.some((a) => UUIDsEqual(a.id, value))) {
      errors.push(
        `${pin.envVar} is set to ${value}, which is not an active File Storage Account here; ` +
          `uploads through it fail and reads skip it. Active accounts: ${list}.`,
      );
    }
  }

  const warnings: string[] = [];
  if (accounts.length > 1 && unsetWritePins.length > 0) {
    warnings.push(
      `${accounts.length} File Storage Accounts exist (${list}) but ${unsetWritePins.join(' and ')} ` +
        `${unsetWritePins.length > 1 ? 'are' : 'is'} not set, so uploads go to whichever account the engine resolves first, ` +
        `which can differ between hosts sharing this database. Reads still find the file, but every host ` +
        `sharing the database should pin the same account.`,
    );
  }
  return { warnings, errors };
}
