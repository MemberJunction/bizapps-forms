import { Component } from '@angular/core';
import { mjBizAppsTasksTaskNotificationLogEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Notification Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasknotificationlog-form',
    templateUrl: './mjbizappstaskstasknotificationlog.form.component.html'
})
export class mjBizAppsTasksTaskNotificationLogFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskNotificationLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

