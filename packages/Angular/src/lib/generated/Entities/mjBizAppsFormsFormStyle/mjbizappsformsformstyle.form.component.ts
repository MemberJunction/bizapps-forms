import { Component } from '@angular/core';
import { mjBizAppsFormsFormStyleEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Styles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformstyle-form',
    templateUrl: './mjbizappsformsformstyle.form.component.html'
})
export class mjBizAppsFormsFormStyleFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormStyleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'styleIdentity', sectionName: 'Style Identity', isExpanded: true },
            { sectionKey: 'themeCode', sectionName: 'Theme Code', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsForms', sectionName: 'Forms', isExpanded: false }
        ]);
    }
}

