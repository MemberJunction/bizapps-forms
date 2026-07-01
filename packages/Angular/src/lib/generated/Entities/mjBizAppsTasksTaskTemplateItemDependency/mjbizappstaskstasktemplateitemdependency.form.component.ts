import { Component } from '@angular/core';
import { mjBizAppsTasksTaskTemplateItemDependencyEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Tasks: Task Template Item Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappstaskstasktemplateitemdependency-form',
    templateUrl: './mjbizappstaskstasktemplateitemdependency.form.component.html'
})
export class mjBizAppsTasksTaskTemplateItemDependencyFormComponent extends BaseFormComponent {
    public record!: mjBizAppsTasksTaskTemplateItemDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

