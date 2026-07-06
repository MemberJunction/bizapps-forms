import { Component } from '@angular/core';
import { mjBizAppsTasksTaskLinkEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasklink-form',
    templateUrl: './mjbizappstaskstasklink.form.component.html'
})
export class mjBizAppsTasksTaskLinkFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

