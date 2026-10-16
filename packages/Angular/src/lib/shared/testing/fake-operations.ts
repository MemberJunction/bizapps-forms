/**
 * A stand-in for the provider a Forms Remote Operation routes through, for specs.
 *
 * `BaseRemotableOperation.Execute()` routes through `Metadata.Provider.RouteOperation(key, input)`
 * (in the browser, `GraphQLDataProvider` turns that into one `ExecuteRemoteOperation` mutation).
 * Installing this as the provider lets a spec run the REAL client code — the generated operation
 * class, `runOperation`, the service around it — and see exactly which operation was asked for,
 * with what input, while scripting the server's answer.
 *
 * Excluded from the build (`src/**\/testing/**`).
 */
import { Metadata, type IMetadataProvider, type RemoteOpResult } from '@memberjunction/core';

/** One operation the code under test ran. */
export interface RoutedOperation {
  key: string;
  input: unknown;
}

export interface FakeOperations {
  /** Every operation routed, in order. */
  readonly calls: RoutedOperation[];
  /** Put the previous provider back. Call it in `afterEach`. */
  restore(): void;
}

/** A successful operation result carrying `output`. */
export function succeeded<T>(output: T): RemoteOpResult<T> {
  return { Success: true, ResultCode: 'SUCCESS', Output: output };
}

/** A refused operation result, the way a Forms operation reports a refusal. */
export function refused(message: string, resultCode = 'EXECUTION_ERROR'): RemoteOpResult<never> {
  return { Success: false, ResultCode: resultCode, ErrorMessage: message };
}

/** Route every operation to `answer`, recording each call. */
export function installFakeOperations(
  answer: (key: string, input: unknown) => RemoteOpResult<unknown> | Promise<RemoteOpResult<unknown>>,
): FakeOperations {
  const previous = Metadata.Provider;
  const calls: RoutedOperation[] = [];
  const provider = {
    RouteOperation: async (key: string, input: unknown) => {
      calls.push({ key, input });
      return answer(key, input);
    },
  };
  Metadata.Provider = provider as unknown as IMetadataProvider;
  return {
    calls,
    restore: () => {
      Metadata.Provider = previous;
    },
  };
}
