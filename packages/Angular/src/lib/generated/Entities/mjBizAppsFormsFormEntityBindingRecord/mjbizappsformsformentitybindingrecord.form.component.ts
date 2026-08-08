import { Component } from '@angular/core';
import { mjBizAppsFormsFormEntityBindingRecordEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Entity Binding Records') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformentitybindingrecord-form',
    templateUrl: './mjbizappsformsformentitybindingrecord.form.component.html'
})
export class mjBizAppsFormsFormEntityBindingRecordFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormEntityBindingRecordEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bindingDetails', sectionName: 'Binding Details', isExpanded: true },
            { sectionKey: 'executionContext', sectionName: 'Execution Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

