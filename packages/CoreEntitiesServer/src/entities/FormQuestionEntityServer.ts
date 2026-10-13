/**
 * Server-side `MJ_BizApps_Forms: Form Questions`: deleting a question DIRECTLY — `question.Delete()`,
 * from any writer — deletes its options with it, in the same transaction.
 *
 * MJ already knows how to do that — `Options` is a related-record collection declared
 * `OnRemove: 'delete'`, and `BaseEntity.Delete()` runs a delete graph (options first, then the
 * question) inside one provider transaction. But the graph contains only the options the
 * collection has LOADED, and nothing loads it on the way to a delete: a question fetched by
 * `RunView`, by `Load()` without relationships, or rebuilt server-side by `MJ.SaveEntityGraph`
 * arrives with an empty, unloaded collection. Its delete then reaches the database alone and, when
 * the question has options, fails on `FormQuestionOption`'s foreign key — so whether "delete this
 * question" worked depended on how the caller happened to load it.
 *
 * So this loads the collection first. That keeps one cascade implementation (MJ's) rather than a
 * second, hand-written delete loop that would have to agree with it.
 *
 * NOT covered: a question deleted as a NODE of someone else's delete graph. When a page is deleted
 * with its `Questions` loaded, MJ runs each question's node through the private
 * `deleteAsGraphNode` → `_innerDelete`, which never calls this override. And those questions were
 * loaded through the page collection's RunView, which does not load their `immediate` companions,
 * so their `Options` are empty and the plan omits them — the page delete then fails on
 * `FormQuestionOption`'s foreign key. Task 10 (DW14, structural edits as one `MJ.SaveEntityGraph`)
 * must load each question's `Options` before deleting a page, or delete deepest-first; a
 * `FormPage` server subclass that force-loads them before `super.Delete()` is one way.
 */
import { BaseEntity, LogError, type EntityDeleteOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsFormsFormQuestionEntity } from '@mj-biz-apps/forms-entities';
import { refuse } from './entity-refusal.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';

export const FORM_QUESTION_ENTITY_NAME = FORMS_ENTITY.FormQuestion;

@RegisterClass(BaseEntity, FORM_QUESTION_ENTITY_NAME)
export class FormQuestionEntityServer extends mjBizAppsFormsFormQuestionEntity {
  public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
    if (this.IsSaved && !this.Options.IsLoaded) {
      try {
        // Forced, because a collection that was only ever appended to is unloaded AND dirty, and a
        // plain Load() refuses to discard its unsaved children. Discarding them is right here: the
        // question is being deleted, so they could never be saved, and the reload brings back
        // every stored option — any queued removal included — for the graph to delete.
        await this.Options.Load(true);
      } catch (e) {
        const message =
          `Could not delete question ${this.ID}: its options could not be read ` +
          `(${e instanceof Error ? e.message : String(e)}), and deleting the question without them would ` +
          `either fail on their foreign key or leave them behind. Nothing was deleted.`;
        LogError(`[FormQuestionEntityServer] ${message}`);
        return refuse(this, 'delete', message);
      }
    }
    return super.Delete(options);
  }
}
