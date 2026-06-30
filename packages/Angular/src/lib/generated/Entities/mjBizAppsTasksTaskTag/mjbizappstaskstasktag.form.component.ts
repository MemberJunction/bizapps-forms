import { Component } from '@angular/core';
import { mjBizAppsTasksTaskTagEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasktag-form',
    templateUrl: './mjbizappstaskstasktag.form.component.html'
})
export class mjBizAppsTasksTaskTagFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJBizAppsTasksTaskTagLinks', sectionName: 'Task Tag Links', isExpanded: false }
        ]);
    }
}

