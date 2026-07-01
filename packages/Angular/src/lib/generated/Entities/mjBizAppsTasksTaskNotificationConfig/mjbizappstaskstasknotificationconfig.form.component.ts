import { Component } from '@angular/core';
import { mjBizAppsTasksTaskNotificationConfigEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Notification Configs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasknotificationconfig-form',
    templateUrl: './mjbizappstaskstasknotificationconfig.form.component.html'
})
export class mjBizAppsTasksTaskNotificationConfigFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskNotificationConfigEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

