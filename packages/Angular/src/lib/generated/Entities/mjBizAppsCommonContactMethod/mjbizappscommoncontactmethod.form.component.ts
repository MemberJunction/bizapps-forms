import { Component } from '@angular/core';
import { mjBizAppsCommonContactMethodEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Contact Methods') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommoncontactmethod-form',
    templateUrl: './mjbizappscommoncontactmethod.form.component.html'
})
export class mjBizAppsCommonContactMethodFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonContactMethodEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkedRecord', sectionName: 'Linked Record', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

