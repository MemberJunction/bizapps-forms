import { Component } from '@angular/core';
import { mjBizAppsCommonOrganizationTypeEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Organization Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonorganizationtype-form',
    templateUrl: './mjbizappscommonorganizationtype.form.component.html'
})
export class mjBizAppsCommonOrganizationTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonOrganizationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'organizationTypeDetails', sectionName: 'Organization Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonOrganizations', sectionName: 'MJ_BizApps_Common: Organizations', isExpanded: false }
        ]);
    }
}

