/**
 * Starter template gallery — the no-AI "easy setup" path (FORMS_BUILD_PLAN §7).
 *
 * Each template is a ready-made {@link FormBlueprint} the builder can instantiate
 * verbatim (then the user tweaks). They go through the SAME deterministic Builder as
 * the AI path, so they're guaranteed to conform to the §5.3 taxonomy and the contract
 * shapes — and they double as known-good fixtures for the builder tests.
 */
import type { FormBlueprint } from '../authoring/form-blueprint';

/** A gallery entry: a stable key + display metadata + the blueprint to instantiate. */
export interface StarterTemplate {
  /** Stable, machine-friendly key (used as the action's TemplateKey param). */
  key: string;
  name: string;
  description: string;
  /** Font Awesome icon class for the gallery card. */
  icon: string;
  blueprint: FormBlueprint;
}

const contactTemplate: StarterTemplate = {
  key: 'contact',
  name: 'Contact form',
  description: 'A simple name / email / message form for general enquiries.',
  icon: 'fa-solid fa-envelope',
  blueprint: {
    name: 'Contact us',
    description: "Send us a message and we'll get back to you.",
    renderMode: 'Scroll',
    confirmationMessage: 'Thanks for reaching out — we’ll be in touch soon.',
    pages: [
      {
        questions: [
          { type: 'ShortText', prompt: 'Your name', isRequired: true },
          { type: 'Email', prompt: 'Email address', isRequired: true },
          { type: 'LongText', prompt: 'How can we help?', isRequired: true },
        ],
      },
    ],
  },
};

const rsvpTemplate: StarterTemplate = {
  key: 'rsvp',
  name: 'Event RSVP',
  description: 'Collect attendance, a +1 count, and dietary restrictions for an event.',
  icon: 'fa-solid fa-calendar-check',
  blueprint: {
    name: 'Event RSVP',
    description: 'Let us know if you can make it.',
    renderMode: 'Scroll',
    confirmationMessage: 'Your RSVP has been recorded. See you there!',
    pages: [
      {
        questions: [
          { type: 'ShortText', prompt: 'Your name', isRequired: true },
          { type: 'Email', prompt: 'Email address', isRequired: true },
          {
            type: 'SingleChoice',
            prompt: 'Will you attend?',
            isRequired: true,
            options: [
              { label: 'Yes, I’ll be there', value: 'yes' },
              { label: 'No, I can’t make it', value: 'no' },
            ],
          },
          {
            type: 'Number',
            prompt: 'How many additional guests (+1s)?',
            helpText: 'Enter 0 if you are coming alone.',
            settings: { min: 0, max: 10 },
          },
          {
            type: 'MultiChoice',
            prompt: 'Dietary restrictions',
            options: [
              { label: 'Vegetarian', value: 'vegetarian' },
              { label: 'Vegan', value: 'vegan' },
              { label: 'Gluten-free', value: 'gluten_free' },
              { label: 'Nut allergy', value: 'nut_allergy' },
              { label: 'None', value: 'none', isDefault: true },
            ],
          },
        ],
      },
    ],
  },
};

const npsTemplate: StarterTemplate = {
  key: 'nps',
  name: 'NPS / feedback',
  description: 'A Net Promoter Score question plus an open-ended follow-up.',
  icon: 'fa-solid fa-star',
  blueprint: {
    name: 'How are we doing?',
    description: 'Your feedback helps us improve.',
    renderMode: 'OneQuestion',
    confirmationMessage: 'Thanks for your feedback!',
    pages: [
      {
        questions: [
          {
            type: 'NPS',
            prompt: 'How likely are you to recommend us to a friend or colleague?',
            isRequired: true,
          },
          { type: 'LongText', prompt: 'What is the main reason for your score?' },
          {
            type: 'Rating',
            prompt: 'Overall satisfaction',
            settings: { min: 1, max: 5 },
          },
        ],
      },
    ],
  },
};

const leadCaptureTemplate: StarterTemplate = {
  key: 'lead-capture',
  name: 'Lead capture',
  description: 'Capture a prospect’s contact details and interest.',
  icon: 'fa-solid fa-user-plus',
  blueprint: {
    name: 'Get in touch',
    description: 'Tell us a bit about yourself and we’ll follow up.',
    renderMode: 'Scroll',
    confirmationMessage: 'Thanks! A member of our team will reach out shortly.',
    pages: [
      {
        questions: [
          { type: 'ShortText', prompt: 'Full name', isRequired: true },
          { type: 'Email', prompt: 'Work email', isRequired: true },
          { type: 'Phone', prompt: 'Phone number' },
          { type: 'ShortText', prompt: 'Company' },
          {
            type: 'Dropdown',
            prompt: 'What are you interested in?',
            isRequired: true,
            options: [
              { label: 'A product demo', value: 'demo' },
              { label: 'Pricing information', value: 'pricing' },
              { label: 'A partnership', value: 'partnership' },
              { label: 'Something else', value: 'other' },
            ],
          },
          { type: 'LongText', prompt: 'Anything you’d like us to know?' },
        ],
      },
    ],
  },
};

const applicationTemplate: StarterTemplate = {
  key: 'application',
  name: 'Application',
  description: 'A multi-section application with a resume upload.',
  icon: 'fa-solid fa-file-signature',
  blueprint: {
    name: 'Application form',
    description: 'Apply by completing the sections below.',
    renderMode: 'Scroll',
    confirmationMessage: 'Your application has been submitted. Thank you!',
    pages: [
      {
        title: 'About you',
        questions: [
          { type: 'ShortText', prompt: 'First name', isRequired: true },
          { type: 'ShortText', prompt: 'Last name', isRequired: true },
          { type: 'Email', prompt: 'Email address', isRequired: true },
          { type: 'Phone', prompt: 'Phone number', isRequired: true },
        ],
      },
      {
        title: 'Your application',
        questions: [
          {
            type: 'Statement',
            prompt: 'Please complete the questions below and attach your resume.',
          },
          { type: 'LongText', prompt: 'Why are you a good fit for this role?', isRequired: true },
          {
            type: 'Date',
            prompt: 'Earliest available start date',
            isRequired: true,
          },
          { type: 'FileUpload', prompt: 'Upload your resume', isRequired: true },
          {
            type: 'YesNo',
            prompt: 'Are you legally authorized to work in this location?',
            isRequired: true,
          },
        ],
      },
    ],
  },
};

/** The full starter gallery, in display order. */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  contactTemplate,
  rsvpTemplate,
  npsTemplate,
  leadCaptureTemplate,
  applicationTemplate,
];

/** Look up a template by its stable key (case-insensitive). */
export function getStarterTemplate(key: string): StarterTemplate | undefined {
  const target = key.trim().toLowerCase();
  return STARTER_TEMPLATES.find((t) => t.key === target);
}
