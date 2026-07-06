import { Component } from '@angular/core';
import { mjBizAppsCommonRelationshipTypeEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Relationship Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonrelationshiptype-form',
    templateUrl: './mjbizappscommonrelationshiptype.form.component.html'
})
export class mjBizAppsCommonRelationshipTypeFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonRelationshipTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'typeDefinition', sectionName: 'Type Definition', isExpanded: true },
            { sectionKey: 'directionalityAndLabels', sectionName: 'Directionality and Labels', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonRelationships', sectionName: 'MJ_BizApps_Common: Relationships', isExpanded: false }
        ]);
    }
}

