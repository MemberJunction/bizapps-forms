import { Component } from '@angular/core';
import { mjBizAppsFormsFormCategoryEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformcategory-form',
    templateUrl: './mjbizappsformsformcategory.form.component.html'
})
export class mjBizAppsFormsFormCategoryFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyAndSorting', sectionName: 'Hierarchy and Sorting', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsForms', sectionName: 'Forms', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormCategories', sectionName: 'Form Categories', isExpanded: false }
        ]);
    }
}

