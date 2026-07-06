import { Component } from '@angular/core';
import { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Common: People') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappscommonperson-form',
    templateUrl: './mjbizappscommonperson.form.component.html'
})
export class mjBizAppsCommonPersonFormComponent extends BaseFormComponent {
    public record!: mjBizAppsCommonPersonEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalIdentity', sectionName: 'Personal Identity', isExpanded: true },
            { sectionKey: 'professionalAndProfile', sectionName: 'Professional and Profile', isExpanded: true },
            { sectionKey: 'accountAndStatus', sectionName: 'Account and Status', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonContactMethods', sectionName: 'MJ_BizApps_Common: Contact Methods', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonRelationshipsToPersonID', sectionName: 'MJ_BizApps_Common: Relationships', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskComments', sectionName: 'Task Comments', isExpanded: false },
            { sectionKey: 'mJBizAppsCommonRelationshipsFromPersonID', sectionName: 'MJ_BizApps_Common: Relationships', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskAssignments', sectionName: 'Task Assignments', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskActivities', sectionName: 'Task Activities', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTasks', sectionName: 'Tasks', isExpanded: false },
            { sectionKey: 'mJBizAppsTasksTaskDecisions', sectionName: 'Task Decisions', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormResponses', sectionName: 'Form Responses', isExpanded: false }
        ]);
    }
}

