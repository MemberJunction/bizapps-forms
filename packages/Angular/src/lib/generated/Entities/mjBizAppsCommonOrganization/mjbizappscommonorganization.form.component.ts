import { Component } from '@angular/core';
import { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Organizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonorganization-form',
    templateUrl: './mjbizappscommonorganization.form.component.html'
})
export class mjBizAppsCommonOrganizationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonOrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'organizationIdentity', sectionName: 'Organization Identity', isExpanded: true },
            { sectionKey: 'hierarchyAndStructure', sectionName: 'Hierarchy and Structure', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonOrganizations', sectionName: 'MJ_BizApps_Common: Organizations', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonRelationshipsToOrganizationID', sectionName: 'MJ_BizApps_Common: Relationships', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonContactMethods', sectionName: 'MJ_BizApps_Common: Contact Methods', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonRelationshipsFromOrganizationID', sectionName: 'MJ_BizApps_Common: Relationships', isExpanded: false }
        ]);
    }
}

