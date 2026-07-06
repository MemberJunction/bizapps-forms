import { Component } from '@angular/core';
import { mjBizAppsCommonRelationshipEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: Relationships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonrelationship-form',
    templateUrl: './mjbizappscommonrelationship.form.component.html'
})
export class mjBizAppsCommonRelationshipFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonRelationshipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipParticipants', sectionName: 'Relationship Participants', isExpanded: true },
            { sectionKey: 'relationshipDetails', sectionName: 'Relationship Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

