import { Component } from '@angular/core';
import { mjBizAppsTasksTaskAssignmentEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Assignments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskassignment-form',
    templateUrl: './mjbizappstaskstaskassignment.form.component.html'
})
export class mjBizAppsTasksTaskAssignmentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskAssignmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskDecisions', sectionName: 'Task Decisions', isExpanded: false }
        ]);
    }
}

