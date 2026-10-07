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
  /**
   * The PROVIDER's IsActive. Carried rather than filtered out because MJ's upload resolution
   * (`ResolveStorageAccount(id)`) and read listing (`GetAccountsByProviderID`) both ignore it, so a
   * pin naming such an account is still used — it needs its own verdict, not "unknown".
   */
  providerActive: boolean;
}

export interface StoragePin {
  envVar: string;
  value: string | undefined;
  /** 'write' pins choose an upload's destination; 'read' pins only order reads, which probe anyway. */
  role: 'write' | 'read';
}

export interface StorageReadiness {
  warnings: string[];
  errors: string[];
}

/**
 * What an unknown READ pin costs. Most reads skip it, but a respondent file uploaded before v0.11.0
 * whose provider has no account is read through this pin alone (read-object's legacy rule) and fails.
 */
const READ_PIN_UNKNOWN =
  'reads skip it, except a respondent file uploaded before v0.11.0 whose provider has no account, which is read through this pin alone and fails';

function describeAccount(a: StorageAccountSummary): string {
  return `"${a.name}" (${a.id}, ${a.providerName})`;
}

/**
 * @param accounts Every account the host has, on active and inactive providers alike.
 * @param pins The pins as configured; an empty string counts as unset.
 */
export function assessStoragePins(
  accounts: ReadonlyArray<StorageAccountSummary>,
  pins: ReadonlyArray<StoragePin>,
): StorageReadiness {
  const active = accounts.filter((a) => a.providerActive);
  const list = active.map(describeAccount).join(', ') || 'none';
  const errors: string[] = [];
  const unsetWritePins: string[] = [];

  for (const pin of pins) {
    if (!pin.value) {
      if (pin.role === 'write') unsetWritePins.push(pin.envVar);
      continue;
    }
    const value = pin.value;
    const named = accounts.find((a) => UUIDsEqual(a.id, value));
    if (!named) {
      errors.push(
        `${pin.envVar} is set to ${value}, which names no File Storage Account here; ` +
          `${pin.role === 'write' ? 'uploads through it fail and reads skip it' : READ_PIN_UNKNOWN}. Active accounts: ${list}.`,
      );
    } else if (!named.providerActive) {
      errors.push(
        `${pin.envVar} is set to ${value}, which names "${named.name}" on provider "${named.providerName}", ` +
          `which is inactive; Forms still ${pin.role === 'write' ? 'writes to and reads from' : 'reads from'} it, ` +
          'but MJ treats the provider as switched off — reactivate the provider or repin.',
      );
    }
  }

  const warnings: string[] = [];
  if (active.length > 1 && unsetWritePins.length > 0) {
    warnings.push(
      `${active.length} File Storage Accounts exist (${list}) but ${unsetWritePins.join(' and ')} ` +
        `${unsetWritePins.length > 1 ? 'are' : 'is'} not set, so uploads go to whichever account the engine resolves first, ` +
        `which can differ between hosts sharing this database. Reads still find the file, but every host ` +
        `sharing the database should pin the same account.`,
    );
  }
  return { warnings, errors };
}
