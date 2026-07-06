import { Component } from '@angular/core';
import { mjBizAppsCommonAddressEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Addresses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonaddress-form',
    templateUrl: './mjbizappscommonaddress.form.component.html'
})
export class mjBizAppsCommonAddressFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonAddressEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'addressDetails', sectionName: 'Address Details', isExpanded: true },
            { sectionKey: 'geographicLocation', sectionName: 'Geographic Location', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonAddressLinks', sectionName: 'MJ_BizApps_Common: Address Links', isExpanded: false }
        ]);
    }
}

