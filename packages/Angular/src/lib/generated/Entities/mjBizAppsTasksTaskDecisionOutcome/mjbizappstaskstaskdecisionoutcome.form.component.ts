import { Component } from '@angular/core';
import { mjBizAppsTasksTaskDecisionOutcomeEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Decision Outcomes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskdecisionoutcome-form',
    templateUrl: './mjbizappstaskstaskdecisionoutcome.form.component.html'
})
export class mjBizAppsTasksTaskDecisionOutcomeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskDecisionOutcomeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskDecisions', sectionName: 'Task Decisions', isExpanded: false }
        ]);
    }
}

