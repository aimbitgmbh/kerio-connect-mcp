/**
 * MCP Tools for Kerio Connect
 * Modular architecture supporting Mail, Calendar, Contacts, Tasks, and Notes
 */

import { z } from 'zod';
import type { KerioClient } from './client.js';
import type { KerioNote, FolderInfo, KerioFolder } from './types.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Strip HTML tags and decode HTML entities to get plain text
 */
function stripHtml(html: string): string {
  if (!html) return '';

  // Remove script and style tags with their content
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Replace <br>, </p>, </div>, </tr> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Collapse multiple newlines into max 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // Collapse multiple spaces into one
  text = text.replace(/ {2,}/g, ' ');

  // Trim whitespace from each line
  text = text.split('\n').map(line => line.trim()).join('\n');

  // Remove leading/trailing whitespace
  return text.trim();
}

/**
 * Truncate text with clear indicator if too long
 */
function truncateText(text: string, maxLength: number = 2000): { text: string; truncated: boolean; originalLength: number } {
  if (!text || text.length <= maxLength) {
    return { text, truncated: false, originalLength: text.length };
  }

  // Find a good break point (end of sentence or paragraph)
  let breakPoint = maxLength;
  const lastPeriod = text.lastIndexOf('.', maxLength);
  const lastNewline = text.lastIndexOf('\n', maxLength);

  if (lastPeriod > maxLength - 200) {
    breakPoint = lastPeriod + 1;
  } else if (lastNewline > maxLength - 200) {
    breakPoint = lastNewline + 1;
  }

  const truncated = text.substring(0, breakPoint).trim();
  const remaining = text.length - breakPoint;

  return {
    text: truncated,
    truncated: true,
    originalLength: text.length
  };
}

// ============================================================================
// SHARED/GENERAL TOOLS
// ============================================================================

export const FoldersListSchema = z.object({
  sortBy: z
    .enum(['name', 'type'])
    .optional()
    .default('type')
    .describe('Sort folders by: name (alphabetical) or type (grouped by folder type). Default: type'),
});

export const FoldersCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Name for the new folder'),
  type: z
    .enum(['FNote', 'FTask', 'FContact', 'FCalendar', 'FMail'])
    .optional()
    .default('FNote')
    .describe('Folder type: FNote (notes), FTask (tasks), FContact (contacts), FCalendar (calendar), FMail (mail). Default: FNote'),
  parentId: z
    .string()
    .optional()
    .describe('Parent folder ID (required for FMail folders, optional for others)'),
});

// ============================================================================
// NOTES MODULE
// ============================================================================

export const NotesListSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe('Folder name to search in (optional - if omitted, defaults to first/main folder unless includeAllFolders=true)'),
  includeAllFolders: z
    .boolean()
    .optional()
    .default(false)
    .describe('Search across ALL folders including trash/deleted items (default: false, only searches main folder)'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(20)
    .describe('Maximum notes to return (-1 for all, default: 20)'),
  orderBy: z
    .enum(['createDate', 'modifyDate'])
    .optional()
    .default('modifyDate')
    .describe('Field to sort by: createDate (when created) or modifyDate (when last modified)'),
  direction: z
    .enum(['Asc', 'Desc'])
    .optional()
    .default('Desc')
    .describe('Sort direction: Desc (newest first) or Asc (oldest first)'),
});

export const NotesSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query text'),
  folders: z
    .array(z.string())
    .optional()
    .describe('Folder names to search in (optional, defaults to main folder unless includeAllFolders=true)'),
  includeAllFolders: z
    .boolean()
    .optional()
    .default(false)
    .describe('Search across ALL folders including trash/deleted items (default: false, only searches main folder)'),
  searchIn: z
    .enum(['text', 'subject', 'both'])
    .optional()
    .default('both')
    .describe('Where to search: note text, subject, or both'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(-1)
    .describe('Maximum results (-1 for all)'),
});

export const NotesCountSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe('Folder name (optional, returns counts for all folders if not specified)'),
});

export const NotesCreateSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe('Note content/text - the main content of the note'),
  subject: z
    .string()
    .optional()
    .describe('Note subject/title (optional - if omitted, will auto-generate from first line of text)'),
  folder: z
    .string()
    .optional()
    .describe('Folder name to create note in (optional, uses first folder)'),
  color: z
    .string()
    .optional()
    .describe('Note color (optional, e.g., #FF5733)'),
});

export const NotesMoveSchema = z.object({
  noteId: z
    .string()
    .describe('Full note ID (keriostorage://note/...)'),
  targetFolder: z
    .string()
    .describe('Target folder name to move note to'),
});

export const NotesUpdateSchema = z.object({
  noteId: z
    .string()
    .describe('Full note ID (keriostorage://note/...) - get this from notes_list'),
  text: z
    .string()
    .optional()
    .describe('Updated note text/content'),
  subject: z
    .string()
    .optional()
    .describe('Updated note subject/title (optional - auto-generated from first line of text if not provided)'),
});

export const NotesDeleteSchema = z.object({
  noteId: z
    .string()
    .describe('Full note ID (keriostorage://note/...) - get this from notes_list'),
  hardDelete: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, permanently delete the note. If false (default), move to Papierkorb/trash folder (soft delete)'),
});

// ============================================================================
// MAIL MODULE (Placeholder - to be implemented)
// ============================================================================
// TODO: Implement mail tools based on JSON-RPC specs
// - mail_list
// - mail_search
// - mail_send
// - mail_move
// - mail_delete
// - mail_get_message
// - mail_mark_read
// - mail_mark_unread

// ============================================================================
// CALENDAR MODULE (Placeholder - to be implemented)
// ============================================================================
// TODO: Implement calendar tools based on JSON-RPC specs
// - calendar_list
// - calendar_create_event
// - calendar_get_event
// - calendar_update_event
// - calendar_delete_event
// - calendar_search

// ============================================================================
// CONTACTS MODULE (Placeholder - to be implemented)
// ============================================================================
// TODO: Implement contacts tools based on JSON-RPC specs
// - contacts_list
// - contacts_create
// - contacts_search
// - contacts_update
// - contacts_delete
// - contacts_get

// ============================================================================
// TASKS MODULE
// ============================================================================

export const TasksListSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe('Folder name to search in (optional - if omitted, searches ALL task folders)'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(500)
    .describe('Maximum tasks to return (-1 for all, default: 500)'),
  orderBy: z
    .enum(['due', 'summary', 'done'])
    .optional()
    .default('due')
    .describe('Field to sort by'),
  direction: z
    .enum(['Asc', 'Desc'])
    .optional()
    .default('Asc')
    .describe('Sort direction'),
});

export const TasksCreateSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe('Task summary/title'),
  description: z
    .string()
    .optional()
    .describe('Task description/details'),
  folder: z
    .string()
    .optional()
    .describe('Folder name to create task in (optional, uses first folder)'),
  due: z
    .string()
    .optional()
    .describe('Due date in ISO format (YYYY-MM-DDTHH:mm:ss)'),
  reminderMinutes: z
    .number()
    .optional()
    .describe('Minutes before due date to remind (optional)'),
});

export const TasksCompleteSchema = z.object({
  taskId: z
    .string()
    .describe('Full task ID (keriostorage://task/...)'),
});

export const TasksUpdateSchema = z.object({
  taskId: z
    .string()
    .describe('Full task ID (keriostorage://task/...)'),
  summary: z
    .string()
    .optional()
    .describe('Updated task summary'),
  description: z
    .string()
    .optional()
    .describe('Updated task description'),
  due: z
    .string()
    .optional()
    .describe('Updated due date in ISO format'),
  done: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Completion percentage (0-100)'),
  reminderDate: z
    .string()
    .optional()
    .describe('Set absolute reminder at specific date/time in ISO format (e.g., "2026-01-04T09:00:00")'),
  reminderMinutes: z
    .number()
    .optional()
    .describe('Set relative reminder (minutes before due date, e.g., 1440 for 1 day before)'),
  clearReminder: z
    .boolean()
    .optional()
    .describe('Set to true to remove any existing reminder'),
});

export const TasksDeleteSchema = z.object({
  taskId: z
    .string()
    .describe('Full task ID (keriostorage://task/...) - get this from tasks_list'),
});

export const TasksSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query text'),
  folders: z
    .array(z.string())
    .optional()
    .describe('Folder names to search in (optional, searches all task folders if not specified)'),
  searchIn: z
    .enum(['summary', 'description', 'both'])
    .optional()
    .default('both')
    .describe('Where to search: task summary, description, or both'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(-1)
    .describe('Maximum results (-1 for all)'),
});

// ============================================================================
// MAIL MODULE
// ============================================================================

export const MailsListSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe('Folder name to search in (optional - if omitted, searches ALL mail folders including Inbox)'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(50)
    .describe('Maximum emails to return (-1 for all, default: 50)'),
  orderBy: z
    .enum(['receiveDate', 'sendDate', 'subject', 'from'])
    .optional()
    .default('receiveDate')
    .describe('Field to sort by'),
  direction: z
    .enum(['Asc', 'Desc'])
    .optional()
    .default('Desc')
    .describe('Sort direction'),
  fromFilter: z
    .string()
    .optional()
    .describe('Filter emails by sender - searches in both name and email address (case-insensitive, partial match)'),
  subjectFilter: z
    .string()
    .optional()
    .describe('Filter emails by subject line (case-insensitive, partial match)'),
  unreadOnly: z
    .boolean()
    .optional()
    .describe('If true, only return unread emails'),
});

export const MailsGetSchema = z.object({
  mailId: z
    .string()
    .describe('Full email ID (keriostorage://mail/...)'),
});

export const MailsShowRecentSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(1)
    .describe('Number of recent emails to show with full content (1-20, default: 1)'),
  fromFilter: z
    .string()
    .optional()
    .describe('ONLY use when user specifies a SENDER (person or company). Examples: "John Smith", "amazon.com". DO NOT use for "from Kerio".'),
  subjectFilter: z
    .string()
    .optional()
    .describe('Filter by subject line (case-insensitive, partial match)'),
  unreadOnly: z
    .boolean()
    .optional()
    .describe('If true, only show unread emails'),
  folder: z
    .string()
    .optional()
    .describe('OPTIONAL - Folder name (e.g., "INBOX"). If omitted, searches ALL folders.'),
});

export const MailsSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query (searches across subject, sender, recipient, email body, etc.)'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(50)
    .describe('Max number of results (default: 50)'),
  folder: z
    .string()
    .optional()
    .describe('OPTIONAL - Folder name to search in (e.g., "INBOX"). If omitted, searches ALL folders.'),
});

export const MailsSendSchema = z.object({
  to: z
    .array(z.string())
    .min(1)
    .describe('Recipient email addresses'),
  subject: z
    .string()
    .describe('Email subject'),
  body: z
    .string()
    .describe('Email body (supports HTML)'),
  cc: z
    .array(z.string())
    .optional()
    .describe('CC recipients (optional)'),
  bcc: z
    .array(z.string())
    .optional()
    .describe('BCC recipients (optional)'),
  priority: z
    .enum(['Low', 'Normal', 'High'])
    .optional()
    .default('Normal')
    .describe('Email priority'),
  html: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether body is HTML (default: true)'),
});

export const MailsDraftSchema = z.object({
  to: z
    .array(z.string())
    .describe('Recipient email addresses'),
  subject: z
    .string()
    .describe('Email subject'),
  body: z
    .string()
    .describe('Email body (supports HTML)'),
  cc: z
    .array(z.string())
    .optional()
    .describe('CC recipients (optional)'),
  bcc: z
    .array(z.string())
    .optional()
    .describe('BCC recipients (optional)'),
  priority: z
    .enum(['Low', 'Normal', 'High'])
    .optional()
    .default('Normal')
    .describe('Email priority'),
  html: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether body is HTML (default: true)'),
});

export const MailsUpdateDraftSchema = z.object({
  draftId: z
    .string()
    .optional()
    .describe('Draft email ID to update. If omitted, updates the most recent draft.'),
  subject: z
    .string()
    .optional()
    .describe('New email subject (optional - keeps existing if not provided)'),
  body: z
    .string()
    .optional()
    .describe('New email body (optional - keeps existing if not provided)'),
  to: z
    .array(z.string())
    .optional()
    .describe('New recipient email addresses (optional - keeps existing if not provided)'),
  cc: z
    .array(z.string())
    .optional()
    .describe('New CC recipients (optional - keeps existing if not provided)'),
  bcc: z
    .array(z.string())
    .optional()
    .describe('New BCC recipients (optional - keeps existing if not provided)'),
  priority: z
    .enum(['Low', 'Normal', 'High'])
    .optional()
    .describe('New email priority (optional - keeps existing if not provided)'),
  html: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether body is HTML (default: true)'),
});

export const MailsMoveSchema = z.object({
  mailIds: z
    .array(z.string())
    .min(1)
    .describe('Email IDs to move'),
  targetFolder: z
    .string()
    .describe('Target folder name'),
});

export const MailsMarkReadSchema = z.object({
  mailIds: z
    .array(z.string())
    .min(1)
    .describe('Email IDs to mark as read/unread (supports batch operations)'),
  read: z
    .boolean()
    .describe('true to mark as read, false to mark as unread'),
});

export const MailsFlagSchema = z.object({
  mailIds: z
    .array(z.string())
    .min(1)
    .describe('Email IDs to flag/unflag (supports batch operations)'),
  flagged: z
    .boolean()
    .describe('true to flag, false to unflag'),
});

export const MailsDeleteSchema = z.object({
  mailIds: z
    .array(z.string())
    .min(1)
    .describe('Email IDs to delete (soft delete - moves to trash folder)'),
});

// ============================================================================
// CONTACTS MODULE
// ============================================================================

export const ContactsListSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe('Folder name to search in (optional - if omitted, searches ALL contact folders)'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(100)
    .describe('Maximum contacts to return (-1 for all, default: 100)'),
});

export const ContactsGetSchema = z.object({
  contactId: z
    .string()
    .describe('Full contact ID (keriostorage://contact/...)'),
});

export const ContactsCreateSchema = z.object({
  firstName: z
    .string()
    .min(1)
    .describe('Contact first name'),
  lastName: z
    .string()
    .optional()
    .describe('Contact last name (surName)'),
  email: z
    .string()
    .email()
    .optional()
    .describe('Primary email address'),
  phone: z
    .string()
    .optional()
    .describe('Primary phone number'),
  company: z
    .string()
    .optional()
    .describe('Company name'),
  notes: z
    .string()
    .optional()
    .describe('Additional notes/comments'),
  folder: z
    .string()
    .optional()
    .describe('Folder name to create contact in (optional, uses first folder)'),
});

export const ContactsUpdateSchema = z.object({
  contactId: z
    .string()
    .describe('Full contact ID (keriostorage://contact/...)'),
  firstName: z
    .string()
    .optional()
    .describe('Updated first name'),
  lastName: z
    .string()
    .optional()
    .describe('Updated last name'),
  email: z
    .string()
    .email()
    .optional()
    .describe('Updated primary email address'),
  phone: z
    .string()
    .optional()
    .describe('Updated primary phone number'),
  company: z
    .string()
    .optional()
    .describe('Updated company name'),
  notes: z
    .string()
    .optional()
    .describe('Updated notes/comments'),
});

export const ContactsDeleteSchema = z.object({
  contactId: z
    .string()
    .describe('Full contact ID (keriostorage://contact/...) - get this from contacts_list'),
});

export const ContactsSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query text'),
  folders: z
    .array(z.string())
    .optional()
    .describe('Folder names to search in (optional, searches all contact folders if not specified)'),
  searchIn: z
    .enum(['name', 'company', 'email', 'phone', 'notes', 'all'])
    .optional()
    .default('all')
    .describe('Where to search: name (first/middle/last), company, email addresses, phone numbers, notes, or all fields'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(-1)
    .describe('Maximum results (-1 for all)'),
});

// ============================================================================
// CALENDARS MODULE
// ============================================================================

export const CalendarsListSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe('Calendar name, owner/name, owner email/name, or folder ID (optional - if omitted, searches ALL calendars)'),
  startDate: z
    .string()
    .optional()
    .describe('Start date for filtering events in ISO format (YYYY-MM-DDTHH:mm:ss) - optional'),
  endDate: z
    .string()
    .optional()
    .describe('End date for filtering events in ISO format (YYYY-MM-DDTHH:mm:ss) - optional'),
  limit: z
    .number()
    .int()
    .min(-1)
    .optional()
    .default(100)
    .describe('Maximum events to return (-1 for all, default: 100)'),
});

export const CalendarsSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query (searches across event title, location, description, etc.)'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(10)
    .describe('Max number of results (default: 10)'),
  folder: z
    .string()
    .optional()
    .describe('OPTIONAL - Calendar name, owner/name, owner email/name, or folder ID. If omitted, searches ALL calendars.'),
});

export const CalendarsCreateSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe('Event title/summary'),
  start: z
    .string()
    .describe('Start date/time in ISO format (YYYY-MM-DDTHH:mm:ss)'),
  end: z
    .string()
    .describe('End date/time in ISO format (YYYY-MM-DDTHH:mm:ss)'),
  location: z
    .string()
    .optional()
    .describe('Event location'),
  description: z
    .string()
    .optional()
    .describe('Event description/details'),
  folder: z
    .string()
    .optional()
    .describe('Calendar name, owner/name, owner email/name, or folder ID (optional, uses first available calendar; personal calendars are ordered first)'),
  reminderMinutes: z
    .number()
    .optional()
    .describe('Minutes before event to remind (optional)'),
  isAllDay: z
    .boolean()
    .optional()
    .describe('Whether this is an all-day event'),
  isPrivate: z
    .boolean()
    .optional()
    .describe('Whether this is a private event'),
  frequency: z
    .enum(['Daily', 'Weekly', 'Monthly', 'Yearly'])
    .optional()
    .describe('Recurrence frequency for recurring events (Daily/Weekly/Monthly/Yearly)'),
  interval: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Recurrence interval (e.g., 2 for every 2 weeks). Default: 1'),
  recurrenceEndDate: z
    .string()
    .optional()
    .describe('End date for recurrence in ISO format (YYYY-MM-DDTHH:mm:ss). If not specified, event repeats forever'),
});

export const CalendarsUpdateSchema = z.object({
  occurrenceId: z
    .string()
    .describe('Full occurrence ID (keriostorage://occurrence/...)'),
  eventId: z
    .string()
    .describe('Full event ID (keriostorage://event/...)'),
  folderId: z
    .string()
    .describe('Full folder ID'),
  summary: z
    .string()
    .optional()
    .describe('Updated event title'),
  start: z
    .string()
    .optional()
    .describe('Updated start date/time in ISO format'),
  end: z
    .string()
    .optional()
    .describe('Updated end date/time in ISO format'),
  location: z
    .string()
    .optional()
    .describe('Updated location'),
  description: z
    .string()
    .optional()
    .describe('Updated description'),
  reminderMinutes: z
    .number()
    .optional()
    .describe('Updated reminder (minutes before event)'),
  isAllDay: z
    .boolean()
    .optional()
    .describe('Whether this is an all-day event (affects date conversion)'),
  modification: z
    .enum(['modifyThis', 'modifyAll', 'modifyFuture'])
    .optional()
    .default('modifyThis')
    .describe('For recurring events: modify this occurrence, all occurrences, or future occurrences'),
});

export const CalendarsDeleteSchema = z.object({
  occurrenceId: z
    .string()
    .describe('Full occurrence ID (keriostorage://occurrence/...) - get this from calendars_list'),
  modification: z
    .enum(['modifyThis', 'modifyAllFollowing', 'modifyAll'])
    .optional()
    .default('modifyThis')
    .describe('For recurring events: "modifyThis" = delete only this occurrence, "modifyAllFollowing" = delete this and all future occurrences, "modifyAll" = delete entire series'),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper: Find folder by name
 */
async function findFolderByName(
  client: KerioClient,
  folderName: string
): Promise<string> {
  const folders = await client.getNoteFolders();
  const folder = folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());

  if (!folder) {
    const available = folders.map((f) => f.name).join(', ');
    throw new Error(
      `Folder '${folderName}' not found. Available folders: ${available}`
    );
  }

  return folder.id;
}

/**
 * Helper: Find task folder by name
 */
async function findTaskFolderByName(
  client: KerioClient,
  folderName: string
): Promise<string> {
  const folders = await client.getTaskFolders();
  const folder = folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());

  if (!folder) {
    const available = folders.map((f) => f.name).join(', ');
    throw new Error(
      `Task folder '${folderName}' not found. Available task folders: ${available}`
    );
  }

  return folder.id;
}

/**
 * Helper: Format note for display
 * Simplified format: only ID, dates, and content
 */
function formatNote(note: KerioNote): string {
  return [
    note.text,
    '',
    `Created: ${note.createDate ?? 'Unknown'}`,
    `Modified: ${note.modifyDate ?? 'Unknown'}`,
    `[ID: ${note.id}]`,
  ].join('\n');
}

/**
 * Helper: Format task for display
 */
function formatTask(task: any): string {
  const donePercent = task.done ?? 0;
  const status = donePercent === 100 ? '✓ COMPLETE' : donePercent > 0 ? `◷ ${donePercent}%` : '○ TODO';

  return [
    `Status: ${status}`,
    `Summary: ${task.summary}`,
    task.due ? `Due: ${task.due}` : null,
    task.description ? `Description: ${task.description}` : null,
    '',
    `[ID: ${task.id}]`,
  ].filter(Boolean).join('\n');
}

/**
 * Helper: Find mail folder by name
 */
async function findMailFolderByName(
  client: KerioClient,
  folderName: string
): Promise<string> {
  const folders = await client.getMailFolders();
  const folder = folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());

  if (!folder) {
    const available = folders.map((f) => f.name).join(', ');
    throw new Error(
      `Mail folder '${folderName}' not found. Available mail folders: ${available}`
    );
  }

  return folder.id;
}

/**
 * Helper: Format email for display
 */
function formatMail(mail: any): string {
  const flags = [];
  if (mail.isSeen === false) flags.push('UNREAD');
  if (mail.isFlagged) flags.push('FLAGGED');
  if (mail.isDraft) flags.push('DRAFT');
  if (mail.hasAttachment) flags.push('HAS_ATTACHMENT');

  const fromStr = typeof mail.from === 'string'
    ? mail.from
    : (mail.from?.name || mail.from?.address || 'Unknown');

  const toStr = Array.isArray(mail.to)
    ? mail.to.map((t: any) => t.name || t.address).join(', ')
    : mail.to;

  return [
    `From: ${fromStr}`,
    `To: ${toStr}`,
    `Subject: ${mail.subject}`,
    `Date: ${mail.receiveDate || mail.sendDate || 'Unknown'}`,
    flags.length > 0 ? `Flags: ${flags.join(', ')}` : null,
    mail.size ? `Size: ${(mail.size / 1024).toFixed(1)} KB` : null,
    '',
    `[ID: ${mail.id}]`,
  ].filter(Boolean).join('\n');
}

/**
 * Helper: Find contact folder by name
 */
async function findContactFolderByName(
  client: KerioClient,
  folderName: string
): Promise<string> {
  const folders = await client.getContactFolders();
  const folder = folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());

  if (!folder) {
    const available = folders.map((f) => f.name).join(', ');
    throw new Error(
      `Contact folder '${folderName}' not found. Available contact folders: ${available}`
    );
  }

  return folder.id;
}

/**
 * Helper: Format contact for display
 */
function formatContact(contact: any): string {
  const emails = contact.emailAddresses?.map((e: any) => e.address).join(', ') || 'None';
  const phones = contact.phoneNumbers?.map((p: any) => p.number).join(', ') || 'None';

  return [
    `Name: ${contact.commonName}`,
    contact.companyName ? `Company: ${contact.companyName}` : null,
    `Email: ${emails}`,
    `Phone: ${phones}`,
    contact.comment ? `Notes: ${contact.comment}` : null,
    '',
    `[ID: ${contact.id}]`,
  ].filter(Boolean).join('\n');
}

/**
 * Helper: Format a calendar folder as an unambiguous selector.
 */
function formatCalendarFolderSelector(folder: KerioFolder): string {
  const owner = folder.emailAddress || folder.ownerName;
  const name = owner ? `${owner}/${folder.name}` : folder.name;
  return `${name} [${folder.id}]`;
}

/**
 * Helper: Find a calendar folder by ID, qualified owner/name, or unique name.
 */
async function findCalendarFolder(
  client: KerioClient,
  selector: string
): Promise<string> {
  const folders = await client.getCalendarFolders();
  const normalizedSelector = selector.trim().toLowerCase();

  const idMatch = folders.find((folder) => folder.id.toLowerCase() === normalizedSelector);
  if (idMatch) return idMatch.id;

  const qualifiedMatches = folders.filter((folder) => {
    const owners = [folder.emailAddress, folder.ownerName]
      .filter((owner): owner is string => Boolean(owner));
    return owners.some((owner) =>
      `${owner}/${folder.name}`.toLowerCase() === normalizedSelector
    );
  });

  if (qualifiedMatches.length === 1) return qualifiedMatches[0].id;

  const nameMatches = folders.filter(
    (folder) => folder.name.toLowerCase() === normalizedSelector
  );

  if (nameMatches.length === 1) return nameMatches[0].id;

  const matches = qualifiedMatches.length > 1 ? qualifiedMatches : nameMatches;
  if (matches.length > 1) {
    const options = matches.map(formatCalendarFolderSelector).join(', ');
    throw new Error(
      `Calendar selector '${selector}' is ambiguous. Use an owner-qualified name or folder ID. Matches: ${options}`
    );
  }

  const available = folders.map(formatCalendarFolderSelector).join(', ');
  throw new Error(
    `Calendar selector '${selector}' not found. Available calendars: ${available}`
  );
}

/**
 * Helper: Format occurrence for display
 */
function formatOccurrence(occurrence: any): string {
  const flags = [];
  if (occurrence.isAllDay) flags.push('ALL-DAY');
  if (occurrence.isPrivate) flags.push('PRIVATE');
  if (occurrence.isRecurrent) flags.push('RECURRING');
  if (occurrence.isCancelled) flags.push('CANCELLED');
  if (occurrence.hasReminder) flags.push('HAS_REMINDER');

  const attendees = occurrence.attendees?.length > 0
    ? occurrence.attendees.map((a: any) => `${a.displayName} (${a.role})`).join(', ')
    : 'None';

  return [
    `Summary: ${occurrence.summary}`,
    occurrence.location ? `Location: ${occurrence.location}` : null,
    `Start: ${occurrence.start}`,
    `End: ${occurrence.end}`,
    `Attendees: ${attendees}`,
    flags.length > 0 ? `Flags: ${flags.join(', ')}` : null,
    occurrence.description ? `Description: ${occurrence.description}` : null,
    '',
    `[ID: ${occurrence.id}]`,
    `[Event ID: ${occurrence.eventId}]`,
    `[Folder ID: ${occurrence.folderId}]`,
  ].filter(Boolean).join('\n');
}

/**
 * Helper: Convert ISO date to Kerio format
 *
 * @param isoDate - ISO 8601 date string (e.g., "2026-01-02T00:00:00")
 * @param isAllDay - If true, treats as all-day event (no timezone conversion)
 */
function isoToKerioDate(isoDate: string, isAllDay: boolean = false): string {
  if (isAllDay) {
    // For all-day events, use the date as-is without timezone conversion
    // to avoid shifting the date due to timezone offset
    const dateOnly = isoDate.split('T')[0];  // Extract "2026-01-02"
    const [year, month, day] = dateOnly.split('-');
    // All-day events in Kerio use midnight in the local timezone
    // We'll use the current timezone offset
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const offsetMins = (Math.abs(offset) % 60).toString().padStart(2, '0');
    const offsetSign = offset >= 0 ? '+' : '-';
    return `${year}${month}${day}T000000${offsetSign}${offsetHours}${offsetMins}`;
  }

  // For regular events, do timezone conversion
  const date = new Date(isoDate);
  const offset = -date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const offsetMins = (Math.abs(offset) % 60).toString().padStart(2, '0');
  const offsetSign = offset >= 0 ? '+' : '-';

  return date.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z/, offsetSign + offsetHours + offsetMins);
}

/**
 * Helper: Convert ISO date to Kerio format preserving local time
 * Used for tasks where we want to preserve the exact date/time provided
 *
 * @param isoDate - ISO 8601 date string (e.g., "2026-01-05T09:00:00")
 * @returns Kerio format with local timezone (e.g., "20260105T090000+0100")
 */
function isoToKerioLocalDate(isoDate: string): string {
  // Parse the ISO date as local time
  const [datePart, timePart] = isoDate.split('T');
  const [year, month, day] = datePart.split('-');
  const [hours, minutes, seconds] = (timePart || '00:00:00').split(':');

  // Get local timezone offset
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const offsetMins = (Math.abs(offset) % 60).toString().padStart(2, '0');
  const offsetSign = offset >= 0 ? '+' : '-';

  // Return in Kerio format: YYYYMMDDTHHmmss+ZZZZ
  return `${year}${month}${day}T${hours}${minutes}${seconds}${offsetSign}${offsetHours}${offsetMins}`;
}

// ============================================================================
// SHARED/GENERAL TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Tool: Get folder information
 */
export async function foldersList(client: KerioClient, args: unknown): Promise<string> {
  const params = FoldersListSchema.parse(args);

  const allFolders = await client.getAllFolders();

  if (allFolders.length === 0) {
    return 'No folders found.';
  }

  const typeLabels: Record<string, string> = {
    FNote: 'Notes',
    FTask: 'Tasks',
    FContact: 'Contacts',
    FCalendar: 'Calendar',
    FMail: 'Mail',
  };

  if (params.sortBy === 'name') {
    // Sort all folders alphabetically by name
    const sorted = [...allFolders].sort((a, b) => a.name.localeCompare(b.name));

    const sections = [
      'All Folders (sorted by name):',
      '='.repeat(50),
    ];

    sorted.forEach((folder) => {
      sections.push(`  ${folder.name} [${typeLabels[folder.type]}]`);
      sections.push(`  ID: ${folder.id}`);
      sections.push('');
    });

    return sections.join('\n');
  } else {
    // Group folders by type (default)
    const foldersByType: Record<string, typeof allFolders> = {
      FNote: [],
      FTask: [],
      FContact: [],
      FCalendar: [],
      FMail: [],
    };

    allFolders.forEach((folder) => {
      if (foldersByType[folder.type]) {
        foldersByType[folder.type].push(folder);
      }
    });

    // Sort folders within each type by name
    Object.values(foldersByType).forEach((folders) => {
      folders.sort((a, b) => a.name.localeCompare(b.name));
    });

    const typeHeaders: Record<string, string> = {
      FNote: 'Notes Folders',
      FTask: 'Tasks Folders',
      FContact: 'Contacts Folders',
      FCalendar: 'Calendar Folders',
      FMail: 'Mail Folders',
    };

    const sections: string[] = [];

    // Build output for each folder type that has folders
    for (const [type, folders] of Object.entries(foldersByType)) {
      if (folders.length > 0) {
        sections.push(typeHeaders[type]);
        sections.push('='.repeat(50));
        folders.forEach((folder) => {
          sections.push(`  ${folder.name}`);
          sections.push(`  ID: ${folder.id}`);
          sections.push('');
        });
      }
    }

    return sections.join('\n');
  }
}

/**
 * Tool: Create a new folder
 */
export async function foldersCreate(client: KerioClient, args: unknown): Promise<string> {
  const params = FoldersCreateSchema.parse(args);

  // Validate mail folder requirements
  if (params.type === 'FMail' && !params.parentId) {
    const mailFolders = await client.getMailFolders();
    if (mailFolders.length === 0) {
      throw new Error('Cannot create mail folder: No mail folders available. Mail folders require a parent folder.');
    }
    const folderList = mailFolders.map((f) => `${f.name} (${f.id})`).join('\n  ');
    throw new Error(
      `Mail folders require a parentId. Available mail folders:\n  ${folderList}\n\n` +
      `Use: folders_create with name="${params.name}", type="FMail", parentId="<folder-id>"`
    );
  }

  await client.createFolder(params.name, params.type, params.parentId);

  const typeNames = {
    FNote: 'notes',
    FTask: 'tasks',
    FContact: 'contacts',
    FCalendar: 'calendar events',
    FMail: 'mail',
  };

  return `${typeNames[params.type]} folder "${params.name}" created successfully.`;
}

// ============================================================================
// NOTES MODULE TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Tool: List notes from a folder OR across all folders
 *
 * Usage Guide:
 * - "Show my last note" → Omit folder parameter, gets most recent across all folders
 * - "Show notes from Notes folder" → Specify folder="Notes"
 * - If unsure about folder names, call folders_list first
 */
export async function notesList(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesListSchema.parse(args);

  let folderIds: string[];
  let folderContext: string;

  if (params.folder) {
    // Specific folder requested
    try {
      const folderId = await findFolderByName(client, params.folder);
      folderIds = [folderId];
      folderContext = `from folder "${params.folder}"`;
    } catch (error) {
      // Folder not found - provide helpful error
      const folders = await client.getNoteFolders();
      const available = folders.map((f) => f.name).join(', ');
      return `ERROR: Folder "${params.folder}" not found.\n\n` +
        `Available folders: ${available}\n\n` +
        `Tip: Use includeAllFolders=true to search across all folders, ` +
        `or call folders_list to see folder details.`;
    }
  } else if (params.includeAllFolders) {
    // Explicitly requested all folders (including trash/deleted)
    const folders = await client.getNoteFolders();
    if (folders.length === 0) {
      return 'No note folders found.';
    }
    folderIds = folders.map((f) => f.id);
    folderContext = 'across all folders';
  } else {
    // Default: Use only the first/main folder (excludes trash/deleted)
    const folders = await client.getNoteFolders();
    if (folders.length === 0) {
      return 'No note folders found.';
    }
    folderIds = [folders[0].id];
    folderContext = `from folder "${folders[0].name}"`;
  }

  // Get notes
  const notes = await client.getNotes(folderIds, {
    limit: params.limit,
    orderBy: [
      {
        columnName: params.orderBy,
        direction: params.direction,
        caseSensitive: true,
      },
    ],
  });

  if (notes.length === 0) {
    return `No notes found ${folderContext}.`;
  }

  const header = `Found ${notes.length} note(s) ${folderContext}:\n${'='.repeat(50)}\n\n`;
  const formatted = notes.map(formatNote).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Search notes across folders
 */
export async function notesSearch(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesSearchSchema.parse(args);

  // Get folder IDs based on parameters
  let folderIds: string[] | undefined;

  if (params.folders && params.folders.length > 0) {
    // Specific folders requested
    folderIds = await Promise.all(
      params.folders.map((name) => findFolderByName(client, name))
    );
  } else if (params.includeAllFolders) {
    // Explicitly requested all folders (including trash/deleted)
    const folders = await client.getNoteFolders();
    folderIds = folders.map((f) => f.id);
  } else {
    // Default: Use only the first/main folder (excludes trash/deleted)
    const folders = await client.getNoteFolders();
    if (folders.length === 0) {
      return 'No note folders found.';
    }
    folderIds = [folders[0].id];
  }

  // Search
  const result = await client.searchNotes(
    params.query,
    folderIds,
    params.searchIn,
    params.limit
  );

  if (result.totalFound === 0) {
    return `No notes found matching "${params.query}".`;
  }

  const header = [
    `Search results for "${params.query}":`,
    `Found ${result.totalFound} note(s) in ${result.searchedFolders.length} folder(s)`,
    '='.repeat(50),
    '',
  ].join('\n');

  const formatted = result.notes.map(formatNote).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Get note count(s)
 */
export async function notesCount(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesCountSchema.parse(args);

  if (params.folder) {
    // Single folder count
    const folderId = await findFolderByName(client, params.folder);
    const count = await client.getNoteCount(folderId);
    return `Folder "${params.folder}" contains ${count} note(s).`;
  } else {
    // All folders count
    const folderInfo = await client.getFolderInfo();

    if (folderInfo.length === 0) {
      return 'No note folders found.';
    }

    const lines = [
      'Note counts by folder:',
      '='.repeat(50),
      ...folderInfo.map((f) => `  ${f.name}: ${f.noteCount} note(s)`),
      '',
      `Total: ${folderInfo.reduce((sum, f) => sum + f.noteCount, 0)} note(s) across ${folderInfo.length} folder(s)`,
    ];

    return lines.join('\n');
  }
}

/**
 * Tool: Create a new note
 */
export async function notesCreate(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesCreateSchema.parse(args);

  // Get folder ID
  let folderId: string;
  if (params.folder) {
    folderId = await findFolderByName(client, params.folder);
  } else {
    const folders = await client.getNoteFolders();
    if (folders.length === 0) {
      throw new Error('No note folders available. Create a folder first.');
    }
    folderId = folders[0].id;
  }

  await client.createNote(folderId, params.text, params.subject, params.color);

  return `Note created successfully in folder "${params.folder ?? 'default'}":\n` +
    `${params.text.substring(0, 150)}${params.text.length > 150 ? '...' : ''}`;
}

/**
 * Tool: Move a note to different folder
 */
export async function notesMove(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesMoveSchema.parse(args);

  const targetFolderId = await findFolderByName(client, params.targetFolder);
  await client.moveNote(params.noteId, targetFolderId);

  return `Note moved successfully to folder "${params.targetFolder}".`;
}

/**
 * Tool: Update a note's content
 */
export async function notesUpdate(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesUpdateSchema.parse(args);

  // Validate at least one field is provided
  if (!params.text && !params.subject) {
    throw new Error('At least one of text or subject must be provided for update');
  }

  await client.updateNote(params.noteId, params.subject, params.text);

  const updates: string[] = [];
  if (params.text) updates.push('text');
  if (params.subject) updates.push('subject');

  return `Note updated successfully (${updates.join(', ')}).`;
}

/**
 * Tool: Delete a note
 * - Soft delete (default): Move to Papierkorb/trash folder
 * - Hard delete: Permanently remove from server
 */
export async function notesDelete(client: KerioClient, args: unknown): Promise<string> {
  const params = NotesDeleteSchema.parse(args);

  if (params.hardDelete) {
    // Hard delete - permanently remove note
    await client.removeNote(params.noteId);
    return `Note permanently deleted (hard delete).`;
  } else {
    // Soft delete - move to trash folder
    // Find or create "Papierkorb" trash folder
    const noteFolders = await client.getNoteFolders();
    let trashFolder = noteFolders.find((f) =>
      f.name.toLowerCase() === 'papierkorb' ||
      f.name.toLowerCase() === 'trash' ||
      f.name.toLowerCase() === 'deleted'
    );

    // Create trash folder if it doesn't exist
    if (!trashFolder) {
      console.error('[NotesDelete] Papierkorb folder not found, creating it...');
      await client.createFolder('Papierkorb');

      // Fetch folders again to get the newly created folder
      const updatedFolders = await client.getNoteFolders();
      trashFolder = updatedFolders.find((f) => f.name === 'Papierkorb');

      if (!trashFolder) {
        throw new Error('Failed to create Papierkorb folder for notes');
      }
    }

    // Move note to trash folder
    await client.moveNote(params.noteId, trashFolder.id);

    return `Note deleted (moved to "${trashFolder.name}" folder).`;
  }
}

// ============================================================================
// TASKS MODULE TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Tool: List tasks from a folder OR across all folders
 */
export async function tasksList(client: KerioClient, args: unknown): Promise<string> {
  const params = TasksListSchema.parse(args);

  let folderIds: string[];
  let folderContext: string;

  if (params.folder) {
    // Specific folder requested
    try {
      const folderId = await findTaskFolderByName(client, params.folder);
      folderIds = [folderId];
      folderContext = `from folder "${params.folder}"`;
    } catch (error) {
      // Folder not found - provide helpful error
      const folders = await client.getTaskFolders();
      const available = folders.map((f) => f.name).join(', ');
      return `ERROR: Task folder "${params.folder}" not found.\n\n` +
        `Available task folders: ${available}\n\n` +
        `Tip: Omit the folder parameter to search across all task folders.`;
    }
  } else {
    // No folder specified - search ALL task folders
    const folders = await client.getTaskFolders();
    if (folders.length === 0) {
      return 'No task folders found.';
    }
    folderIds = folders.map((f) => f.id);
    folderContext = 'across all task folders';
  }

  // Get tasks
  const tasks = await client.getTasks(folderIds, {
    limit: params.limit,
    orderBy: [
      {
        columnName: params.orderBy,
        direction: params.direction,
        caseSensitive: true,
      },
    ],
  });

  if (tasks.length === 0) {
    return `No tasks found ${folderContext}.`;
  }

  const header = `Found ${tasks.length} task(s) ${folderContext}:\n${'='.repeat(50)}\n\n`;
  const formatted = tasks.map(formatTask).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Create a new task
 */
export async function tasksCreate(client: KerioClient, args: unknown): Promise<string> {
  const params = TasksCreateSchema.parse(args);

  // Get folder ID
  let folderId: string;
  if (params.folder) {
    folderId = await findTaskFolderByName(client, params.folder);
  } else {
    const folders = await client.getTaskFolders();
    if (folders.length === 0) {
      throw new Error('No task folders available. Create a task folder first.');
    }
    folderId = folders[0].id;
  }

  // Convert ISO date to Kerio format if provided (preserve local time)
  let kerioDate: string | undefined;
  if (params.due) {
    kerioDate = isoToKerioLocalDate(params.due);
  }

  // Build reminder if specified
  let reminder: any = undefined;
  if (params.reminderMinutes && kerioDate) {
    reminder = {
      isSet: true,
      type: 'ReminderRelative',
      minutesBeforeStart: params.reminderMinutes
    };
  }

  await client.createTask(folderId, params.summary, params.description, kerioDate, reminder);

  return `Task created successfully: "${params.summary}"`;
}

/**
 * Tool: Mark a task as complete
 */
export async function tasksComplete(client: KerioClient, args: unknown): Promise<string> {
  const params = TasksCompleteSchema.parse(args);

  await client.updateTask(params.taskId, { done: 100 });

  return `Task marked as complete.`;
}

/**
 * Tool: Update a task
 */
export async function tasksUpdate(client: KerioClient, args: unknown): Promise<string> {
  const params = TasksUpdateSchema.parse(args);

  const updates: any = {};
  if (params.summary) updates.summary = params.summary;
  if (params.description !== undefined) updates.description = params.description;
  if (params.done !== undefined) updates.done = params.done;

  // Convert ISO date to Kerio format if provided (preserve local time)
  if (params.due) {
    updates.due = isoToKerioLocalDate(params.due);
  }

  // Handle reminder updates
  if (params.clearReminder) {
    updates.reminder = { isSet: false };
  } else if (params.reminderDate) {
    // Absolute reminder (specific date/time)
    updates.reminder = {
      isSet: true,
      type: 'ReminderAbsolute',
      date: isoToKerioLocalDate(params.reminderDate),
    };
  } else if (params.reminderMinutes !== undefined) {
    // Relative reminder (minutes before due)
    updates.reminder = {
      isSet: true,
      type: 'ReminderRelative',
      minutesBeforeStart: params.reminderMinutes,
    };
  }

  await client.updateTask(params.taskId, updates);

  return `Task updated successfully.`;
}

/**
 * Tool: Delete a task (hard delete - permanent)
 */
export async function tasksDelete(client: KerioClient, args: unknown): Promise<string> {
  const params = TasksDeleteSchema.parse(args);

  await client.removeTask(params.taskId);

  return `Task deleted permanently.`;
}

/**
 * Tool: Search tasks
 */
export async function tasksSearch(client: KerioClient, args: unknown): Promise<string> {
  const params = TasksSearchSchema.parse(args);

  // Get folder IDs if specified
  let folderIds: string[] | undefined;
  if (params.folders && params.folders.length > 0) {
    folderIds = await Promise.all(
      params.folders.map((name) => findTaskFolderByName(client, name))
    );
  }

  // Search
  const result = await client.searchTasks(
    params.query,
    folderIds,
    params.searchIn,
    params.limit
  );

  if (result.totalFound === 0) {
    return `No tasks found matching "${params.query}".`;
  }

  const header = [
    `Search results for "${params.query}":`,
    `Found ${result.totalFound} task(s) in ${result.searchedFolders.length} folder(s)`,
    '='.repeat(50),
    '',
  ].join('\n');

  const formatted = result.tasks.map(formatTask).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

// ============================================================================
// MAIL MODULE TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Tool: List emails from a folder OR across all folders
 */
export async function mailsList(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsListSchema.parse(args);

  let folderIds: string[];
  let folderContext: string;

  if (params.folder) {
    // Specific folder requested
    try {
      const folderId = await findMailFolderByName(client, params.folder);
      folderIds = [folderId];
      folderContext = `from folder "${params.folder}"`;
    } catch (error) {
      // Folder not found - provide helpful error
      const folders = await client.getMailFolders();
      const available = folders.map((f) => f.name).join(', ');
      return `ERROR: Mail folder "${params.folder}" not found.\n\n` +
        `Available mail folders: ${available}\n\n` +
        `Tip: Omit the folder parameter to search across all mail folders.`;
    }
  } else {
    // No folder specified - search ALL mail folders
    const folders = await client.getMailFolders();
    if (folders.length === 0) {
      return 'No mail folders found.';
    }
    folderIds = folders.map((f) => f.id);
    folderContext = 'across all mail folders';
  }

  // Get emails (fetch more if filtering, as we'll filter client-side)
  const fetchLimit = (params.fromFilter || params.subjectFilter || params.unreadOnly)
    ? Math.max(params.limit * 3, 100) // Fetch 3x or 100, whichever is larger
    : params.limit;

  let emails = await client.getMails(folderIds, {
    limit: fetchLimit,
    orderBy: [
      {
        columnName: params.orderBy,
        direction: params.direction,
        caseSensitive: true,
      },
    ],
  });

  // Apply client-side filters
  if (params.fromFilter) {
    const filterLower = params.fromFilter.toLowerCase();
    emails = emails.filter((email) => {
      const fromName = email.from?.name?.toLowerCase() || '';
      const fromAddress = email.from?.address?.toLowerCase() || '';
      return fromName.includes(filterLower) || fromAddress.includes(filterLower);
    });
  }

  if (params.subjectFilter) {
    const filterLower = params.subjectFilter.toLowerCase();
    emails = emails.filter((email) =>
      email.subject?.toLowerCase().includes(filterLower)
    );
  }

  if (params.unreadOnly) {
    emails = emails.filter((email) => email.isSeen === false);
  }

  // Limit results after filtering
  if (params.limit > 0 && emails.length > params.limit) {
    emails = emails.slice(0, params.limit);
  }

  if (emails.length === 0) {
    const filterInfo = [];
    if (params.fromFilter) filterInfo.push(`from: "${params.fromFilter}"`);
    if (params.subjectFilter) filterInfo.push(`subject: "${params.subjectFilter}"`);
    if (params.unreadOnly) filterInfo.push('unread only');

    const filterStr = filterInfo.length > 0 ? ` (filters: ${filterInfo.join(', ')})` : '';
    return `No emails found ${folderContext}${filterStr}.`;
  }

  const filterInfo = [];
  if (params.fromFilter) filterInfo.push(`from: "${params.fromFilter}"`);
  if (params.subjectFilter) filterInfo.push(`subject: "${params.subjectFilter}"`);
  if (params.unreadOnly) filterInfo.push('unread only');

  const filterStr = filterInfo.length > 0 ? ` (filters: ${filterInfo.join(', ')})` : '';
  const header = `Found ${emails.length} email(s) ${folderContext}${filterStr}:\n${'='.repeat(50)}\n\n`;
  const formatted = emails.map(formatMail).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Get specific email with full content
 */
export async function mailsGet(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsGetSchema.parse(args);

  const mail = await client.getMailById(params.mailId);

  // Format email with full content
  const flags = [];
  if (mail.isSeen === false) flags.push('UNREAD');
  if (mail.isFlagged) flags.push('FLAGGED');
  if (mail.isDraft) flags.push('DRAFT');
  if (mail.hasAttachment) flags.push('HAS_ATTACHMENT');

  const fromStr = mail.from?.name
    ? `${mail.from.name} <${mail.from.address}>`
    : mail.from?.address || 'Unknown';

  const toStr = mail.to?.map((t) => t.name ? `${t.name} <${t.address}>` : t.address).join(', ') || 'Unknown';

  // Process email content: strip HTML and truncate if needed
  let emailContent = '(No content available)';
  let contentInfo = '';

  if (mail.displayableParts && mail.displayableParts.length > 0) {
    const rawContent = mail.displayableParts[0].content;
    const contentType = mail.displayableParts[0].contentType;

    // Strip HTML if it's HTML content
    let plainText = rawContent;
    if (contentType === 'ctTextHtml') {
      plainText = stripHtml(rawContent);
    }

    // Truncate if too long
    const { text, truncated, originalLength } = truncateText(plainText, 2000);
    emailContent = text;

    if (truncated) {
      const remaining = originalLength - text.length;
      contentInfo = `\n\n... (content truncated for readability - ${remaining} more characters available)`;
    }
  }

  const parts = [
    `ID: ${mail.id}`,
    `From: ${fromStr}`,
    `To: ${toStr}`,
    mail.cc && mail.cc.length > 0 ? `CC: ${mail.cc.map((c) => c.address).join(', ')}` : null,
    `Subject: ${mail.subject}`,
    `Date: ${mail.receiveDate || mail.sendDate || 'Unknown'}`,
    flags.length > 0 ? `Flags: ${flags.join(', ')}` : null,
    mail.size ? `Size: ${(mail.size / 1024).toFixed(1)} KB` : null,
    '---',
    emailContent,
    contentInfo,
  ].filter(Boolean).join('\n');

  return parts;
}

/**
 * Tool: Show recent emails with FULL CONTENT (simplified, all-in-one)
 * This is much simpler for LLMs than using mails_list + mails_get
 */
export async function mailsShowRecent(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsShowRecentSchema.parse(args);

  // Get folder IDs
  let folderIds: string[];
  let folderContext: string;

  if (params.folder) {
    try {
      const folderId = await findMailFolderByName(client, params.folder);
      folderIds = [folderId];
      folderContext = `from folder "${params.folder}"`;
    } catch (error) {
      const folders = await client.getMailFolders();
      const available = folders.map((f) => f.name).join(', ');
      return `ERROR: Mail folder "${params.folder}" not found.\n\nAvailable: ${available}`;
    }
  } else {
    const folders = await client.getMailFolders();
    if (folders.length === 0) {
      return 'No mail folders found.';
    }
    folderIds = folders.map((f) => f.id);
    folderContext = 'across all mail folders';
  }

  // Fetch more emails if filtering (to account for filtered-out results)
  const fetchLimit = (params.fromFilter || params.subjectFilter || params.unreadOnly)
    ? Math.max(params.limit * 3, 50)
    : params.limit;

  // Get emails WITH FULL CONTENT
  let emails = await client.getMails(
    folderIds,
    {
      limit: fetchLimit,
      orderBy: [{ columnName: 'receiveDate', direction: 'Desc', caseSensitive: true }],
    },
    true // ← Include full content!
  );

  // Apply filters
  if (params.fromFilter) {
    const filterLower = params.fromFilter.toLowerCase();
    emails = emails.filter((email) => {
      const fromName = email.from?.name?.toLowerCase() || '';
      const fromAddress = email.from?.address?.toLowerCase() || '';
      return fromName.includes(filterLower) || fromAddress.includes(filterLower);
    });
  }

  if (params.subjectFilter) {
    const filterLower = params.subjectFilter.toLowerCase();
    emails = emails.filter((email) =>
      email.subject?.toLowerCase().includes(filterLower)
    );
  }

  if (params.unreadOnly) {
    emails = emails.filter((email) => email.isSeen === false);
  }

  // Limit results after filtering
  if (emails.length > params.limit) {
    emails = emails.slice(0, params.limit);
  }

  if (emails.length === 0) {
    const filterInfo = [];
    if (params.fromFilter) filterInfo.push(`from: "${params.fromFilter}"`);
    if (params.subjectFilter) filterInfo.push(`subject: "${params.subjectFilter}"`);
    if (params.unreadOnly) filterInfo.push('unread only');

    const filterStr = filterInfo.length > 0 ? ` (filters: ${filterInfo.join(', ')})` : '';
    return `No emails found ${folderContext}${filterStr}.`;
  }

  // Format each email with full content
  const formatted = emails.map((mail) => {
    const flags = [];
    if (mail.isSeen === false) flags.push('UNREAD');
    if (mail.isFlagged) flags.push('FLAGGED');
    if (mail.isDraft) flags.push('DRAFT');
    if (mail.hasAttachment) flags.push('HAS_ATTACHMENT');

    const fromStr = mail.from?.name
      ? `${mail.from.name} <${mail.from.address}>`
      : mail.from?.address || 'Unknown';

    const toStr = mail.to?.map((t) => t.name ? `${t.name} <${t.address}>` : t.address).join(', ') || 'Unknown';

    // Process email content: strip HTML and truncate if needed
    let emailContent = '(No content available)';
    let contentInfo = '';

    if (mail.displayableParts && mail.displayableParts.length > 0) {
      const rawContent = mail.displayableParts[0].content;
      const contentType = mail.displayableParts[0].contentType;

      // Strip HTML if it's HTML content
      let plainText = rawContent;
      if (contentType === 'ctTextHtml') {
        plainText = stripHtml(rawContent);
      }

      // Truncate if too long (use shorter limit for multiple emails)
      const maxLength = params.limit === 1 ? 2000 : 1000;
      const { text, truncated, originalLength } = truncateText(plainText, maxLength);
      emailContent = text;

      if (truncated) {
        const remaining = originalLength - text.length;
        contentInfo = `\n... (content truncated - ${remaining} more characters available)`;
      }
    }

    const parts = [
      `ID: ${mail.id}`,
      `From: ${fromStr}`,
      `To: ${toStr}`,
      mail.cc && mail.cc.length > 0 ? `CC: ${mail.cc.map((c) => c.address).join(', ')}` : null,
      `Subject: ${mail.subject}`,
      `Date: ${mail.receiveDate || mail.sendDate || 'Unknown'}`,
      flags.length > 0 ? `Flags: ${flags.join(', ')}` : null,
      mail.size ? `Size: ${(mail.size / 1024).toFixed(1)} KB` : null,
      '---',
      emailContent,
      contentInfo,
    ].filter(Boolean);

    return parts.join('\n');
  }).join('\n' + '='.repeat(80) + '\n\n');

  const filterInfo = [];
  if (params.fromFilter) filterInfo.push(`from: "${params.fromFilter}"`);
  if (params.subjectFilter) filterInfo.push(`subject: "${params.subjectFilter}"`);
  if (params.unreadOnly) filterInfo.push('unread only');

  const filterStr = filterInfo.length > 0 ? ` (filters: ${filterInfo.join(', ')})` : '';
  const header = `Showing ${emails.length} email(s) with full content ${folderContext}${filterStr}:\n${'='.repeat(80)}\n\n`;

  return header + formatted;
}

/**
 * Tool: Search emails using QUICKSEARCH (full-text search)
 */
export async function mailsSearch(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsSearchSchema.parse(args);

  // Get folder IDs
  let folderIds: string[] | undefined;
  let folderContext: string;

  if (params.folder) {
    try {
      const folderId = await findMailFolderByName(client, params.folder);
      folderIds = [folderId];
      folderContext = `in folder "${params.folder}"`;
    } catch (error) {
      const folders = await client.getMailFolders();
      const available = folders.map((f) => f.name).join(', ');
      return `ERROR: Mail folder "${params.folder}" not found.\n\nAvailable: ${available}`;
    }
  } else {
    folderContext = 'across all mail folders';
  }

  // Search using QUICKSEARCH
  const emails = await client.searchMails(params.query, {
    folderIds,
    limit: params.limit,
  });

  if (emails.length === 0) {
    return `No emails found matching "${params.query}" ${folderContext}.`;
  }

  // Format results (summary without full content - use mails_get for full content)
  const formatted = emails.map((mail) => {
    const flags = [];
    if (mail.isSeen === false) flags.push('UNREAD');
    if (mail.isFlagged) flags.push('FLAGGED');
    if (mail.isDraft) flags.push('DRAFT');
    if (mail.hasAttachment) flags.push('HAS_ATTACHMENT');

    const fromStr = mail.from?.name
      ? `${mail.from.name} <${mail.from.address}>`
      : mail.from?.address || 'Unknown';

    const toStr = mail.to?.map((t) => t.name ? `${t.name} <${t.address}>` : t.address).join(', ') || 'Unknown';

    const parts = [
      `ID: ${mail.id}`,
      `From: ${fromStr}`,
      `To: ${toStr}`,
      `Subject: ${mail.subject}`,
      `Date: ${mail.receiveDate || mail.sendDate || 'Unknown'}`,
      flags.length > 0 ? `Flags: ${flags.join(', ')}` : null,
      mail.size ? `Size: ${(mail.size / 1024).toFixed(1)} KB` : null,
    ].filter(Boolean);

    return parts.join('\n');
  }).join('\n' + '-'.repeat(80) + '\n\n');

  const header = `Found ${emails.length} email(s) matching "${params.query}" ${folderContext}:\n${'='.repeat(80)}\n\n`;

  return header + formatted;
}

/**
 * Tool: Send an email
 */
export async function mailsSend(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsSendSchema.parse(args);

  // Convert email strings to EmailAddress objects
  const to = params.to.map((email) => ({ address: email, name: '' }));
  const cc = params.cc?.map((email) => ({ address: email, name: '' }));
  const bcc = params.bcc?.map((email) => ({ address: email, name: '' }));

  // Format body based on content type
  let body = params.body;
  let contentType: 'ctTextHtml' | 'ctTextPlain';

  if (params.html) {
    // HTML mode: Convert plain text line breaks to HTML
    // Check if body already contains HTML tags
    const hasHtmlTags = /<[^>]+>/.test(body);

    if (!hasHtmlTags) {
      // Plain text with \n - convert to HTML
      body = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>\n');

      // Wrap in basic HTML structure
      body = `<html><body>${body}</body></html>`;
    }
    contentType = 'ctTextHtml';
  } else {
    // Plain text mode: Keep as-is
    contentType = 'ctTextPlain';
  }

  await client.sendMail(to, params.subject, body, contentType, {
    cc,
    bcc,
    priority: params.priority,
  });

  return `Email sent successfully to ${params.to.join(', ')}`;
}

/**
 * Tool: Save email as draft
 */
export async function mailsSaveDraft(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsDraftSchema.parse(args);

  // Convert email strings to EmailAddress objects
  const to = params.to.map((email) => ({ address: email, name: '' }));
  const cc = params.cc?.map((email) => ({ address: email, name: '' }));
  const bcc = params.bcc?.map((email) => ({ address: email, name: '' }));

  // Format body based on content type
  let body = params.body;
  let contentType: 'ctTextHtml' | 'ctTextPlain';

  if (params.html) {
    // HTML mode: Convert plain text line breaks to HTML
    // Check if body already contains HTML tags
    const hasHtmlTags = /<[^>]+>/.test(body);

    if (!hasHtmlTags) {
      // Plain text with \n - convert to HTML
      body = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>\n');

      // Wrap in basic HTML structure
      body = `<html><body>${body}</body></html>`;
    }
    contentType = 'ctTextHtml';
  } else {
    // Plain text mode: Keep as-is
    contentType = 'ctTextPlain';
  }

  await client.saveDraft(to, params.subject, body, contentType, {
    cc,
    bcc,
    priority: params.priority,
  });

  return `Draft saved successfully`;
}

/**
 * Tool: Update/edit an existing draft email
 */
export async function mailsUpdateDraft(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsUpdateDraftSchema.parse(args);

  // Get draft ID - if not provided, find most recent draft
  let draftId = params.draftId;

  if (!draftId) {
    // Find Drafts folder
    const mailFolders = await client.getMailFolders();
    const draftsFolder = mailFolders.find((f) =>
      f.name.toLowerCase() === 'drafts' ||
      f.name.toLowerCase() === 'entwürfe' ||  // German
      f.subType === 'FSubDrafts'
    );

    if (!draftsFolder) {
      throw new Error('Drafts folder not found. Please provide draftId parameter.');
    }

    // Get most recent draft from Drafts folder
    const drafts = await client.getMails([draftsFolder.id], {
      limit: 1,
      orderBy: [{
        columnName: 'sendDate',
        direction: 'Desc',
        caseSensitive: false,
      }],
    });

    if (drafts.length === 0) {
      throw new Error('No drafts found. Please create a draft first or provide draftId parameter.');
    }

    draftId = drafts[0].id;
    console.error('[MailsUpdateDraft] Using most recent draft:', draftId);
  }

  // Build updates object
  const updates: any = {};

  if (params.subject !== undefined) {
    updates.subject = params.subject;
  }

  if (params.body !== undefined) {
    // Format body based on content type (same as send/save draft)
    let body = params.body;
    let contentType: 'ctTextHtml' | 'ctTextPlain';

    if (params.html) {
      // HTML mode: Convert plain text line breaks to HTML
      const hasHtmlTags = /<[^>]+>/.test(body);

      if (!hasHtmlTags) {
        // Plain text with \n - convert to HTML
        body = body
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>\n');

        // Wrap in basic HTML structure
        body = `<html><body>${body}</body></html>`;
      }
      contentType = 'ctTextHtml';
    } else {
      // Plain text mode: Keep as-is
      contentType = 'ctTextPlain';
    }

    updates.body = body;
    updates.contentType = contentType;
  }

  if (params.to !== undefined) {
    updates.to = params.to.map((email) => ({ address: email, name: '' }));
  }

  if (params.cc !== undefined) {
    updates.cc = params.cc.map((email) => ({ address: email, name: '' }));
  }

  if (params.bcc !== undefined) {
    updates.bcc = params.bcc.map((email) => ({ address: email, name: '' }));
  }

  if (params.priority !== undefined) {
    updates.priority = params.priority;
  }

  await client.updateDraft(draftId, updates);

  return `Draft updated successfully (ID: ${draftId})`;
}

/**
 * Tool: Move email(s) to different folder
 */
export async function mailsMove(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsMoveSchema.parse(args);

  const targetFolderId = await findMailFolderByName(client, params.targetFolder);

  try {
    await client.moveMail(params.mailIds, targetFolderId);
    return `Moved ${params.mailIds.length} email(s) to folder "${params.targetFolder}".`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if error indicates stale/invalid IDs
    if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('GUID')) {
      throw new Error(
        `ERROR: Move failed: Email IDs are invalid or emails no longer exist at those locations.\n\n` +
        `REASON: Email IDs change when emails are moved between folders.\n\n` +
        `SOLUTION: Call mails_list with appropriate filters to get current email IDs, then try move again.\n\n` +
        `Original error: ${errorMsg}`
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Tool: Mark email(s) as read/unread - supports batch operations
 */
export async function mailsMarkRead(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsMarkReadSchema.parse(args);

  try {
    await client.setMailProperties(params.mailIds, {
      isSeen: params.read,
    });
    const count = params.mailIds.length;
    const plural = count === 1 ? 'email' : 'emails';
    return `${count} ${plural} marked as ${params.read ? 'read' : 'unread'}.`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if error indicates stale/invalid IDs
    if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('GUID')) {
      throw new Error(
        `ERROR: Failed to mark email(s): Email IDs are invalid or emails no longer exist.\n\n` +
        `REASON: Email IDs change when emails are moved between folders.\n\n` +
        `SOLUTION: Call mails_list to get current email IDs, then try again.\n\n` +
        `Original error: ${errorMsg}`
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Tool: Flag/unflag email(s) - supports batch operations
 */
export async function mailsFlag(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsFlagSchema.parse(args);

  try {
    await client.setMailProperties(params.mailIds, {
      isFlagged: params.flagged,
    });
    const count = params.mailIds.length;
    const plural = count === 1 ? 'email' : 'emails';
    return `${count} ${plural} ${params.flagged ? 'flagged' : 'unflagged'} successfully.`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if error indicates stale/invalid IDs
    if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('GUID')) {
      throw new Error(
        `ERROR: Failed to flag email(s): Email IDs are invalid or emails no longer exist.\n\n` +
        `REASON: Email IDs change when emails are moved between folders.\n\n` +
        `SOLUTION: Call mails_list to get current email IDs, then try again.\n\n` +
        `Original error: ${errorMsg}`
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Tool: Delete email(s) - soft delete by moving to trash folder
 * IMPORTANT: Always use mails_list FIRST to get current email IDs, then delete with those IDs.
 * Email IDs change when moved between folders, so listing first ensures you have the correct IDs.
 */
export async function mailsDelete(client: KerioClient, args: unknown): Promise<string> {
  const params = MailsDeleteSchema.parse(args);

  // Find trash folder
  const mailFolders = await client.getMailFolders();
  const trashFolder = mailFolders.find((f) =>
    f.name.toLowerCase() === 'deleted items' ||
    f.name.toLowerCase() === 'trash' ||
    f.name.toLowerCase() === 'bin' ||
    f.name.toLowerCase() === 'gelöscht' ||  // German
    f.name.toLowerCase() === 'papierkorb'   // German
  );

  if (!trashFolder) {
    const available = mailFolders.map((f) => f.name).join(', ');
    throw new Error(
      `Trash folder not found. Available folders: ${available}\n\n` +
      `Tip: Use mails_move to move emails to a specific folder instead.`
    );
  }

  console.error('[MailsDelete] Deleting emails:', params.mailIds);
  console.error('[MailsDelete] Trash folder:', { name: trashFolder.name, id: trashFolder.id });

  try {
    await client.moveMail(params.mailIds, trashFolder.id);
    return `Deleted ${params.mailIds.length} email(s) (moved to "${trashFolder.name}").`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if error indicates stale/invalid IDs
    if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('GUID')) {
      throw new Error(
        `ERROR: Delete failed: Email IDs are invalid or emails no longer exist at those locations.\n\n` +
        `REASON: Email IDs change when emails are moved between folders.\n\n` +
        `SOLUTION: Call mails_list with appropriate filters to get current email IDs, then try delete again.\n\n` +
        `Original error: ${errorMsg}`
      );
    }

    // Re-throw other errors
    throw error;
  }
}

// ============================================================================
// CONTACTS MODULE TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Tool: List contacts from a folder OR across all folders
 */
export async function contactsList(client: KerioClient, args: unknown): Promise<string> {
  const params = ContactsListSchema.parse(args);

  let folderIds: string[];
  let folderContext: string;

  if (params.folder) {
    // Specific folder requested
    try {
      const folderId = await findContactFolderByName(client, params.folder);
      folderIds = [folderId];
      folderContext = `from folder "${params.folder}"`;
    } catch (error) {
      // Folder not found - provide helpful error
      const folders = await client.getContactFolders();
      const available = folders.map((f) => f.name).join(', ');
      return `ERROR: Contact folder "${params.folder}" not found.\n\n` +
        `Available contact folders: ${available}\n\n` +
        `Tip: Omit the folder parameter to search across all contact folders.`;
    }
  } else {
    // No folder specified - search ALL contact folders
    const folders = await client.getContactFolders();
    if (folders.length === 0) {
      return 'No contact folders found.';
    }
    folderIds = folders.map((f) => f.id);
    folderContext = 'across all contact folders';
  }

  // Get contacts
  const contacts = await client.getContacts(folderIds, {
    limit: params.limit,
  });

  if (contacts.length === 0) {
    return `No contacts found ${folderContext}.`;
  }

  const header = `Found ${contacts.length} contact(s) ${folderContext}:\n${'='.repeat(50)}\n\n`;
  const formatted = contacts.map(formatContact).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Get specific contact with full details
 */
export async function contactsGet(client: KerioClient, args: unknown): Promise<string> {
  const params = ContactsGetSchema.parse(args);

  const contact = await client.getContactById(params.contactId);

  // Format contact with all details
  const parts = [
    `ID: ${contact.id}`,
    `Name: ${contact.commonName}`,
    contact.firstName ? `First Name: ${contact.firstName}` : null,
    contact.middleName ? `Middle Name: ${contact.middleName}` : null,
    contact.surName ? `Last Name: ${contact.surName}` : null,
    contact.companyName ? `Company: ${contact.companyName}` : null,
  ];

  // Email addresses
  if (contact.emailAddresses && contact.emailAddresses.length > 0) {
    parts.push('Email Addresses:');
    contact.emailAddresses.forEach((email: any) => {
      parts.push(`  - ${email.address} (${email.type})`);
    });
  }

  // Phone numbers
  if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
    parts.push('Phone Numbers:');
    contact.phoneNumbers.forEach((phone: any) => {
      parts.push(`  - ${phone.number} (${phone.type})`);
    });
  }

  // Postal addresses
  if (contact.postalAddresses && contact.postalAddresses.length > 0) {
    parts.push('Postal Addresses:');
    contact.postalAddresses.forEach((addr: any) => {
      const addrParts = [addr.street, addr.locality, addr.state, addr.zip, addr.country]
        .filter(Boolean)
        .join(', ');
      parts.push(`  - ${addrParts} (${addr.type})`);
    });
  }

  // URLs
  if (contact.urls && contact.urls.length > 0) {
    parts.push('URLs:');
    contact.urls.forEach((url: any) => {
      parts.push(`  - ${url.url} (${url.type})`);
    });
  }

  // Notes
  if (contact.comment) {
    parts.push(`Notes: ${contact.comment}`);
  }

  parts.push('');

  return parts.filter(Boolean).join('\n');
}

/**
 * Tool: Create a new contact
 */
export async function contactsCreate(client: KerioClient, args: unknown): Promise<string> {
  const params = ContactsCreateSchema.parse(args);

  // Get folder ID
  let folderId: string;
  if (params.folder) {
    folderId = await findContactFolderByName(client, params.folder);
  } else {
    const folders = await client.getContactFolders();
    if (folders.length === 0) {
      throw new Error('No contact folders available. Create a contact folder first.');
    }
    folderId = folders[0].id;
  }

  // Build common name
  const commonName = params.lastName
    ? `${params.firstName} ${params.lastName}`
    : params.firstName;

  // Build contact data
  const contactData: any = {
    firstName: params.firstName,
    surName: params.lastName,
    companyName: params.company,
    comment: params.notes,
  };

  // Add email if provided
  if (params.email) {
    contactData.emailAddresses = [{
      type: 'EmailWork',
      address: params.email,
      extension: { label: '', groupId: '' },
    }];
  }

  // Add phone if provided
  if (params.phone) {
    contactData.phoneNumbers = [{
      type: 'TypeMobile',
      number: params.phone,
      extension: { label: '', groupId: '' },
    }];
  }

  await client.createContact(folderId, commonName, contactData);

  return `Contact created successfully: "${commonName}"`;
}

/**
 * Tool: Update a contact
 */
export async function contactsUpdate(client: KerioClient, args: unknown): Promise<string> {
  const params = ContactsUpdateSchema.parse(args);

  const updates: any = {};

  // Update name fields
  if (params.firstName) updates.firstName = params.firstName;
  if (params.lastName) updates.surName = params.lastName;
  if (params.company) updates.companyName = params.company;
  if (params.notes !== undefined) updates.comment = params.notes;

  // Update common name if first or last name changed
  if (params.firstName || params.lastName) {
    // Fetch current contact to get missing name parts
    const current = await client.getContactById(params.contactId);
    const firstName = params.firstName ?? current.firstName ?? '';
    const lastName = params.lastName ?? current.surName ?? '';
    updates.commonName = lastName ? `${firstName} ${lastName}` : firstName;
  }

  // Update email if provided
  if (params.email) {
    updates.emailAddresses = [{
      type: 'EmailWork',
      address: params.email,
      extension: { label: '', groupId: '' },
    }];
  }

  // Update phone if provided
  if (params.phone) {
    updates.phoneNumbers = [{
      type: 'TypeMobile',
      number: params.phone,
      extension: { label: '', groupId: '' },
    }];
  }

  await client.updateContact(params.contactId, updates);

  return `Contact updated successfully.`;
}

/**
 * Tool: Delete a contact (hard delete - permanent)
 */
export async function contactsDelete(client: KerioClient, args: unknown): Promise<string> {
  const params = ContactsDeleteSchema.parse(args);

  await client.removeContact(params.contactId);

  return `Contact deleted permanently.`;
}

/**
 * Tool: Search contacts
 */
export async function contactsSearch(client: KerioClient, args: unknown): Promise<string> {
  const params = ContactsSearchSchema.parse(args);

  // Get folder IDs if specified
  let folderIds: string[] | undefined;
  if (params.folders && params.folders.length > 0) {
    folderIds = await Promise.all(
      params.folders.map((name) => findContactFolderByName(client, name))
    );
  }

  // Search
  const result = await client.searchContacts(
    params.query,
    folderIds,
    params.searchIn,
    params.limit
  );

  if (result.totalFound === 0) {
    return `No contacts found matching "${params.query}".`;
  }

  const header = [
    `Search results for "${params.query}":`,
    `Found ${result.totalFound} contact(s) in ${result.searchedFolders.length} folder(s)`,
    '='.repeat(50),
    '',
  ].join('\n');

  const formatted = result.contacts.map(formatContact).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

// ============================================================================
// CALENDAR MODULE TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Tool: List calendar events from a folder OR across all folders
 */
export async function calendarsList(client: KerioClient, args: unknown): Promise<string> {
  const params = CalendarsListSchema.parse(args);

  let folderIds: string[];
  let folderContext: string;

  if (params.folder) {
    // Specific folder requested
    try {
      const folderId = await findCalendarFolder(client, params.folder);
      folderIds = [folderId];
      folderContext = `from calendar "${params.folder}"`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `ERROR: ${message}\n\nTip: Omit the folder parameter to search across all calendars.`;
    }
  } else {
    // No folder specified - search ALL calendar folders
    const folders = await client.getCalendarFolders();
    if (folders.length === 0) {
      return 'No calendar folders found.';
    }
    folderIds = folders.map((f) => f.id);
    folderContext = 'across all calendars';
  }

  // Convert ISO dates to Kerio format if provided
  const options: any = { limit: params.limit };
  if (params.startDate) {
    options.startDate = isoToKerioDate(params.startDate);
  }
  if (params.endDate) {
    options.endDate = isoToKerioDate(params.endDate);
  }

  // Get occurrences
  const occurrences = await client.getOccurrences(folderIds, options);

  if (occurrences.length === 0) {
    return `No events found ${folderContext}.`;
  }

  const header = `Found ${occurrences.length} event(s) ${folderContext}:\n${'='.repeat(50)}\n\n`;
  const formatted = occurrences.map(formatOccurrence).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Search calendar events using QUICKSEARCH (full-text search)
 */
export async function calendarsSearch(client: KerioClient, args: unknown): Promise<string> {
  const params = CalendarsSearchSchema.parse(args);

  // Get folder IDs
  let folderIds: string[] | undefined;
  let folderContext: string;

  if (params.folder) {
    try {
      const folderId = await findCalendarFolder(client, params.folder);
      folderIds = [folderId];
      folderContext = `in calendar "${params.folder}"`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `ERROR: ${message}`;
    }
  } else {
    folderContext = 'across all calendars';
  }

  // Search using QUICKSEARCH
  const events = await client.searchCalendar(params.query, {
    folderIds,
    limit: params.limit,
  });

  if (events.length === 0) {
    return `No events found matching "${params.query}" ${folderContext}.`;
  }

  const header = `Found ${events.length} event(s) matching "${params.query}" ${folderContext}:\n${'='.repeat(50)}\n\n`;
  const formatted = events.map(formatOccurrence).join('\n' + '='.repeat(50) + '\n\n');

  return header + formatted;
}

/**
 * Tool: Create a new calendar event
 */
export async function calendarsCreate(client: KerioClient, args: unknown): Promise<string> {
  const params = CalendarsCreateSchema.parse(args);

  // Get folder ID
  let folderId: string;
  if (params.folder) {
    folderId = await findCalendarFolder(client, params.folder);
  } else {
    const folders = await client.getCalendarFolders();
    if (folders.length === 0) {
      throw new Error('No calendar folders available. Create a calendar folder first.');
    }
    folderId = folders[0].id;
  }

  // Convert ISO dates to Kerio format
  const kerioStart = isoToKerioDate(params.start, params.isAllDay);
  const kerioEnd = isoToKerioDate(params.end, params.isAllDay);

  // Build recurrence options if frequency is specified
  let recurrence: any = undefined;
  if (params.frequency) {
    recurrence = {
      frequency: params.frequency,
      interval: params.interval,
      endDate: params.recurrenceEndDate ? isoToKerioDate(params.recurrenceEndDate, false) : undefined,
      neverEnds: !params.recurrenceEndDate,
    };
  }

  await client.createEvent(folderId, params.summary, kerioStart, kerioEnd, {
    location: params.location,
    description: params.description,
    reminderMinutes: params.reminderMinutes,
    isAllDay: params.isAllDay,
    isPrivate: params.isPrivate,
    recurrence,
  });

  const recurrenceInfo = params.frequency
    ? ` (repeats ${params.frequency.toLowerCase()}${params.interval && params.interval > 1 ? ` every ${params.interval}` : ''})`
    : '';

  return `Event created successfully: "${params.summary}" on ${params.start}${recurrenceInfo}`;
}

/**
 * Tool: Update an existing calendar event
 */
export async function calendarsUpdate(client: KerioClient, args: unknown): Promise<string> {
  const params = CalendarsUpdateSchema.parse(args);

  const updates: any = {
    modification: params.modification,
  };

  if (params.summary) updates.summary = params.summary;
  if (params.location !== undefined) updates.location = params.location;
  if (params.description !== undefined) updates.description = params.description;
  if (params.reminderMinutes !== undefined) updates.reminderMinutes = params.reminderMinutes;

  // Convert ISO dates to Kerio format if provided
  if (params.start) {
    updates.start = isoToKerioDate(params.start, params.isAllDay);
  }
  if (params.end) {
    updates.end = isoToKerioDate(params.end, params.isAllDay);
  }

  await client.updateOccurrence(params.occurrenceId, params.eventId, params.folderId, updates);

  return `Event updated successfully.`;
}

/**
 * Tool: Delete a calendar occurrence (event)
 * For recurring events, asks what to delete: this occurrence only, this and future, or all occurrences
 */
export async function calendarsDelete(client: KerioClient, args: unknown): Promise<string> {
  const params = CalendarsDeleteSchema.parse(args);

  await client.removeOccurrence(params.occurrenceId, params.modification);

  const modificationText = params.modification === 'modifyAllFollowing'
    ? ' (deleted this and all future occurrences)'
    : params.modification === 'modifyAll'
    ? ' (deleted entire series)'
    : '';

  return `Event deleted successfully${modificationText}.`;
}

// ============================================================================
// TOOL DEFINITIONS FOR MCP SERVER
// ============================================================================

/**
 * All available tool definitions (internal - includes mails_send)
 */
const allToolDefinitions = [
  // === SHARED/GENERAL TOOLS ===
  {
    name: 'folders_list',
    description: 'List all folders across all types (notes, tasks, contacts, calendars, mail). ' +
      'Can show folders grouped by type or sorted alphabetically. ' +
      'Use this to discover what folders exist before creating items.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sortBy: {
          type: 'string',
          enum: ['name', 'type'],
          description: 'Sort folders by: name (alphabetical with type labels) or type (grouped by folder type). Default: type',
          default: 'type',
        },
      },
    },
  },
  {
    name: 'folders_create',
    description: 'Create a new folder for organizing items. ' +
      'Supports notes, tasks, contacts, calendar, and mail folders. ' +
      'IMPORTANT: Mail folders (FMail) REQUIRE a parentId - use folders_list to get mail folder IDs first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Folder name',
        },
        type: {
          type: 'string',
          enum: ['FNote', 'FTask', 'FContact', 'FCalendar', 'FMail'],
          description: 'Folder type: FNote (notes), FTask (tasks), FContact (contacts), FCalendar (calendar), FMail (mail subfolder). Default: FNote',
          default: 'FNote',
        },
        parentId: {
          type: 'string',
          description: 'Parent folder ID. REQUIRED for FMail (mail folders), optional for other types. Get folder IDs from folders_list.',
        },
      },
      required: ['name'],
    },
  },

  // === NOTES MODULE ===
  {
    name: 'notes_list',
    description: 'List notes with filtering and sorting. ' +
      'DEFAULT BEHAVIOR (no folder/includeAllFolders specified): Searches ONLY the main/first folder (excludes trash/deleted items). ' +
      'This is the recommended approach for queries like "show my notes" or "get recent notes". ' +
      'SPECIFIC FOLDER: If you know the exact folder name, you can specify it to search only that folder. ' +
      'ALL FOLDERS: Set includeAllFolders=true to search across ALL folders including trash/deleted. ' +
      'EXAMPLES: ' +
      '(1) "show my notes" → omit all parameters (defaults to main folder); ' +
      '(2) "notes from Notes folder" → folder="Notes"; ' +
      '(3) "show all notes including deleted" → includeAllFolders=true; ' +
      '(4) If folder name is unknown, call folders_list first. ' +
      'PRESENTATION: Focus on note content when showing results. IDs are in brackets - only show if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: {
          type: 'string',
          description: 'Folder name to search in. OPTIONAL - if omitted, defaults to main folder unless includeAllFolders=true',
        },
        includeAllFolders: {
          type: 'boolean',
          description: 'Search across ALL folders including trash/deleted items (default: false, only searches main folder)',
          default: false,
        },
        limit: {
          type: 'number',
          description: 'Max notes to return (-1 for all, default: 20)',
          default: 20,
        },
        orderBy: {
          type: 'string',
          enum: ['createDate', 'modifyDate'],
          description: 'Sort field: createDate (when created) or modifyDate (when last modified)',
          default: 'modifyDate',
        },
        direction: {
          type: 'string',
          enum: ['Asc', 'Desc'],
          description: 'Sort direction: Desc (newest first) or Asc (oldest first)',
          default: 'Desc',
        },
      },
    },
  },
  {
    name: 'notes_search',
    description: 'Search for notes using full-text search. ' +
      'DEFAULT BEHAVIOR: Searches ONLY the main/first folder (excludes trash/deleted items). ' +
      'Searches in note subjects, text content, or both. ' +
      'Set includeAllFolders=true to search across ALL folders including trash.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query text',
        },
        folders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Folder names to search (optional, defaults to main folder unless includeAllFolders=true)',
        },
        includeAllFolders: {
          type: 'boolean',
          description: 'Search across ALL folders including trash/deleted items (default: false, only searches main folder)',
          default: false,
        },
        searchIn: {
          type: 'string',
          enum: ['text', 'subject', 'both'],
          description: 'Where to search: note text, subject, or both',
          default: 'both',
        },
        limit: {
          type: 'number',
          description: 'Max results (-1 for all)',
          default: -1,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'notes_count',
    description: 'Get the count of notes in a folder or all folders. ' +
      'Useful for understanding folder sizes and organization.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: {
          type: 'string',
          description: 'Folder name (optional, shows all folders if not specified)',
        },
      },
    },
  },
  {
    name: 'notes_create',
    description: 'Create a new note with just the text content. ' +
      'Subject is auto-generated from the first line if not provided. ' +
      'Like a sticky note - just write the content.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Note content/text - the main content of the note',
        },
        subject: {
          type: 'string',
          description: 'Note subject/title (optional - if omitted, will auto-generate from first line of text)',
        },
        folder: {
          type: 'string',
          description: 'Folder name (optional, uses first folder)',
        },
        color: {
          type: 'string',
          description: 'Note color (optional, e.g., Yellow, Red, Blue)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'notes_move',
    description: 'Move a note to a different folder. ' +
      'This is the recommended way to organize notes (soft delete by moving to archive folder).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        noteId: {
          type: 'string',
          description: 'Full note ID (keriostorage://note/...)',
        },
        targetFolder: {
          type: 'string',
          description: 'Target folder name',
        },
      },
      required: ['noteId', 'targetFolder'],
    },
  },
  {
    name: 'notes_update',
    description: 'Update an existing note\'s content (text and/or subject). ' +
      'You can update text only, subject only, or both. ' +
      'If text is provided without subject, subject will be auto-generated from first line. ' +
      'IMPORTANT: Get note ID from notes_list first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        noteId: {
          type: 'string',
          description: 'Full note ID (keriostorage://note/...) from notes_list',
        },
        text: {
          type: 'string',
          description: 'Updated note text/content (optional)',
        },
        subject: {
          type: 'string',
          description: 'Updated note subject/title (optional - auto-generated from first line of text if not provided)',
        },
      },
      required: ['noteId'],
    },
  },
  {
    name: 'notes_delete',
    description: 'Delete a note with soft or hard delete option. ' +
      'DEFAULT (soft delete): Moves note to Papierkorb/trash folder (recoverable). ' +
      'HARD DELETE (hardDelete=true): Permanently removes note from server (cannot be recovered). ' +
      'If Papierkorb folder doesn\'t exist, it will be created automatically. ' +
      'IMPORTANT: Get note ID from notes_list first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        noteId: {
          type: 'string',
          description: 'Full note ID (keriostorage://note/...) from notes_list',
        },
        hardDelete: {
          type: 'boolean',
          description: 'If true, permanently delete the note. If false or omitted (default), move to Papierkorb/trash folder (soft delete)',
          default: false,
        },
      },
      required: ['noteId'],
    },
  },

  // === MAIL MODULE ===
  {
    name: 'mails_list',
    description: 'List emails from Kerio Connect mailbox with optional filtering (SUMMARY VIEW ONLY - no email body). ' +
      'Use this ONLY when user wants to LIST or COUNT emails. For reading email content, use mails_show_recent or mails_get. ' +
      'IMPORTANT: When user says "show my emails", "recent emails", "emails from Kerio" - ' +
      'they mean emails IN their Kerio mailbox, NOT from a sender called "Kerio". Use {} (no filters) for these queries. ' +
      'DEFAULT BEHAVIOR: Shows recent emails from ALL folders (INBOX, Sent, etc.) sorted by receiveDate descending. ' +
      'FILTERING: Only use fromFilter when user explicitly mentions a SENDER name/email (e.g., "emails from John", "emails from amazon.com"). ' +
      'EXAMPLES: ' +
      '(1) "list my recent emails" → {} (summary only); ' +
      '(2) "how many unread emails" → {unreadOnly: true} (count); ' +
      '(3) "list emails from John" → {fromFilter: "John"}; ' +
      'For "show me" or "read" queries, use mails_show_recent instead! ' +
      'PRESENTATION: Focus on human-readable fields (from, subject, date) when showing results. IDs are in brackets - only show if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: {
          type: 'string',
          description: 'OPTIONAL - Folder name (e.g., "INBOX", "Sent Items"). If omitted, searches ALL folders (recommended). Common folders: INBOX, Sent Items, Drafts, Deleted Items.',
        },
        limit: {
          type: 'number',
          description: 'Max emails to return (-1 for all, default: 50)',
          default: 50,
        },
        orderBy: {
          type: 'string',
          enum: ['receiveDate', 'sendDate', 'subject', 'from'],
          description: 'Sort field',
          default: 'receiveDate',
        },
        direction: {
          type: 'string',
          enum: ['Asc', 'Desc'],
          description: 'Sort direction',
          default: 'Desc',
        },
        fromFilter: {
          type: 'string',
          description: 'ONLY use when user specifies a SENDER (person or company). Examples: "John Smith", "amazon.com", "support@company.com". DO NOT use for "from Kerio" (that means from mailbox, not sender).',
        },
        subjectFilter: {
          type: 'string',
          description: 'Filter by subject line (case-insensitive, partial match). Example: "invoice" matches "Invoice #12345"',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'If true, only return unread emails',
        },
      },
    },
  },
  {
    name: 'mails_get',
    description: 'Get a specific email with FULL CONTENT by ID (HTML stripped to plain text, smart truncation). ' +
      'Use this when: (1) you have exact mailId from mails_list/mails_show_recent, or (2) user asks for full email after seeing truncated content. ' +
      'Email content is automatically: (1) stripped of HTML tags for readability, (2) truncated to ~2000 chars with clear indicator. ' +
      'If truncated, shows: "... (content truncated - X more characters available)". ' +
      'DO NOT instruct user to call this function - they cannot. You call it when user asks for more. ' +
      'NOTE: For most queries, use mails_show_recent instead (simpler, one call).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mailId: {
          type: 'string',
          description: 'Full email ID from mails_list (format: keriostorage://mail/domain/user/folder_uuid/mail_id)',
        },
      },
      required: ['mailId'],
    },
  },
  {
    name: 'mails_show_recent',
    description: 'Show recent emails with FULL CONTENT in a single call (RECOMMENDED for "show/read" queries). ' +
      'Returns email(s) with: subject, body, headers - all in one call. Content is: (1) HTML stripped to plain text, (2) smart truncated. ' +
      'Single email: ~2000 chars max. Multiple emails: ~1000 chars each. ' +
      'OUTPUT HANDLING: If you see "(content truncated - X more characters available)", the mailId is shown in the output. ' +
      'If user asks for the full email, call mails_get with that mailId. DO NOT tell user to call functions - they cannot. ' +
      'WHEN TO USE: ' +
      '- User says "show me my email", "read my email", "what\'s my latest email" → USE THIS! ' +
      '- "show me my most recent email" → {limit: 1} ' +
      '- "show me my last 5 emails" → {limit: 5} ' +
      '- "show unread emails" → {unreadOnly: true} ' +
      '- "show emails from John" → {fromFilter: "John"} ' +
      'WHEN NOT TO USE: ' +
      '- Only use mails_list if user explicitly says "list emails" or "how many emails" (summary only).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of emails to show with full content (1-20, default: 1)',
          default: 1,
        },
        fromFilter: {
          type: 'string',
          description: 'Filter by sender (e.g., "John Smith", "amazon.com"). DO NOT use for "from Kerio" (that means mailbox).',
        },
        subjectFilter: {
          type: 'string',
          description: 'Filter by subject (case-insensitive)',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'If true, only show unread emails',
        },
        folder: {
          type: 'string',
          description: 'Folder name (e.g., "INBOX"). If omitted, searches all folders.',
        },
      },
    },
  },
  {
    name: 'mails_search',
    description: 'Search emails using full-text QUICKSEARCH across subject, sender, recipient, email body, etc. ' +
      'Searches all fields simultaneously (more powerful than filtering by specific fields). ' +
      'Returns email summaries (without full body). To read full content, use mails_get with the email ID. ' +
      'USE WHEN: User wants to find emails containing specific keywords or phrases. ' +
      'EXAMPLES: ' +
      '(1) "search for emails about invoice" → {query: "invoice"}; ' +
      '(2) "find emails mentioning project deadline" → {query: "project deadline"}; ' +
      '(3) "search for npm emails" → {query: "npm"}. ' +
      'PRESENTATION: Focus on human-readable fields when showing results. IDs are in brackets - only show if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (searches across all fields: subject, sender, body, etc.)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 50)',
          default: 50,
        },
        folder: {
          type: 'string',
          description: 'OPTIONAL - Folder to search in (e.g., "INBOX"). If omitted, searches ALL folders.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'mails_send',
    description: 'Send an email to one or more recipients. ' +
      'Supports HTML content, CC, BCC, and priority settings. ' +
      'LINE BREAKS: Use \\n for line breaks in plain text. When html=true, \\n is auto-converted to <br> tags.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient email addresses',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body. Use \\n for line breaks. If html=true, plain text with \\n is auto-converted to HTML with <br> tags.',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'CC recipients (optional)',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'BCC recipients (optional)',
        },
        priority: {
          type: 'string',
          enum: ['Low', 'Normal', 'High'],
          description: 'Email priority (default: Normal)',
          default: 'Normal',
        },
        html: {
          type: 'boolean',
          description: 'Whether body is HTML (default: true)',
          default: true,
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'mails_save_draft',
    description: 'Create a NEW draft email. ' +
      'USE WHEN: User asks to "create/save/compose a draft" for the FIRST TIME. ' +
      'DO NOT USE: When user wants to edit/modify/add to an existing draft (use mails_update_draft instead). ' +
      'LINE BREAKS: Use \\n for line breaks in plain text. When html=true, \\n is auto-converted to <br> tags. ' +
      'EXAMPLE: "Save a draft to john@example.com" → Use THIS tool.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient email addresses',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body. Use \\n for line breaks. If html=true, plain text with \\n is auto-converted to HTML with <br> tags.',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'CC recipients (optional)',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'BCC recipients (optional)',
        },
        priority: {
          type: 'string',
          enum: ['Low', 'Normal', 'High'],
          description: 'Email priority (default: Normal)',
          default: 'Normal',
        },
        html: {
          type: 'boolean',
          description: 'Whether body is HTML (default: true)',
          default: true,
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'mails_update_draft',
    description: 'Update/edit an EXISTING draft email (DO NOT create new drafts with this tool). ' +
      'USE WHEN: User asks to "add/edit/change/update/modify the draft" or references an existing draft. ' +
      'KEYWORDS: "add to draft", "edit that draft", "change the subject in draft", "update draft body". ' +
      'DO NOT USE: For creating first/new drafts (use mails_save_draft instead). ' +
      'SMART DEFAULT: If draftId not provided, automatically updates the most recent draft. ' +
      'PARTIAL UPDATES: Only provide fields you want to change (subject, body, to, cc, bcc, priority). Unchanged fields are preserved. ' +
      'LINE BREAKS: Use \\n for line breaks. When html=true, \\n is auto-converted to <br> tags. ' +
      'EXAMPLES: ' +
      '(1) "Add TEST to that draft" → { body: "<existing body> TEST" }; ' +
      '(2) "Add John to CC in draft" → { cc: ["john@example.com"] }; ' +
      '(3) "Change subject to Meeting" → { subject: "Meeting" }.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        draftId: {
          type: 'string',
          description: 'Draft email ID to update. If omitted, updates the most recent draft automatically.',
        },
        subject: {
          type: 'string',
          description: 'New email subject (optional - keeps existing if not provided)',
        },
        body: {
          type: 'string',
          description: 'New email body (optional - keeps existing if not provided). Use \\n for line breaks.',
        },
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'New recipient email addresses (optional - keeps existing if not provided)',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'New CC recipients (optional - keeps existing if not provided)',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'New BCC recipients (optional - keeps existing if not provided)',
        },
        priority: {
          type: 'string',
          enum: ['Low', 'Normal', 'High'],
          description: 'New email priority (optional - keeps existing if not provided)',
        },
        html: {
          type: 'boolean',
          description: 'Whether body is HTML (default: true)',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'mails_move',
    description: 'Move one or more emails to a different folder. ' +
      'Useful for organizing emails or implementing archive/delete patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email IDs to move',
        },
        targetFolder: {
          type: 'string',
          description: 'Target folder name',
        },
      },
      required: ['mailIds', 'targetFolder'],
    },
  },
  {
    name: 'mails_mark_read',
    description: 'Mark one or more emails as read or unread. ' +
      'BATCH OPERATION: Can mark multiple emails at once (avoids multiple tool calls). ' +
      'Use this to manage email read status efficiently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email IDs to mark as read/unread (supports batch - mark 5 emails in 1 call)',
        },
        read: {
          type: 'boolean',
          description: 'true to mark as read, false to mark as unread',
        },
      },
      required: ['mailIds', 'read'],
    },
  },
  {
    name: 'mails_flag',
    description: 'Flag or unflag one or more emails for follow-up. ' +
      'BATCH OPERATION: Can flag multiple emails at once (avoids multiple tool calls). ' +
      'Flagged emails are marked with a flag icon for easy identification.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email IDs to flag/unflag (supports batch - flag 5 emails in 1 call)',
        },
        flagged: {
          type: 'boolean',
          description: 'true to flag, false to unflag',
        },
      },
      required: ['mailIds', 'flagged'],
    },
  },
  {
    name: 'mails_delete',
    description: 'Delete email(s) by ID - SOFT DELETE by moving to trash folder. ' +
      'Automatically finds the trash folder (Deleted Items, Trash, Bin, etc.) and moves emails there. ' +
      'Emails are not permanently deleted and can be recovered from trash. ' +
      'CRITICAL WORKFLOW: ' +
      '(1) ALWAYS call mails_list FIRST with filters to get current email IDs; ' +
      '(2) THEN call mails_delete with those IDs. ' +
      'WHY: Email IDs change when emails are moved between folders. Listing first ensures you have current IDs. ' +
      'EXAMPLE WORKFLOW: ' +
      'User: "Delete npm emails from gmail folder" → ' +
      'Step 1: Call mails_list({ folder: "gmail Unterordner", fromFilter: "npm" }) → get IDs; ' +
      'Step 2: Call mails_delete({ mailIds: [IDs from step 1] }).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to delete (get these from mails_list first)',
        },
      },
      required: ['mailIds'],
    },
  },

  // === CALENDAR MODULE ===
  {
    name: 'calendars_list',
    description: 'List calendar events with optional date range filtering. ' +
      'DEFAULT BEHAVIOR (no folder specified): Searches across ALL calendar folders. ' +
      'DATE FILTERING: Optionally filter events by start and end dates. ' +
      'EXAMPLES: ' +
      '(1) "show my upcoming events" → omit all optional parameters; ' +
      '(2) "events this week" → provide startDate and endDate; ' +
      '(3) "events from Work calendar" → folder="Work". ' +
      'PRESENTATION: When showing events to users, focus on human-readable fields (summary, location, time). ' +
      'Technical IDs are shown in brackets at the end - only include them if user asks or if needed for a follow-up action.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: {
          type: 'string',
          description: 'Calendar name, owner/name, owner email/name, or folder ID (optional - if omitted, searches ALL calendars)',
        },
        startDate: {
          type: 'string',
          description: 'Start date for filtering in ISO format: YYYY-MM-DDTHH:mm:ss (optional)',
        },
        endDate: {
          type: 'string',
          description: 'End date for filtering in ISO format: YYYY-MM-DDTHH:mm:ss (optional)',
        },
        limit: {
          type: 'number',
          description: 'Max events to return (-1 for all, default: 100)',
          default: 100,
        },
      },
    },
  },
  {
    name: 'calendars_search',
    description: 'Search calendar events using full-text QUICKSEARCH across event title, location, description, etc. ' +
      'Searches all fields simultaneously for matching keywords. ' +
      'USE WHEN: User wants to find events containing specific keywords or phrases. ' +
      'EXAMPLES: ' +
      '(1) "find meeting with John" → {query: "meeting John"}; ' +
      '(2) "search for events about project" → {query: "project"}; ' +
      '(3) "find events at office" → {query: "office"}. ' +
      'PRESENTATION: Focus on human-readable fields when showing results to users. IDs are in brackets - only show if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (searches across title, location, description, etc.)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 10)',
          default: 10,
        },
        folder: {
          type: 'string',
          description: 'OPTIONAL - Calendar name, owner/name, owner email/name, or folder ID. If omitted, searches ALL calendars.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'calendars_create',
    description: 'Create a new calendar event with title, start/end times, location, and optional reminder. ' +
      'Supports all-day events, private events, and recurring events. ' +
      'Use ISO format for dates: YYYY-MM-DDTHH:mm:ss. ' +
      'IMPORTANT FOR ALL-DAY EVENTS: When isAllDay=true, start and end must be THE SAME DATE. ' +
      'Example: Single all-day event on Jan 2 → start="2026-01-02T00:00:00", end="2026-01-02T00:00:00" (same day!). ' +
      'DO NOT use next-day for end date with all-day events in Kerio. ' +
      'RECURRING EVENTS: Use frequency parameter (Daily/Weekly/Monthly/Yearly) to create recurring events. ' +
      'Example: Yearly event on Jan 8 → frequency="Yearly", start="2026-01-08T00:00:00", end="2026-01-08T00:00:00", isAllDay=true',
    inputSchema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description: 'Event title/summary (required)',
        },
        start: {
          type: 'string',
          description: 'Start date/time in ISO format: YYYY-MM-DDTHH:mm:ss (required)',
        },
        end: {
          type: 'string',
          description: 'End date/time in ISO format: YYYY-MM-DDTHH:mm:ss. For all-day events, MUST be same date as start (not next day!)',
        },
        location: {
          type: 'string',
          description: 'Event location (optional)',
        },
        description: {
          type: 'string',
          description: 'Event description/details (optional)',
        },
        folder: {
          type: 'string',
          description: 'Calendar name, owner/name, owner email/name, or folder ID (optional, uses first available calendar; personal calendars are ordered first)',
        },
        reminderMinutes: {
          type: 'number',
          description: 'Minutes before event to remind (optional)',
        },
        isAllDay: {
          type: 'boolean',
          description: 'Whether this is an all-day event. When true, start and end MUST be the SAME date (Kerio-specific behavior)',
        },
        isPrivate: {
          type: 'boolean',
          description: 'Whether this is a private event (optional)',
        },
        frequency: {
          type: 'string',
          description: 'Recurrence frequency: Daily, Weekly, Monthly, or Yearly (optional - omit for one-time events)',
          enum: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
        },
        interval: {
          type: 'number',
          description: 'Recurrence interval, e.g., 2 for "every 2 weeks" (optional, default: 1)',
        },
        recurrenceEndDate: {
          type: 'string',
          description: 'End date for recurrence in ISO format YYYY-MM-DDTHH:mm:ss (optional - omit for never-ending recurrence)',
        },
      },
      required: ['summary', 'start', 'end'],
    },
  },
  {
    name: 'calendars_update',
    description: 'Update an existing calendar event. ' +
      'IMPORTANT: All three IDs (occurrenceId, eventId, folderId) are shown in the output of calendars_list and calendars_search. ' +
      'For recurring events, you can choose to modify just this occurrence, all occurrences, or future occurrences. ' +
      'Use ISO format for dates: YYYY-MM-DDTHH:mm:ss. ' +
      'FOR ALL-DAY EVENTS: When isAllDay=true, start and end must be THE SAME DATE (Kerio-specific).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        occurrenceId: {
          type: 'string',
          description: 'Full occurrence ID (keriostorage://occurrence/...)',
        },
        eventId: {
          type: 'string',
          description: 'Full event ID (keriostorage://event/...)',
        },
        folderId: {
          type: 'string',
          description: 'Full folder ID',
        },
        summary: {
          type: 'string',
          description: 'Updated event title (optional)',
        },
        start: {
          type: 'string',
          description: 'Updated start date/time in ISO format (optional). For all-day events, must match end date',
        },
        end: {
          type: 'string',
          description: 'Updated end date/time in ISO format (optional). For all-day events, must match start date (Kerio-specific)',
        },
        location: {
          type: 'string',
          description: 'Updated location (optional)',
        },
        description: {
          type: 'string',
          description: 'Updated description (optional)',
        },
        reminderMinutes: {
          type: 'number',
          description: 'Updated reminder minutes (optional)',
        },
        modification: {
          type: 'string',
          enum: ['modifyThis', 'modifyAll', 'modifyFuture'],
          description: 'For recurring events: modify this occurrence, all occurrences, or future occurrences',
          default: 'modifyThis',
        },
      },
      required: ['occurrenceId', 'eventId', 'folderId'],
    },
  },
  {
    name: 'calendars_delete',
    description: 'Delete a calendar event (hard delete - permanent). ' +
      'For recurring events, you can choose what to delete: ' +
      '(1) "modifyThis" = delete only this single occurrence; ' +
      '(2) "modifyAllFollowing" = delete this occurrence and all future occurrences; ' +
      '(3) "modifyAll" = delete entire series (all occurrences). ' +
      'DEFAULT: modifyThis (deletes only the single occurrence). ' +
      'IMPORTANT: Get occurrence ID from calendars_list first. ' +
      'WARNING: This is permanent deletion.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        occurrenceId: {
          type: 'string',
          description: 'Full occurrence ID (keriostorage://occurrence/...) from calendars_list',
        },
        modification: {
          type: 'string',
          description: 'What to delete: "modifyThis" (single), "modifyAllFollowing" (this+future), or "modifyAll" (entire series)',
          enum: ['modifyThis', 'modifyAllFollowing', 'modifyAll'],
          default: 'modifyThis',
        },
      },
      required: ['occurrenceId'],
    },
  },

  // === CONTACTS MODULE ===
  {
    name: 'contacts_list',
    description: 'List contacts with filtering. ' +
      'DEFAULT BEHAVIOR (no folder specified): Searches across ALL contact folders. ' +
      'This is the recommended approach for queries like "show my contacts" or "list all contacts". ' +
      'SPECIFIC FOLDER: If you know the exact folder name, you can specify it. ' +
      'EXAMPLES: ' +
      '(1) "show my contacts" → omit folder parameter; ' +
      '(2) "contacts from Work folder" → folder="Work"; ' +
      '(3) If folder name is unknown, call folders_list first. ' +
      'PRESENTATION: Focus on name, email, phone when showing results. IDs are in brackets - only show if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: {
          type: 'string',
          description: 'Folder name to search in. OPTIONAL - if omitted, searches ALL contact folders (recommended)',
        },
        limit: {
          type: 'number',
          description: 'Max contacts to return (-1 for all, default: 100)',
          default: 100,
        },
      },
    },
  },
  {
    name: 'contacts_get',
    description: 'Get a specific contact with full details including all email addresses, phone numbers, and postal addresses. ' +
      'Use this to view complete contact information after listing contacts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactId: {
          type: 'string',
          description: 'Full contact ID (keriostorage://contact/...)',
        },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'contacts_create',
    description: 'Create a new contact with name, email, phone, company, and notes. ' +
      'At minimum, a first name is required. All other fields are optional.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        firstName: {
          type: 'string',
          description: 'Contact first name (required)',
        },
        lastName: {
          type: 'string',
          description: 'Contact last name (optional)',
        },
        email: {
          type: 'string',
          description: 'Primary email address (optional)',
        },
        phone: {
          type: 'string',
          description: 'Primary phone number (optional)',
        },
        company: {
          type: 'string',
          description: 'Company name (optional)',
        },
        notes: {
          type: 'string',
          description: 'Additional notes/comments (optional)',
        },
        folder: {
          type: 'string',
          description: 'Folder name to create contact in (optional, uses first folder)',
        },
      },
      required: ['firstName'],
    },
  },
  {
    name: 'contacts_update',
    description: 'Update an existing contact. ' +
      'You can update name, email, phone, company, or notes. Only provide the fields you want to update.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactId: {
          type: 'string',
          description: 'Full contact ID (keriostorage://contact/...)',
        },
        firstName: {
          type: 'string',
          description: 'Updated first name (optional)',
        },
        lastName: {
          type: 'string',
          description: 'Updated last name (optional)',
        },
        email: {
          type: 'string',
          description: 'Updated primary email address (optional)',
        },
        phone: {
          type: 'string',
          description: 'Updated primary phone number (optional)',
        },
        company: {
          type: 'string',
          description: 'Updated company name (optional)',
        },
        notes: {
          type: 'string',
          description: 'Updated notes/comments (optional)',
        },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'contacts_search',
    description: 'Search contacts across all folders or specific folders. ' +
      'Searches in name, company, email, phone, and notes fields. ' +
      'Fast server-side filtering - no need to fetch all contacts manually.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query text',
        },
        folders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Folder names to search in (optional, searches all contact folders if not specified)',
        },
        searchIn: {
          type: 'string',
          enum: ['name', 'company', 'email', 'phone', 'notes', 'all'],
          description: 'Where to search: name (first/middle/last), company, email addresses, phone numbers, notes, or all fields',
          default: 'all',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (-1 for all)',
          default: -1,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'contacts_delete',
    description: 'Delete a contact permanently (hard delete - cannot be recovered). ' +
      'WARNING: This is permanent deletion. ' +
      'IMPORTANT: Get contact ID from contacts_list first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        contactId: {
          type: 'string',
          description: 'Full contact ID (keriostorage://contact/...) from contacts_list',
        },
      },
      required: ['contactId'],
    },
  },

  // === TASKS MODULE ===
  {
    name: 'tasks_list',
    description: 'List tasks with filtering and sorting. ' +
      'DEFAULT BEHAVIOR (no folder specified): Searches across ALL task folders. ' +
      'This is the recommended approach for queries like "show my tasks" or "list pending tasks". ' +
      'SPECIFIC FOLDER: If you know the exact folder name, you can specify it to search only that folder. ' +
      'EXAMPLES: ' +
      '(1) "show my tasks" → omit folder parameter; ' +
      '(2) "tasks from Work folder" → folder="Work"; ' +
      '(3) If folder name is unknown, call folders_list first. ' +
      'PRESENTATION: Focus on status, summary, due date when showing results. IDs are in brackets - only show if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folder: {
          type: 'string',
          description: 'Folder name to search in. OPTIONAL - if omitted, searches ALL task folders (recommended)',
        },
        limit: {
          type: 'number',
          description: 'Max tasks to return (-1 for all, default: 500)',
          default: 500,
        },
        orderBy: {
          type: 'string',
          enum: ['due', 'summary', 'done'],
          description: 'Sort field',
          default: 'due',
        },
        direction: {
          type: 'string',
          enum: ['Asc', 'Desc'],
          description: 'Sort direction',
          default: 'Asc',
        },
      },
    },
  },
  {
    name: 'tasks_create',
    description: 'Create a new task with optional due date and reminder. ' +
      'Use ISO format for dates (YYYY-MM-DDTHH:mm:ss). ' +
      'Reminder is set relative to due date (e.g., 15 minutes before).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description: 'Task summary/title',
        },
        description: {
          type: 'string',
          description: 'Task description/details (optional)',
        },
        folder: {
          type: 'string',
          description: 'Folder name to create task in (optional, uses first folder)',
        },
        due: {
          type: 'string',
          description: 'Due date in ISO format: YYYY-MM-DDTHH:mm:ss (optional)',
        },
        reminderMinutes: {
          type: 'number',
          description: 'Minutes before due date to remind (optional, requires due date)',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'tasks_complete',
    description: 'Mark a task as complete (sets done to 100%). ' +
      'Use this when a task is finished.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'Full task ID (keriostorage://task/...)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'tasks_update',
    description: 'Update task properties including summary, description, due date, completion percentage, or reminders. ' +
      'Use ISO format for dates (YYYY-MM-DDTHH:mm:ss). ' +
      'Set done to a value between 0-100 to update progress (100 = complete). ' +
      'Reminders can be absolute (specific date/time) or relative (minutes before due date).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'Full task ID (keriostorage://task/...)',
        },
        summary: {
          type: 'string',
          description: 'Updated task summary (optional)',
        },
        description: {
          type: 'string',
          description: 'Updated task description (optional)',
        },
        due: {
          type: 'string',
          description: 'Updated due date in ISO format: YYYY-MM-DDTHH:mm:ss (optional)',
        },
        done: {
          type: 'number',
          description: 'Completion percentage: 0-100 (optional, 100 = complete)',
        },
        reminderDate: {
          type: 'string',
          description: 'Set absolute reminder at specific date/time in ISO format: YYYY-MM-DDTHH:mm:ss (optional)',
        },
        reminderMinutes: {
          type: 'number',
          description: 'Set relative reminder (minutes before due date, e.g., 1440 for 1 day before) (optional)',
        },
        clearReminder: {
          type: 'boolean',
          description: 'Set to true to remove any existing reminder (optional)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'tasks_search',
    description: 'Search tasks across all folders or specific folders. ' +
      'Searches in task summary and description. ' +
      'Fast server-side filtering - no need to fetch all tasks manually.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query text',
        },
        folders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Folder names to search in (optional, searches all task folders if not specified)',
        },
        searchIn: {
          type: 'string',
          enum: ['summary', 'description', 'both'],
          description: 'Where to search: task summary, description, or both',
          default: 'both',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (-1 for all)',
          default: -1,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'tasks_delete',
    description: 'Delete a task permanently (hard delete - cannot be recovered). ' +
      'WARNING: This is permanent deletion, not a move to trash. ' +
      'IMPORTANT: Get task ID from tasks_list first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'Full task ID (keriostorage://task/...) from tasks_list',
        },
      },
      required: ['taskId'],
    },
  },
];

/**
 * Get tool definitions with optional filtering for security.
 *
 * @param enableSend - If false, mails_send tool will be excluded (default: false)
 * @returns Filtered array of tool definitions safe for the given configuration
 */
export function getToolDefinitions(enableSend: boolean = false) {
  if (enableSend) {
    return allToolDefinitions;
  }

  // Filter out mails_send for security
  return allToolDefinitions.filter(tool => tool.name !== 'mails_send');
}

/**
 * Default export for backward compatibility (without mails_send)
 * Use getToolDefinitions(config.enableSend) for conditional inclusion
 */
export const toolDefinitions = getToolDefinitions(false);
