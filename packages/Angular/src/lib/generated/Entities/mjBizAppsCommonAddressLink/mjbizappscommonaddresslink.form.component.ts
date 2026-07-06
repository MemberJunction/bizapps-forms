import { Component } from '@angular/core';
import { mjBizAppsCommonAddressLinkEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Address Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonaddresslink-form',
    templateUrl: './mjbizappscommonaddresslink.form.component.html'
})
export class mjBizAppsCommonAddressLinkFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonAddressLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkageDetails', sectionName: 'Linkage Details', isExpanded: true },
            { sectionKey: 'addressPreferences', sectionName: 'Address Preferences', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

