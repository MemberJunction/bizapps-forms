import { Component } from '@angular/core';
import { mjBizAppsTasksTaskTypeEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasktype-form',
    templateUrl: './mjbizappstaskstasktype.form.component.html'
})
export class mjBizAppsTasksTaskTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskNotificationConfigs', sectionName: 'Task Notification Configs', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTasks', sectionName: 'Tasks', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskTemplates', sectionName: 'Task Templates', isExpanded: false }
        ]);
    }
}

