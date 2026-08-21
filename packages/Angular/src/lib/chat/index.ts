/**
 * The authoring chat — the one surface AI form authoring is reached through.
 *
 * A host places `<mjf-form-chat>` where it wants it and provides `FormChatService`; the component
 * draws no fixed chrome of its own, so the forms list, the builder canvas and the Design rail all
 * use the same one without variants.
 */
export { FormChatComponent } from './form-chat.component';
export { FormChatService, chatExternalId, type ChatSendResult } from './form-chat.service';
export { parseChatMarkdown, parseSpans, type ChatBlock, type ChatSpan } from './chat-markdown';
