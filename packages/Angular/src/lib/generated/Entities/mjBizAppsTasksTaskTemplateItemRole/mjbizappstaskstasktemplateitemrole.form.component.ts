import { Component } from '@angular/core';
import { mjBizAppsTasksTaskTemplateItemRoleEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Template Item Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasktemplateitemrole-form',
    templateUrl: './mjbizappstaskstasktemplateitemrole.form.component.html'
})
export class mjBizAppsTasksTaskTemplateItemRoleFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskTemplateItemRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

