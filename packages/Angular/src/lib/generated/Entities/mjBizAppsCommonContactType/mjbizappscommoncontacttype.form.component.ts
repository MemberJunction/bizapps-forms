import { Component } from '@angular/core';
import { mjBizAppsCommonContactTypeEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Contact Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommoncontacttype-form',
    templateUrl: './mjbizappscommoncontacttype.form.component.html'
})
export class mjBizAppsCommonContactTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonContactTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'typeDefinition', sectionName: 'Type Definition', isExpanded: true },
            { sectionKey: 'uIConfiguration', sectionName: 'UI Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonContactMethods', sectionName: 'MJ_BizApps_Common: Contact Methods', isExpanded: false }
        ]);
    }
}

