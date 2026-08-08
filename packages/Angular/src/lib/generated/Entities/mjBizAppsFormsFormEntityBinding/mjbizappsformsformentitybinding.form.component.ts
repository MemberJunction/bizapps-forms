import { Component } from '@angular/core';
import { mjBizAppsFormsFormEntityBindingEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Entity Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformentitybinding-form',
    templateUrl: './mjbizappsformsformentitybinding.form.component.html'
})
export class mjBizAppsFormsFormEntityBindingFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormEntityBindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bindingConfiguration', sectionName: 'Binding Configuration', isExpanded: true },
            { sectionKey: 'targetEntityDetails', sectionName: 'Target Entity Details', isExpanded: true },
            { sectionKey: 'logicAndRules', sectionName: 'Logic and Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormAutomations', sectionName: 'Form Automations', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormEntityBindingRecords', sectionName: 'Form Entity Binding Records', isExpanded: false }
        ]);
    }
}

