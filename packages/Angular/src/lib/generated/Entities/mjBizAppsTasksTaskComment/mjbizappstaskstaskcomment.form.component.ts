import { Component } from '@angular/core';
import { mjBizAppsTasksTaskCommentEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Comments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskcomment-form',
    templateUrl: './mjbizappstaskstaskcomment.form.component.html'
})
export class mjBizAppsTasksTaskCommentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskComments', sectionName: 'Task Comments', isExpanded: false }
        ]);
    }
}

