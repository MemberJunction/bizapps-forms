import { Component } from '@angular/core';
import { mjBizAppsTasksTaskTagLinkEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Tag Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasktaglink-form',
    templateUrl: './mjbizappstaskstasktaglink.form.component.html'
})
export class mjBizAppsTasksTaskTagLinkFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskTagLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

