import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { HierarchyTreeComponent, HierarchyTreeConfig } from '@memberjunction/ng-hierarchy-tree';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { mjBizAppsFormsFormCategoryEntity } from '@mj-biz-apps/forms-entities';

/**
 * Form Category Hierarchy & Taxonomy Tree Panel.
 *
 * Attaches to `MJ_BizApps_Forms: Form Categories` and renders an interactive
 * form category taxonomy tree visualizer powered by `@memberjunction/ng-hierarchy-tree`.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:FormCategories:hierarchy',
    metadata: {
        entity: 'MJ_BizApps_Forms: Form Categories',
        slot: 'after-related',
        sortKey: 40,
        relatedEntity: 'MJ_BizApps_Forms: Form Categories',
        relatedJoinField: 'ParentID'
    }
})
@Component({
    selector: 'bizapps-form-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="formCategoryHierarchy"
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            min-height: 640px;
            min-height: calc(100vh - 280px);
            flex: 1;
            margin-bottom: 20px;
        }
    `]
})
export class FormCategoryHierarchyPanel extends BaseFormPanel<mjBizAppsFormsFormCategoryEntity> {
    private readonly SETTING_KEY = 'mj.hierarchyTree.zoom.form_categories';
    private _treeConfig: HierarchyTreeConfig | null = null;
    private _cachedRecordId: string | null = null;

    public get persistedZoomLevel(): number | undefined {
        const raw = UserInfoEngine.Instance.GetSetting(this.SETTING_KEY);
        return raw ? parseFloat(raw) : undefined;
    }

    public onZoomChange(zoom: number): void {
        UserInfoEngine.Instance.SetSettingDebounced(this.SETTING_KEY, zoom.toFixed(2));
    }

    public onNavigate(event: FormNavigationEvent): void {
        if (this.FormComponent?.OnFormNavigate) {
            this.FormComponent.OnFormNavigate(event);
        }
    }

    public get treeConfig(): HierarchyTreeConfig {
        const recId = this.Record?.ID || null;
        if (!this._treeConfig || this._cachedRecordId !== recId) {
            this._cachedRecordId = recId;
            this._treeConfig = {
                EntityName: 'MJ_BizApps_Forms: Form Categories',
                ParentField: 'ParentID',
                SubtitleField: 'Description',
                DefaultIcon: 'fa-solid fa-folder-tree',
                // The tree binds this straight into [style.background] / [style.color], so a
                // var() resolves — which is how MJ's own component defaults the same field.
                DefaultColor: 'var(--mj-brand-primary, #6366f1)',
                ActiveRecordID: recId || undefined,
                Height: '100%',
                MinHeight: '640px',
                ShowSearch: true,
                ShowToolbar: true,
                Orientation: 'top-to-bottom'
            };
        }
        return this._treeConfig;
    }
}
