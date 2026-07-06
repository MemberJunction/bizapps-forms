import { Component } from '@angular/core';
import { mjBizAppsTasksTaskRoleEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskrole-form',
    templateUrl: './mjbizappstaskstaskrole.form.component.html'
})
export class mjBizAppsTasksTaskRoleFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskTemplateItemRoles', sectionName: 'Task Template Item Roles', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskAssignments', sectionName: 'Task Assignments', isExpanded: false }
        ]);
    }
}

