import { Component } from '@angular/core';
import { mjBizAppsFormsFormScreenEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Screens') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformscreen-form',
    templateUrl: './mjbizappsformsformscreen.form.component.html'
})
export class mjBizAppsFormsFormScreenFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormScreenEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formAssociation', sectionName: 'Form Association', isExpanded: true },
            { sectionKey: 'screenConfiguration', sectionName: 'Screen Configuration', isExpanded: true },
            { sectionKey: 'content', sectionName: 'Content', isExpanded: true },
            { sectionKey: 'behavioralRules', sectionName: 'Behavioral Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

