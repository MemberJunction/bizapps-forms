import { Component } from '@angular/core';
import { mjBizAppsTasksTaskTemplateItemEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Template Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasktemplateitem-form',
    templateUrl: './mjbizappstaskstasktemplateitem.form.component.html'
})
export class mjBizAppsTasksTaskTemplateItemFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskTemplateItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskTemplateItems', sectionName: 'Task Template Items', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskTemplateItemRoles', sectionName: 'Task Template Item Roles', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskTemplateItemDependenciesDependsOnItemID', sectionName: 'Task Template Item Dependencies (Depends On Item ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskTemplateItemDependenciesItemID', sectionName: 'Task Template Item Dependencies (Item ID)', isExpanded: false }
        ]);
    }
}

