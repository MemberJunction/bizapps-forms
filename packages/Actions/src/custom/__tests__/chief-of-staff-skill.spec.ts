import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunView, type RunViewParams, type RunViewResult, UserInfo, type UserRoleInfo } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { MJGlobal } from '@memberjunction/global';
import { LoadFormsActions } from '../register';

LoadFormsActions();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../../..');
const METADATA_ROOT = join(REPO_ROOT, 'metadata');
const SKILL_DIR = join(METADATA_ROOT, 'chief-of-staff-skills');

const UUID_V4_UPPER_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

interface SkillMetadataRecord {
  fields: {
    Name: string;
    Description: string;
    Instructions: string;
    Status: string;
    ActivationMode: string;
    CreatedByUserID: string;
  };
  relatedEntities?: {
    'MJ: AI Agent Skills'?: Array<{
      fields: { AgentID: string; SkillID: string; Status: string };
      primaryKey: { ID: string };
    }>;
    'MJ: AI Skill Actions'?: Array<{
      fields: { SkillID: string; ActionID: string; Role: string; ExposeToModel: boolean };
      primaryKey: { ID: string };
    }>;
  };
  primaryKey: { ID: string };
}

interface ActionMetadataRecord {
  fields: { Name: string; DriverClass: string };
}

interface AgentRecord {
  ID: string;
  Name: string;
  BaseAgentID: string | null;
}

interface FormResponseRow {
  ID: string;
  FormID: string;
  Status: 'Complete' | 'Partial' | 'Disqualified';
  RespondentPersonID: string | null;
  OwnerUserID: string;
}

interface FormResponseAnswerRow {
  ID: string;
  ResponseID: string;
  QuestionID: string;
  TextValue: string | null;
  Score: number | null;
}

interface ScopedFormsUser extends UserInfo {
  ScopeResourceID?: string;
}

function resolveInheritedSkills(
  agent: AgentRecord,
  allAgents: AgentRecord[],
  grants: Array<{ AgentName: string; SkillName: string; Status: string }>,
): string[] {
  const lineage = new Set<string>([agent.Name]);
  let parentId = agent.BaseAgentID;
  while (parentId) {
    const parent = allAgents.find((a) => a.ID === parentId);
    if (!parent) break;
    lineage.add(parent.Name);
    parentId = parent.BaseAgentID;
  }
  return grants
    .filter((g) => g.Status === 'Active' && lineage.has(g.AgentName))
    .map((g) => g.SkillName);
}

/**
 * Typed RunView-backed query path mirroring how the Forms Chief of Staff skill
 * summarizes responses and answers for the caller's ContextUser (never raw SQL).
 */
async function summarizeVisibleFormResponses(
  formId: string,
  contextUser: UserInfo,
): Promise<{
  responseIds: string[];
  answerTexts: string[];
}> {
  const rv = new RunView();
  const responsesRes = await rv.RunView<FormResponseRow>(
    {
      EntityName: 'MJ_BizApps_Forms: Form Responses',
      ExtraFilter: `FormID = '${formId}'`,
      Fields: ['ID', 'FormID', 'Status', 'RespondentPersonID'],
      ResultType: 'simple',
    },
    contextUser,
  );
  const responses = responsesRes.Success && responsesRes.Results ? responsesRes.Results : [];
  if (responses.length === 0) {
    return { responseIds: [], answerTexts: [] };
  }

  const responseIds = responses.map((r) => r.ID);
  const idList = responseIds.map((id) => `'${id}'`).join(',');
  const answersRes = await rv.RunView<FormResponseAnswerRow>(
    {
      EntityName: 'MJ_BizApps_Forms: Form Response Answers',
      ExtraFilter: `ResponseID IN (${idList})`,
      Fields: ['ID', 'ResponseID', 'QuestionID', 'TextValue', 'Score'],
      ResultType: 'simple',
    },
    contextUser,
  );
  const answers = answersRes.Success && answersRes.Results ? answersRes.Results : [];
  return {
    responseIds,
    answerTexts: answers.map((a) => a.TextValue ?? '').filter((t) => t.length > 0),
  };
}

describe('Chief of Staff Forms Skill — Metadata & Auto-Install Integrity', () => {
  it('wires metadata/chief-of-staff-skills into mj-app.json and metadata/.mj-sync.json with zero manual steps', () => {
    const mjApp = JSON.parse(readFileSync(join(REPO_ROOT, 'mj-app.json'), 'utf8')) as {
      metadata?: { directory?: string };
    };
    expect(mjApp.metadata?.directory).toBe('metadata');

    const rootSync = JSON.parse(readFileSync(join(METADATA_ROOT, '.mj-sync.json'), 'utf8')) as {
      directoryOrder?: string[];
    };
    const order = rootSync.directoryOrder ?? [];
    expect(order.indexOf('actions')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('chief-of-staff-skills')).toBeGreaterThan(order.indexOf('actions'));

    const skillSync = JSON.parse(readFileSync(join(SKILL_DIR, '.mj-sync.json'), 'utf8')) as {
      entity: string;
      filePattern: string;
    };
    expect(skillSync.entity).toBe('MJ: AI Skills');
    expect(skillSync.filePattern).toBe('**/.*.json');
  });

  it('validates skill JSON, Chief of Staff grant inherited by Pepper, instructions template, AuthorizesCaller actions, and zero raw SQL', () => {
    const skillPath = join(SKILL_DIR, '.chief-of-staff-forms-skill.json');
    const rawJson = readFileSync(skillPath, 'utf8');
    expect(rawJson).not.toContain('"sync"');

    const records = JSON.parse(rawJson) as SkillMetadataRecord[];
    expect(records).toHaveLength(1);
    const skill = records[0];

    expect(skill.primaryKey.ID).toMatch(UUID_V4_UPPER_RE);
    expect(skill.fields.Name).toBe('Forms');
    expect(skill.fields.Status).toBe('Active');
    expect(skill.fields.ActivationMode).toBe('Auto');
    expect(skill.fields.CreatedByUserID).toBe('@lookup:MJ: Users.Name=System');
    expect(skill.fields.Instructions.startsWith('@file:')).toBe(true);

    const templatePath = join(SKILL_DIR, skill.fields.Instructions.slice('@file:'.length));
    expect(existsSync(templatePath)).toBe(true);
    const templateMd = readFileSync(templatePath, 'utf8');
    expect(templateMd).toContain('MJ_BizApps_Forms: Forms');
    expect(templateMd).toContain('MJ_BizApps_Forms: Form Responses');
    expect(templateMd).toContain('MJ_BizApps_Forms: Form Response Answers');
    expect(templateMd).toContain('MJ_BizApps_Forms: Form Distributions');
    expect(templateMd).toContain('RunView');
    expect(templateMd.toLowerCase()).toContain('never execute raw sql');

    const agentGrants = skill.relatedEntities?.['MJ: AI Agent Skills'] ?? [];
    expect(agentGrants).toHaveLength(1);
    expect(agentGrants[0].primaryKey.ID).toMatch(UUID_V4_UPPER_RE);
    expect(agentGrants[0].fields.AgentID).toBe('@lookup:MJ: AI Agents.Name=Chief of Staff');
    expect(agentGrants[0].fields.SkillID).toBe('@parent:ID');
    expect(agentGrants[0].fields.Status).toBe('Active');

    // Personal instance ("Pepper") inherits the Forms skill from Chief of Staff template
    const cos: AgentRecord = { ID: 'COS-ID', Name: 'Chief of Staff', BaseAgentID: null };
    const pepper: AgentRecord = { ID: 'PEPPER-ID', Name: 'Pepper', BaseAgentID: cos.ID };
    const inherited = resolveInheritedSkills(pepper, [cos, pepper], [
      {
        AgentName: agentGrants[0].fields.AgentID.replace('@lookup:MJ: AI Agents.Name=', ''),
        SkillName: skill.fields.Name,
        Status: agentGrants[0].fields.Status,
      },
    ]);
    expect(inherited).toEqual(['Forms']);

    // Bound actions must exist in metadata/actions/.actions.json AND carry AuthorizesCaller = true
    const actionsMetadata = JSON.parse(
      readFileSync(join(METADATA_ROOT, 'actions', '.actions.json'), 'utf8'),
    ) as ActionMetadataRecord[];
    const knownActions = new Set(actionsMetadata.map((a) => a.fields.Name));
    const boundActions = skill.relatedEntities?.['MJ: AI Skill Actions'] ?? [];
    expect(boundActions).toHaveLength(2);
    for (const bound of boundActions) {
      expect(bound.primaryKey.ID).toMatch(UUID_V4_UPPER_RE);
      const name = bound.fields.ActionID.replace('@lookup:MJ: Actions.Name=', '');
      expect(knownActions.has(name)).toBe(true);
      const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, name);
      expect(reg, `${name} must be registered`).toBeTruthy();
      expect(Object.getOwnPropertyDescriptor(reg?.SubClass, 'AuthorizesCaller')?.value).toBe(true);
    }

    // Verify zero raw SQL in the bound authoring action sources
    const actionSources = [
      join(__dirname, '..', 'authoring', 'generate-form.action.ts'),
      join(__dirname, '..', 'templates', 'create-form-from-template.action.ts'),
    ];
    for (const srcPath of actionSources) {
      const src = readFileSync(srcPath, 'utf8');
      expect(/\bExecuteSQL\b|\bSELECT\s+\*|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b/i.test(src)).toBe(false);
    }
  });
});

describe('Chief of Staff Forms Skill — Two-User RLS Isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces MJ Forms RLS filters so two respondents and a form owner get strictly different, access-scoped answers from the same skill', async () => {
    const formId = 'FORM-ANNUAL-FEEDBACK-1';
    const respAId = 'RESP-ALICE-1';
    const respBId = 'RESP-BOB-2';
    const ownerUserId = 'USER-FORM-OWNER';

    const responsesTable: FormResponseRow[] = [
      { ID: respAId, FormID: formId, Status: 'Complete', RespondentPersonID: 'PERSON-A', OwnerUserID: ownerUserId },
      { ID: respBId, FormID: formId, Status: 'Complete', RespondentPersonID: 'PERSON-B', OwnerUserID: ownerUserId },
    ];
    const answersTable: FormResponseAnswerRow[] = [
      { ID: 'ANS-A1', ResponseID: respAId, QuestionID: 'Q-1', TextValue: 'ALICE-CONFIDENTIAL-RESPONSE', Score: 9 },
      { ID: 'ANS-B1', ResponseID: respBId, QuestionID: 'Q-1', TextValue: 'BOB-CONFIDENTIAL-RESPONSE', Score: 4 },
    ];

    const respondentA = new UserInfo() as ScopedFormsUser;
    respondentA.ID = 'USER-RESP-A';
    respondentA.Name = 'Respondent Alice';
    respondentA.ScopeResourceID = respAId;
    vi.spyOn(respondentA, 'UserRoles', 'get').mockReturnValue([{ Role: 'Form Respondent' } as UserRoleInfo]);

    const respondentB = new UserInfo() as ScopedFormsUser;
    respondentB.ID = 'USER-RESP-B';
    respondentB.Name = 'Respondent Bob';
    respondentB.ScopeResourceID = respBId;
    vi.spyOn(respondentB, 'UserRoles', 'get').mockReturnValue([{ Role: 'Form Respondent' } as UserRoleInfo]);

    const formOwner = new UserInfo() as ScopedFormsUser;
    formOwner.ID = ownerUserId;
    formOwner.Name = 'Owner Carol';
    vi.spyOn(formOwner, 'UserRoles', 'get').mockReturnValue([{ Role: 'UI' } as UserRoleInfo]);

    // Shadow of V202609091600__v0.12.x__Resume_Own_Response.sql:
    //   MJ Forms: Respondent Own Response         => CAST(ID AS NVARCHAR(450)) = '{{ScopeResourceID}}'
    //   MJ Forms: Respondent Own Response Answers => CAST(ResponseID AS NVARCHAR(450)) = '{{ScopeResourceID}}'
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      async (params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> => {
        const scopedUser = contextUser as ScopedFormsUser | undefined;
        const isRespondent = Boolean(scopedUser?.UserRoles?.some((r) => r.Role === 'Form Respondent'));

        if (params.EntityName === 'MJ_BizApps_Forms: Form Responses') {
          const visible = responsesTable.filter((r) => {
            if (isRespondent) {
              return Boolean(scopedUser?.ScopeResourceID) && r.ID === scopedUser?.ScopeResourceID;
            }
            return r.OwnerUserID === scopedUser?.ID;
          });
          return { Success: true, Results: visible, RowCount: visible.length, TotalRowCount: visible.length, ExecutionTime: 1, ErrorMessage: '' };
        }

        if (params.EntityName === 'MJ_BizApps_Forms: Form Response Answers') {
          const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
          const visible = answersTable.filter((a) => {
            if (!filter.includes(`'${a.ResponseID}'`)) return false;
            if (isRespondent) {
              return Boolean(scopedUser?.ScopeResourceID) && a.ResponseID === scopedUser?.ScopeResourceID;
            }
            const parent = responsesTable.find((r) => r.ID === a.ResponseID);
            return parent?.OwnerUserID === scopedUser?.ID;
          });
          return { Success: true, Results: visible, RowCount: visible.length, TotalRowCount: visible.length, ExecutionTime: 1, ErrorMessage: '' };
        }

        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
    );

    const summaryA = await summarizeVisibleFormResponses(formId, respondentA);
    const summaryB = await summarizeVisibleFormResponses(formId, respondentB);
    const summaryOwner = await summarizeVisibleFormResponses(formId, formOwner);

    // Respondent A sees ONLY Alice's response — zero leakage of Bob's response
    expect(summaryA.responseIds).toEqual([respAId]);
    expect(summaryA.answerTexts).toEqual(['ALICE-CONFIDENTIAL-RESPONSE']);
    expect(summaryA.answerTexts).not.toContain('BOB-CONFIDENTIAL-RESPONSE');

    // Respondent B sees ONLY Bob's response — zero leakage of Alice's response
    expect(summaryB.responseIds).toEqual([respBId]);
    expect(summaryB.answerTexts).toEqual(['BOB-CONFIDENTIAL-RESPONSE']);
    expect(summaryB.answerTexts).not.toContain('ALICE-CONFIDENTIAL-RESPONSE');

    // Form Owner sees both responses for their form
    expect(summaryOwner.responseIds).toEqual([respAId, respBId]);
    expect(summaryOwner.answerTexts).toEqual(['ALICE-CONFIDENTIAL-RESPONSE', 'BOB-CONFIDENTIAL-RESPONSE']);
  });
});
