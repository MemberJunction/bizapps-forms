import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type {
  mjBizAppsFormsFormEntity,
  FormQuestionType,
  FormRenderMode,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
import { BuilderStateService } from './builder-state.service';
import { PublishService, type PublishResult } from './publish.service';
import { QuestionEditorComponent } from './question-editor.component';
import { DistributionManagerComponent } from './distribution-manager.component';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import {
  QUESTION_PALETTE_GROUPS,
  questionTypeMeta,
  questionTypesInGroup,
  type QuestionPaletteGroup,
  type QuestionTypeMeta,
} from './question-type-catalog';
import type { ConditionalSourceQuestion } from './conditional-rule-editor.component';
import { FORM_BUILDER_STYLES } from './form-builder.styles';

/** Which workspace tab is showing. */
type BuilderTab = 'build' | 'distribute';

/**
 * The visual form builder — registered as the override for the
 * `MJ_BizApps_Forms: Forms` entity form so that opening a Form record in Explorer
 * renders the builder instead of the generated property grid (FORMS_BUILD_PLAN §9).
 *
 * Layout (desktop): a left palette of question types, a center canvas listing the
 * questions, and a right properties panel for the selected question. A second tab
 * manages distributions. Publishing snapshots the definition into a new FormVersion
 * via {@link PublishService}.
 *
 * The component extends {@link BaseFormComponent} so the Explorer host wires `record`
 * (the loaded Form entity) and the save/navigation plumbing. We render our own UI
 * rather than the generated template.
 */
@RegisterClass(BaseFormComponent, FORMS_ENTITY.Form, 10)
@Component({
  selector: 'mjf-form-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionEditorComponent, DistributionManagerComponent],
  providers: [BuilderStateService, PublishService],
  templateUrl: './form-builder.component.html',
  styles: [FORM_BUILDER_STYLES],
})
export class FormBuilderComponent extends BaseFormComponent {
  declare public record: mjBizAppsFormsFormEntity;

  private readonly state = inject(BuilderStateService);
  private readonly publisher = inject(PublishService);

  protected readonly paletteGroups = QUESTION_PALETTE_GROUPS;
  protected tree: FormTree | null = null;
  protected selectedQuestionId: string | null = null;
  protected activeTab: BuilderTab = 'build';
  protected busy = false;
  protected statusMessage = '';

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    await this.loadBuilder();
  }

  private async loadBuilder(): Promise<void> {
    this.busy = true;
    this.tree = await this.state.loadTree(this.record);
    if (this.tree.pages.length === 0) {
      const page = await this.state.addPage(this.tree, 'Page 1');
      if (page) {
        this.tree.pages.push(page);
      }
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  // -- palette --------------------------------------------------------------

  protected typesInGroup(group: QuestionPaletteGroup): QuestionTypeMeta[] {
    return questionTypesInGroup(group);
  }

  protected async addQuestion(type: FormQuestionType): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    const page = this.targetPageForNewQuestion();
    if (!page) {
      return;
    }
    this.busy = true;
    const node = await this.state.addQuestion(this.tree, page, type, this.defaultPrompt(type));
    if (node) {
      page.questions.push(node);
      this.selectedQuestionId = node.entity.ID;
    }
    this.busy = false;
    this.cdr.markForCheck();
  }

  /** Add to the page holding the selected question, else the last page. */
  private targetPageForNewQuestion(): PageNode | undefined {
    if (!this.tree || this.tree.pages.length === 0) {
      return undefined;
    }
    if (this.selectedQuestionId) {
      const owner = this.tree.pages.find((p) =>
        p.questions.some((q) => q.entity.ID === this.selectedQuestionId),
      );
      if (owner) {
        return owner;
      }
    }
    return this.tree.pages[this.tree.pages.length - 1];
  }

  private defaultPrompt(type: FormQuestionType): string {
    return type === 'Statement' ? 'Add your statement text here' : `Untitled ${questionTypeMeta(type).label} question`;
  }

  // -- canvas / selection ---------------------------------------------------

  protected get pages(): PageNode[] {
    return this.tree?.pages ?? [];
  }

  protected selectQuestion(node: QuestionNode): void {
    this.selectedQuestionId = node.entity.ID;
    this.cdr.markForCheck();
  }

  protected get selectedNode(): QuestionNode | null {
    if (!this.tree || !this.selectedQuestionId) {
      return null;
    }
    for (const page of this.tree.pages) {
      const found = page.questions.find((q) => q.entity.ID === this.selectedQuestionId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /** Questions preceding the selected one (valid conditional-rule sources). */
  protected get conditionalSources(): ConditionalSourceQuestion[] {
    if (!this.tree || !this.selectedQuestionId) {
      return [];
    }
    const sources: ConditionalSourceQuestion[] = [];
    for (const page of this.tree.pages) {
      for (const q of page.questions) {
        if (q.entity.ID === this.selectedQuestionId) {
          return sources;
        }
        sources.push({ id: q.entity.ID, prompt: q.entity.Prompt });
      }
    }
    return sources;
  }

  protected metaFor(node: QuestionNode): QuestionTypeMeta {
    return questionTypeMeta(node.entity.QuestionType);
  }

  protected displayIndex(page: PageNode, node: QuestionNode): string {
    const idx = page.questions.indexOf(node) + 1;
    return idx.toString().padStart(2, '0');
  }

  // -- editing handlers (persist on change) ---------------------------------

  protected async onQuestionChanged(node: QuestionNode): Promise<void> {
    await this.state.save(node.entity);
    this.cdr.markForCheck();
  }

  protected async onAddOption(node: QuestionNode): Promise<void> {
    const option = await this.state.addOption(node, `Option ${node.options.length + 1}`);
    if (option) {
      node.options.push(option);
      this.cdr.markForCheck();
    }
  }

  protected async onRemoveOption(event: { node: QuestionNode; optionIndex: number }): Promise<void> {
    const { node, optionIndex } = event;
    const option = node.options[optionIndex];
    if (option && (await this.state.deleteOption(option))) {
      node.options.splice(optionIndex, 1);
      await this.state.persistOptionOrder(node);
      this.cdr.markForCheck();
    }
  }

  protected async deleteQuestion(page: PageNode, node: QuestionNode): Promise<void> {
    if (this.busy || !(await this.state.deleteQuestion(node))) {
      return;
    }
    page.questions = page.questions.filter((q) => q !== node);
    await this.state.persistQuestionOrder(page);
    if (this.selectedQuestionId === node.entity.ID) {
      this.selectedQuestionId = null;
    }
    this.cdr.markForCheck();
  }

  protected async moveQuestion(page: PageNode, node: QuestionNode, delta: number): Promise<void> {
    const index = page.questions.indexOf(node);
    const target = index + delta;
    if (target < 0 || target >= page.questions.length) {
      return;
    }
    const reordered = [...page.questions];
    reordered.splice(index, 1);
    reordered.splice(target, 0, node);
    page.questions = reordered;
    await this.state.persistQuestionOrder(page);
    this.cdr.markForCheck();
  }

  // -- form-level settings --------------------------------------------------

  protected async setRenderMode(mode: FormRenderMode): Promise<void> {
    if (!this.tree || this.record.RenderMode === mode) {
      return;
    }
    this.record.RenderMode = mode;
    await this.state.save(this.record);
    this.cdr.markForCheck();
  }

  protected async setName(name: string): Promise<void> {
    this.record.Name = name;
    await this.state.save(this.record);
    this.cdr.markForCheck();
  }

  // -- publish --------------------------------------------------------------

  protected async publish(): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    this.busy = true;
    this.statusMessage = '';
    const result: PublishResult = await this.publisher.publish(this.tree);
    this.busy = false;
    if (result.success) {
      this.statusMessage = `Published version ${result.versionNumber}.`;
    } else {
      this.statusMessage = result.error ?? 'Publish failed.';
    }
    this.cdr.markForCheck();
  }

  protected setTab(tab: BuilderTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }
}
