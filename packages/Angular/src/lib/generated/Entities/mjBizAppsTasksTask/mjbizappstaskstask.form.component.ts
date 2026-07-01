import { Component } from '@angular/core';
import { mjBizAppsTasksTaskEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstask-form',
    templateUrl: './mjbizappstaskstask.form.component.html'
})
export class mjBizAppsTasksTaskFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskDependenciesDependsOnTaskID', sectionName: 'Task Dependencies (Depends On Task ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskDependenciesTaskID', sectionName: 'Task Dependencies (Task ID)', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTasks', sectionName: 'Tasks', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskAssignments', sectionName: 'Task Assignments', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskLinks', sectionName: 'Task Links', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskComments', sectionName: 'Task Comments', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskActivities', sectionName: 'Task Activities', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskTagLinks', sectionName: 'Task Tag Links', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskNotificationLogs', sectionName: 'Task Notification Logs', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskDecisions', sectionName: 'Task Decisions', isExpanded: false }
        ]);
    }
}

