import { Component } from '@angular/core';
import { mjBizAppsTasksTaskDecisionEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Decisions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskdecision-form',
    templateUrl: './mjbizappstaskstaskdecision.form.component.html'
})
export class mjBizAppsTasksTaskDecisionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskDecisionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

