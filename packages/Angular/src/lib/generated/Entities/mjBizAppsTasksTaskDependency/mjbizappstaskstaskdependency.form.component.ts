import { Component } from '@angular/core';
import { mjBizAppsTasksTaskDependencyEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskdependency-form',
    templateUrl: './mjbizappstaskstaskdependency.form.component.html'
})
export class mjBizAppsTasksTaskDependencyFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

