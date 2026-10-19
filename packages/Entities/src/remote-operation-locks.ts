/**
 * Compile-time locks: every value list the Remote Operation contract RESTATES equals the list the
 * entity derives from its CHECK constraint.
 *
 * The restatement is forced, not chosen. CodeGen pastes `metadata/remote-operations/types/*.ts` into
 * `generated/remote_operations.ts` verbatim and those files may not import anything, so they cannot
 * write `mjBizAppsFormsFormEntityType['Status']` the way the rest of this package does. A literal
 * union is the precise type they can write; this file is what stops it drifting. The next migration
 * that widens a CHECK constraint widens the entity type, and `tsc` then fails HERE, naming the
 * operation field to update, instead of a caller learning about the new value at runtime.
 *
 * Compiled by the package build (`tsc` over `src/**`), which is the gate: Vitest does not typecheck.
 * Nothing imports this module; it has no runtime content.
 */
import type {
  mjBizAppsFormsFormAutomationEntityType,
  mjBizAppsFormsFormAutomationRunEntityType,
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormEntityBindingRecordEntityType,
  mjBizAppsFormsFormEntityBindingEntityType,
  mjBizAppsFormsFormEntityType,
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormUploadEntityType,
} from './generated/entity_subclasses';
import type {
  FormsAutomationFields,
  FormsDistributionLinkOutput,
  FormsEntityBindingFields,
  FormsFormLifecycleOutput,
  FormsIssueDistributionLinkInput,
  FormsListResponsesInput,
  FormsNewAutomation,
  FormsResponseAutomationRun,
  FormsResponseBindingRecord,
  FormsResponseDetailRecord,
  FormsResponseListRow,
  FormsResponseUpload,
  FormsSaveResponseOutput,
} from './generated/remote_operations';

/**
 * True only when `A` and `B` are the same type. The invariant wrapper catches a union that gained
 * or lost a member in either direction, which bidirectional `extends` on unions does not.
 */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Compile error unless `T` is exactly `true`. */
type AssertExact<T extends true> = T;

type _FormStatus = AssertExact<Exact<FormsFormLifecycleOutput['Status'], mjBizAppsFormsFormEntityType['Status']>>;
type _ChannelType = AssertExact<
  Exact<NonNullable<FormsIssueDistributionLinkInput['ChannelType']>, mjBizAppsFormsFormDistributionEntityType['ChannelType']>
>;
type _DistributionStatus = AssertExact<
  Exact<FormsDistributionLinkOutput['Status'], mjBizAppsFormsFormDistributionEntityType['Status']>
>;
type _TargetType = AssertExact<Exact<FormsNewAutomation['TargetType'], mjBizAppsFormsFormAutomationEntityType['TargetType']>>;
type _Trigger = AssertExact<
  Exact<NonNullable<FormsAutomationFields['Trigger']>, mjBizAppsFormsFormAutomationEntityType['Trigger']>
>;
type _ExecutionMode = AssertExact<
  Exact<NonNullable<FormsAutomationFields['ExecutionMode']>, mjBizAppsFormsFormAutomationEntityType['ExecutionMode']>
>;
type _BindingStatus = AssertExact<
  Exact<NonNullable<FormsEntityBindingFields['Status']>, mjBizAppsFormsFormEntityBindingEntityType['Status']>
>;
type _ListStatusFilter = AssertExact<
  Exact<NonNullable<FormsListResponsesInput['Status']>, mjBizAppsFormsFormResponseEntityType['Status']>
>;
type _ListRowStatus = AssertExact<Exact<FormsResponseListRow['Status'], mjBizAppsFormsFormResponseEntityType['Status']>>;
type _SavedStatus = AssertExact<
  Exact<NonNullable<FormsSaveResponseOutput['Status']>, mjBizAppsFormsFormResponseEntityType['Status']>
>;
type _DetailStatus = AssertExact<Exact<FormsResponseDetailRecord['Status'], mjBizAppsFormsFormResponseEntityType['Status']>>;
type _UploadStatus = AssertExact<Exact<FormsResponseUpload['Status'], mjBizAppsFormsFormUploadEntityType['Status']>>;
type _RunStatus = AssertExact<Exact<FormsResponseAutomationRun['Status'], mjBizAppsFormsFormAutomationRunEntityType['Status']>>;
type _BindingOutcome = AssertExact<
  Exact<FormsResponseBindingRecord['Outcome'], mjBizAppsFormsFormEntityBindingRecordEntityType['Outcome']>
>;

/** Referenced so `noUnusedLocals` keeps the locks; they exist only for the checks above. */
export type RemoteOperationContractLocks = [
  _FormStatus,
  _ChannelType,
  _DistributionStatus,
  _TargetType,
  _Trigger,
  _ExecutionMode,
  _BindingStatus,
  _ListStatusFilter,
  _ListRowStatus,
  _SavedStatus,
  _DetailStatus,
  _UploadStatus,
  _RunStatus,
  _BindingOutcome,
];
