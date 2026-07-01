import { Component } from '@angular/core';
import { mjBizAppsCommonAddressTypeEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Address Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonaddresstype-form',
    templateUrl: './mjbizappscommonaddresstype.form.component.html'
})
export class mjBizAppsCommonAddressTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonAddressTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'typeDefinition', sectionName: 'Type Definition', isExpanded: true },
            { sectionKey: 'displayAndSorting', sectionName: 'Display and Sorting', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonAddressLinks', sectionName: 'MJ_BizApps_Common: Address Links', isExpanded: false }
        ]);
    }
}

