import { Component } from '@angular/core';
import { mjBizAppsTasksTaskActivityEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Activities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstaskactivity-form',
    templateUrl: './mjbizappstaskstaskactivity.form.component.html'
})
export class mjBizAppsTasksTaskActivityFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskActivityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

