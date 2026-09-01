/**
 * Kerio Connect API Client
 * Handles authentication, session management, and API calls
 */

import { request } from 'undici';
import { PACKAGE_VERSION } from './version.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  SessionLoginParams,
  SessionLoginResult,
  KerioFolder,
  KerioNote,
  KerioTask,
  KerioMail,
  KerioContact,
  KerioOccurrence,
  EmailAddress,
  MailDisplayablePart,
  PhoneNumber,
  ContactEmailAddress,
  PostalAddress,
  ContactUrl,
  EventAttendee,
  EventReminder,
  FoldersGetResult,
  NotesGetResult,
  TasksGetResult,
  MailsGetResult,
  ContactsGetResult,
  OccurrencesGetResult,
  QueryCondition,
  Query,
  KerioConfig,
  FolderInfo,
  SearchResult,
} from './types.js';

interface SharedMailbox {
  mailboxId?: string;
  isLoaded?: boolean;
  folders?: KerioFolder[];
}

interface SharedMailboxResult {
  mailboxes?: SharedMailbox[];
  list?: SharedMailbox[];
}

export class KerioClient {
  private server: string;
  private username: string;
  private password: string;
  private verifySsl: boolean;
  private apiUrl: string;

  private sessionToken: string | null = null;
  private sessionCookie: string | null = null; // SESSION_CONNECT_WEBMAIL cookie
  private requestId = 1;

  constructor(config: KerioConfig) {
    this.server = config.server.replace(/\/$/, ''); // Remove trailing slash
    this.username = config.username;
    this.password = config.password;
    this.verifySsl = config.verifySsl ?? false;

    // Kerio Connect JSON-RPC endpoint
    this.apiUrl = `${this.server}/webmail/api/jsonrpc`;
  }

  /**
   * Generic JSON-RPC request
   */
  private async jsonRpcRequest<T>(
    method: string,
    params: any = {},
    requiresAuth = true
  ): Promise<T> {
    // Ensure authentication if required
    if (requiresAuth && !this.sessionToken) {
      await this.login();
    }

    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };

    // Add authentication headers if we have a session
    if (this.sessionToken && this.sessionCookie) {
      // Cookie header needs the SESSION_CONNECT_WEBMAIL cookie
      headers['Cookie'] = `SESSION_CONNECT_WEBMAIL=${this.sessionCookie}`;
      // X-Token header uses the token from the response body
      headers['X-Token'] = this.sessionToken;
    }

    try {
      const response = await request(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        // Disable SSL verification if configured (for self-signed certs)
        ...(this.verifySsl ? {} : {
          // @ts-ignore - undici specific option
          connect: { rejectUnauthorized: false }
        }),
      });

      const data = (await response.body.json()) as JsonRpcResponse<T>;

      // Extract session token and cookies from login response
      if (method === 'Session.login') {
        // Extract token from response body (this is the X-Token we'll use)
        if (data.result && typeof data.result === 'object') {
          const resultObj = data.result as any;
          if (resultObj.token) {
            this.sessionToken = resultObj.token;
          }
        }

        // Extract SESSION_CONNECT_WEBMAIL cookie
        if (response.headers['set-cookie']) {
          const cookies = Array.isArray(response.headers['set-cookie'])
            ? response.headers['set-cookie']
            : [response.headers['set-cookie']];

          for (const cookie of cookies) {
            const sessionMatch = cookie.match(/SESSION_CONNECT_WEBMAIL=([^;]+)/);
            if (sessionMatch) {
              this.sessionCookie = sessionMatch[1];
            }
          }
        }
      }

      if (data.error) {
        throw new Error(
          `Kerio API Error: ${data.error.message} (code: ${data.error.code})`
        );
      }

      if (!data.result) {
        throw new Error('No result in response');
      }

      // Check for errors in result.errors (Kerio sometimes returns errors here instead of top-level)
      if (typeof data.result === 'object' && data.result !== null) {
        const resultObj = data.result as any;
        if (Array.isArray(resultObj.errors) && resultObj.errors.length > 0) {
          const errorMessages = resultObj.errors.map((err: any) => {
            const msg = err.message || 'Unknown error';
            const code = err.code || 'N/A';
            return `${msg} (code: ${code})`;
          }).join('; ');
          throw new Error(`Kerio API Error: ${errorMessages}`);
        }
      }

      return data.result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Kerio API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Authenticate with Kerio Connect
   */
  private async login(): Promise<void> {
    console.error('[Client] Authenticating...');

    const params: SessionLoginParams = {
      userName: this.username,
      password: this.password,
      application: {
        name: 'Kerio MCP Server',
        vendor: 'MCP',
        version: PACKAGE_VERSION,
      },
    };

    try {
      await this.jsonRpcRequest<SessionLoginResult>('Session.login', params, false);

      if (!this.sessionToken || !this.sessionCookie) {
        throw new Error(
          `Failed to extract session credentials: ` +
          `Token=${this.sessionToken ? 'OK' : 'MISSING'}, ` +
          `Cookie=${this.sessionCookie ? 'OK' : 'MISSING'}`
        );
      }

      console.error('[Client] ✅ Authentication successful');
    } catch (error) {
      console.error('[Client] ❌ Authentication failed');
      if (error instanceof Error) {
        console.error(`[Client] Error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get all note folders dynamically (filters out non-note folders)
   */
  public async getNoteFolders(): Promise<KerioFolder[]> {
    const result = await this.jsonRpcRequest<FoldersGetResult>('Folders.get', {});

    // Filter to only note folders (exclude mail, tasks, contacts, calendar)
    const noteFolders = result.list.filter((folder) => folder.type === 'FNote');

    return noteFolders;
  }

  /**
   * Get notes from specific folder(s) with query options
   */
  public async getNotes(
    folderIds: string[],
    query: Query = {}
  ): Promise<KerioNote[]> {
    const params = {
      query: {
        start: query.start ?? 0,
        limit: query.limit ?? -1, // -1 = all notes
        orderBy: query.orderBy ?? [
          {
            columnName: 'createDate',
            direction: 'Desc',
            caseSensitive: true,
          },
        ],
      },
      folderIds,
    };

    const result = await this.jsonRpcRequest<NotesGetResult>('Notes.get', params);
    return result.list;
  }

  /**
   * Get count of notes in a folder
   */
  public async getNoteCount(folderId: string): Promise<number> {
    const params = {
      query: { start: 0, limit: 0 }, // We only want the count
      folderIds: [folderId],
    };

    const result = await this.jsonRpcRequest<NotesGetResult>('Notes.get', params);
    return result.totalItems;
  }

  /**
   * Search notes across folders
   */
  public async searchNotes(
    searchQuery: string,
    folderIds?: string[],
    searchIn: 'text' | 'subject' | 'both' = 'both',
    limit = -1
  ): Promise<SearchResult> {
    // If no folders specified, search all note folders
    const folders = folderIds ?? (await this.getNoteFolders()).map((f) => f.id);

    // Get ALL notes from target folders (don't apply limit yet - need to search all first)
    const allNotes = await this.getNotes(folders, { limit: -1 });

    // Client-side filtering (Kerio API doesn't support text search)
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = allNotes.filter((note) => {
      const matchSubject = searchIn !== 'text' &&
        note.subject?.toLowerCase().includes(lowerQuery);
      const matchText = searchIn !== 'subject' &&
        note.text?.toLowerCase().includes(lowerQuery);

      return matchSubject || matchText;
    });

    // Apply limit to search results (not to initial fetch)
    const results = limit > 0 ? filtered.slice(0, limit) : filtered;

    return {
      notes: results,
      totalFound: filtered.length, // Total found (before limit)
      searchedFolders: folders,
    };
  }

  /**
   * Search tasks across folders (server-side filtering)
   */
  public async searchTasks(
    searchQuery: string,
    folderIds?: string[],
    searchIn: 'summary' | 'description' | 'both' = 'both',
    limit = -1
  ): Promise<{ tasks: any[]; totalFound: number; searchedFolders: string[] }> {
    // If no folders specified, search all task folders
    const folders = folderIds ?? (await this.getTaskFolders()).map((f) => f.id);

    // Get ALL tasks from target folders (don't apply limit yet - need to search all first)
    const allTasks = await this.getTasks(folders, { limit: -1 });

    // Client-side filtering (Kerio API doesn't support text search)
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = allTasks.filter((task) => {
      const matchSummary = searchIn !== 'description' &&
        task.summary?.toLowerCase().includes(lowerQuery);
      const matchDescription = searchIn !== 'summary' &&
        task.description?.toLowerCase().includes(lowerQuery);

      return matchSummary || matchDescription;
    });

    // Apply limit to search results (not to initial fetch)
    const results = limit > 0 ? filtered.slice(0, limit) : filtered;

    return {
      tasks: results,
      totalFound: filtered.length, // Total found (before limit)
      searchedFolders: folders,
    };
  }

  /**
   * Create a new note
   */
  public async createNote(
    folderId: string,
    text: string,
    subject?: string,
    color?: string
  ): Promise<void> {
    // Auto-generate subject from first line if not provided
    const noteSubject = subject || text.split('\n')[0].substring(0, 100);

    const params = {
      notes: [
        {
          folderId,
          subject: noteSubject,
          text,
          ...(color && { color }),
        },
      ],
    };

    await this.jsonRpcRequest('Notes.create', params);
  }

  /**
   * Move note to different folder (soft delete pattern)
   */
  public async moveNote(noteId: string, targetFolderId: string): Promise<void> {
    const params = {
      notes: [
        {
          id: noteId,
          folderId: targetFolderId,
        },
      ],
    };

    await this.jsonRpcRequest('Notes.set', params);
  }

  /**
   * Remove note permanently (hard delete)
   */
  public async removeNote(noteId: string): Promise<void> {
    const params = {
      ids: [noteId],
    };

    await this.jsonRpcRequest('Notes.remove', params);
  }

  /**
   * Update note content (subject and/or text)
   */
  public async updateNote(
    noteId: string,
    subject?: string,
    text?: string
  ): Promise<void> {
    const updateData: any = { id: noteId };

    if (subject !== undefined) {
      updateData.subject = subject;
    }

    if (text !== undefined) {
      updateData.text = text;
      // Auto-generate subject from first line if text provided but subject not
      if (subject === undefined) {
        updateData.subject = text.split('\n')[0].substring(0, 100);
      }
    }

    const params = {
      notes: [updateData],
    };

    await this.jsonRpcRequest('Notes.set', params);
  }

  /**
   * Create a new folder
   */
  public async createFolder(
    name: string,
    type: 'FNote' | 'FTask' | 'FContact' | 'FCalendar' | 'FMail' = 'FNote',
    parentId?: string
  ): Promise<void> {
    const folderData: any = {
      name,
      type,
      ...(parentId && { parentId }),
    };

    // Mail folders require additional fields
    if (type === 'FMail') {
      if (!parentId) {
        throw new Error('parentId is required for mail folders');
      }
      folderData.id = '';
      folderData.placeType = 'FPlaceMailbox';
      folderData.access = 'FAccessAdmin';
      folderData.ownerName = '';
      folderData.subType = 'FSubNone';
      folderData.checked = false;
      folderData.color = '';
    }

    const params = {
      folders: [folderData],
    };

    await this.jsonRpcRequest('Folders.create', params);
  }

  /**
   * Get folder information with note counts
   */
  public async getFolderInfo(): Promise<FolderInfo[]> {
    const folders = await this.getNoteFolders();

    // Get counts in parallel
    const counts = await Promise.all(
      folders.map((folder) => this.getNoteCount(folder.id))
    );

    return folders.map((folder, index) => ({
      id: folder.id,
      name: folder.name,
      noteCount: counts[index],
      type: folder.type,
    }));
  }

  /**
   * Get all folders of all types
   */
  public async getAllFolders(): Promise<KerioFolder[]> {
    const result = await this.jsonRpcRequest<FoldersGetResult>('Folders.get', {});
    return result.list;
  }

  // ============================================================================
  // TASKS MODULE METHODS
  // ============================================================================

  /**
   * Get task folders (filters Folders.get to FTask type)
   */
  public async getTaskFolders(): Promise<KerioFolder[]> {
    const result = await this.jsonRpcRequest<FoldersGetResult>('Folders.get', {});
    return result.list.filter((folder) => folder.type === 'FTask');
  }

  /**
   * Get tasks from specific folder(s)
   */
  public async getTasks(
    folderIds: string[],
    query: Query = {}
  ): Promise<KerioTask[]> {
    const params = {
      query: {
        start: query.start ?? 0,
        limit: query.limit ?? 500,
        orderBy: query.orderBy ?? [
          {
            columnName: 'due',
            direction: 'Asc',
            caseSensitive: true,
          },
        ],
      },
      folderIds,
    };

    const result = await this.jsonRpcRequest<TasksGetResult>('Tasks.get', params);
    return result.list;
  }

  /**
   * Create a new task
   */
  public async createTask(
    folderId: string,
    summary: string,
    description?: string,
    due?: string,
    reminder?: { type: 'ReminderAbsolute' | 'ReminderRelative'; date?: string; minutesBeforeStart?: number }
  ): Promise<void> {
    const params = {
      tasks: [
        {
          folderId,
          summary,
          description: description ?? '',
          due: due ?? '',
          done: 0,
          reminder: reminder ? {
            isSet: true,
            ...reminder
          } : undefined,
        },
      ],
    };

    await this.jsonRpcRequest('Tasks.create', params);
  }

  /**
   * Update task (can be used to mark complete with done=100)
   */
  public async updateTask(
    taskId: string,
    updates: {
      summary?: string;
      description?: string;
      due?: string;
      done?: number;
    }
  ): Promise<void> {
    const params = {
      tasks: [
        {
          id: taskId,
          ...updates,
        },
      ],
    };

    await this.jsonRpcRequest('Tasks.set', params);
  }

  // ============================================================================
  // MAIL MODULE METHODS
  // ============================================================================

  /**
   * Get mail folders (filters Folders.get to FMail type)
   */
  public async getMailFolders(): Promise<KerioFolder[]> {
    const result = await this.jsonRpcRequest<FoldersGetResult>('Folders.get', {});
    return result.list.filter((folder) => folder.type === 'FMail');
  }

  /**
   * Get emails from specific folder(s)
   */
  public async getMails(
    folderIds: string[],
    query: Query = {},
    includeContent: boolean = false
  ): Promise<KerioMail[]> {
    const fields = [
      'id', 'from', 'to', 'cc', 'bcc', 'subject', 'receiveDate',
      'sendDate', 'modifiedDate', 'isSeen', 'isJunk', 'isAnswered',
      'isForwarded', 'isFlagged', 'isReadOnly', 'isDraft',
      'hasAttachment', 'priority', 'size', 'folderId'
    ];

    // Include email body content if requested (for mails_get)
    if (includeContent) {
      fields.push('displayableParts');
    }

    const params: any = {
      query: {
        fields,
        start: query.start ?? 0,
        limit: query.limit ?? 50,
        orderBy: query.orderBy ?? [{
          columnName: 'receiveDate',
          direction: 'Desc',
          caseSensitive: true,
        }],
      },
      folderIds,
    };

    // Add conditions if provided (for search)
    if (query.conditions && query.conditions.length > 0) {
      params.query.conditions = query.conditions;
      params.query.combining = query.combining ?? 'And';
    }

    const result = await this.jsonRpcRequest<MailsGetResult>('Mails.get', params);
    return result.list;
  }

  /**
   * Search emails using QUICKSEARCH (full-text search across subject, from, to, body, etc.)
   */
  public async searchMails(
    searchQuery: string,
    options?: {
      folderIds?: string[];
      limit?: number;
    }
  ): Promise<KerioMail[]> {
    // Get all mail folders if not specified
    const folderIds = options?.folderIds ?? (await this.getMailFolders()).map((f) => f.id);

    return this.getMails(folderIds, {
      limit: options?.limit ?? 50,
      conditions: [
        {
          fieldName: 'QUICKSEARCH',
          comparator: 'Like',
          value: searchQuery,
        },
      ],
      combining: 'And',
    });
  }

  /**
   * Get specific email by ID with full content
   *
   * Mail ID format: keriostorage://mail/{domain}/{user}/{folder_uuid}/{mail_id}
   * Example: keriostorage://mail/xceptus.de/ni/7a8cfe21-59ba-4148-8bc4-e46287604075/74860
   *
   * Split result: ['keriostorage:', '', 'mail', 'xceptus.de', 'ni', '7a8cfe21...', '74860']
   * Indices:       [0]             [1]  [2]     [3]          [4]   [5]              [6]
   */
  public async getMailById(mailId: string): Promise<KerioMail> {
    // Extract folder ID from mail ID
    // Mail: keriostorage://mail/domain/user/folder_uuid/mail_id
    // Folder: keriostorage://folder/domain/user/folder_uuid
    const mailParts = mailId.split('/');

    // Need at least 7 parts: ['keriostorage:', '', 'mail', domain, user, folder_uuid, mail_id]
    if (mailParts.length < 7) {
      throw new Error(
        `Invalid mail ID format: ${mailId}\n` +
        `Expected: keriostorage://mail/{domain}/{user}/{folder_uuid}/{mail_id}\n` +
        `Got ${mailParts.length} parts, need at least 7`
      );
    }

    // Correct indexing (accounting for empty string at index 1 after 'keriostorage:')
    const domain = mailParts[3];
    const user = mailParts[4];
    const folderUuid = mailParts[5];

    const folderId = `keriostorage://folder/${domain}/${user}/${folderUuid}`;

    console.error(`[Client] Fetching email ${mailId} from folder ${folderId}`);

    // Get all mails from this folder with content, then filter by ID
    const mails = await this.getMails(
      [folderId],
      { limit: 500 }, // Increase limit to find the specific email
      true // Include content
    );

    const mail = mails.find((m) => m.id === mailId);
    if (!mail) {
      throw new Error(
        `Email not found: ${mailId}\n` +
        `Searched in folder: ${folderId}\n` +
        `Found ${mails.length} emails in folder, but none matched the ID.`
      );
    }

    return mail;
  }

  /**
   * Send an email
   */
  public async sendMail(
    to: EmailAddress[],
    subject: string,
    content: string,
    contentType: 'ctTextPlain' | 'ctTextHtml' = 'ctTextHtml',
    options?: {
      cc?: EmailAddress[];
      bcc?: EmailAddress[];
      priority?: 'Low' | 'Normal' | 'High';
      attachments?: any[];
    }
  ): Promise<void> {
    // Get sender info from username
    const from: EmailAddress = {
      address: this.username,
      name: '',
    };

    const params = {
      mails: [{
        send: true,
        subject,
        from,
        to,
        cc: options?.cc ?? [],
        bcc: options?.bcc ?? [],
        replyTo: [from],
        displayableParts: [{
          contentType,
          content,
        }],
        priority: options?.priority ?? 'Normal',
        attachments: options?.attachments ?? [],
        encrypt: false,
        sign: false,
        requestDSN: false,
      }],
    };

    await this.jsonRpcRequest('Mails.create', params);
  }

  /**
   * Save email as draft
   */
  public async saveDraft(
    to: EmailAddress[],
    subject: string,
    content: string,
    contentType: 'ctTextPlain' | 'ctTextHtml' = 'ctTextHtml',
    options?: {
      cc?: EmailAddress[];
      bcc?: EmailAddress[];
      priority?: 'Low' | 'Normal' | 'High';
    }
  ): Promise<void> {
    const from: EmailAddress = {
      address: this.username,
      name: '',
    };

    const params = {
      mails: [{
        send: false, // Save as draft
        subject,
        from,
        to,
        cc: options?.cc ?? [],
        bcc: options?.bcc ?? [],
        replyTo: [from],
        displayableParts: [{
          contentType,
          content,
        }],
        priority: options?.priority ?? 'Normal',
        attachments: [],
        encrypt: false,
        sign: false,
        requestDSN: false,
      }],
    };

    await this.jsonRpcRequest('Mails.create', params);
  }

  /**
   * Move email to different folder
   */
  public async moveMail(mailIds: string[], targetFolderId: string): Promise<void> {
    const params = {
      ids: mailIds,
      folder: targetFolderId,
    };

    console.error('[Client] Moving emails:', JSON.stringify({
      count: mailIds.length,
      targetFolder: targetFolderId,
      mailIds: mailIds
    }, null, 2));

    await this.jsonRpcRequest('Mails.move', params);
    console.error('[Client] Emails moved successfully');
  }

  /**
   * Update email properties (mark as read/unread, flag, etc.) - supports batch operations
   */
  public async setMailProperties(
    mailIds: string | string[],
    properties: {
      isSeen?: boolean;
      isFlagged?: boolean;
      isJunk?: boolean;
    }
  ): Promise<void> {
    // Ensure mailIds is an array
    const ids = Array.isArray(mailIds) ? mailIds : [mailIds];

    const params = {
      mails: ids.map(id => ({
        id,
        ...properties,
      })),
    };

    console.error('[Client] Setting mail properties:', JSON.stringify(params, null, 2));
    await this.jsonRpcRequest('Mails.set', params);
    console.error('[Client] Mail properties updated successfully');
  }

  /**
   * Update a draft email (edit subject, body, recipients, etc.)
   */
  public async updateDraft(
    draftId: string,
    updates: {
      subject?: string;
      body?: string;
      contentType?: 'ctTextHtml' | 'ctTextPlain';
      to?: EmailAddress[];
      cc?: EmailAddress[];
      bcc?: EmailAddress[];
      priority?: 'Low' | 'Normal' | 'High';
    }
  ): Promise<void> {
    // First, get the current draft to preserve fields not being updated
    const currentDraft = await this.getMailById(draftId);

    // Build the updated mail object
    const updatedMail: any = {
      id: draftId,
      folderId: currentDraft.folderId,
      send: false,
      isDraft: true,
    };

    // Update fields if provided
    if (updates.subject !== undefined) {
      updatedMail.subject = updates.subject;
    } else if (currentDraft.subject) {
      updatedMail.subject = currentDraft.subject;
    }

    if (updates.to !== undefined) {
      updatedMail.to = updates.to;
    } else if (currentDraft.to) {
      updatedMail.to = currentDraft.to;
    }

    if (updates.cc !== undefined) {
      updatedMail.cc = updates.cc;
    } else if (currentDraft.cc) {
      updatedMail.cc = currentDraft.cc;
    }

    if (updates.bcc !== undefined) {
      updatedMail.bcc = updates.bcc;
    } else if (currentDraft.bcc) {
      updatedMail.bcc = currentDraft.bcc;
    }

    if (updates.priority !== undefined) {
      updatedMail.priority = updates.priority;
    } else if (currentDraft.priority) {
      updatedMail.priority = currentDraft.priority;
    } else {
      updatedMail.priority = 'Normal';
    }

    // Update body and content type
    if (updates.body !== undefined || updates.contentType !== undefined) {
      const contentType = updates.contentType ||
        (currentDraft.displayableParts?.[0]?.contentType || 'ctTextHtml');
      const body = updates.body !== undefined ? updates.body :
        (currentDraft.displayableParts?.[0]?.content || '');

      updatedMail.displayableParts = [{
        contentType,
        content: body,
      }];
    } else if (currentDraft.displayableParts) {
      updatedMail.displayableParts = currentDraft.displayableParts;
    }

    // Preserve other required fields
    updatedMail.from = currentDraft.from;
    updatedMail.replyTo = currentDraft.replyTo || [currentDraft.from];
    updatedMail.headers = currentDraft.headers || [];
    updatedMail.attachments = currentDraft.attachments || [];

    const params = {
      mails: [updatedMail],
    };

    console.error('[Client] Updating draft:', JSON.stringify(params, null, 2));
    await this.jsonRpcRequest('Mails.set', params);
    console.error('[Client] Draft updated successfully');
  }

  // ============================================================================
  // CONTACTS MODULE METHODS
  // ============================================================================

  /**
   * Get contact folders (filters Folders.get to FContact type)
   */
  public async getContactFolders(): Promise<KerioFolder[]> {
    const result = await this.jsonRpcRequest<FoldersGetResult>('Folders.get', {});
    return result.list.filter((folder) => folder.type === 'FContact');
  }

  /**
   * Get contacts from specific folder(s)
   */
  public async getContacts(
    folderIds: string[],
    query: Query = {}
  ): Promise<KerioContact[]> {
    const params = {
      folderIds,
      query: {
        start: query.start ?? 0,
        limit: query.limit ?? 100,
        fields: [
          'id',
          'folderId',
          'watermark',
          'type',
          'commonName',
          'titleAfter',
          'titleBefore',
          'firstName',
          'middleName',
          'surName',
          'nickName',
          'emailAddresses',
          'phoneNumbers',
          'photo',
          'companyName',
          'comment',
          'postalAddresses',
          'urls',
        ],
      },
    };

    const result = await this.jsonRpcRequest<ContactsGetResult>('Contacts.getFromCache', params);
    return result.list;
  }

  /**
   * Search contacts across folders (server-side filtering)
   */
  public async searchContacts(
    searchQuery: string,
    folderIds?: string[],
    searchIn: 'name' | 'company' | 'email' | 'phone' | 'notes' | 'all' = 'all',
    limit = -1
  ): Promise<{ contacts: any[]; totalFound: number; searchedFolders: string[] }> {
    // If no folders specified, search all contact folders
    const folders = folderIds ?? (await this.getContactFolders()).map((f) => f.id);

    // Get ALL contacts from target folders (don't apply limit yet - need to search all first)
    const allContacts = await this.getContacts(folders, { limit: -1 });

    // Client-side filtering (Kerio API doesn't support text search)
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = allContacts.filter((contact) => {
      const matchName = (searchIn === 'name' || searchIn === 'all') &&
        (contact.commonName?.toLowerCase().includes(lowerQuery) ||
         contact.firstName?.toLowerCase().includes(lowerQuery) ||
         contact.middleName?.toLowerCase().includes(lowerQuery) ||
         contact.surName?.toLowerCase().includes(lowerQuery));

      const matchCompany = (searchIn === 'company' || searchIn === 'all') &&
        contact.companyName?.toLowerCase().includes(lowerQuery);

      const matchEmail = (searchIn === 'email' || searchIn === 'all') &&
        contact.emailAddresses?.some((e: any) => e.address?.toLowerCase().includes(lowerQuery));

      const matchPhone = (searchIn === 'phone' || searchIn === 'all') &&
        contact.phoneNumbers?.some((p: any) => p.number?.toLowerCase().includes(lowerQuery));

      const matchNotes = (searchIn === 'notes' || searchIn === 'all') &&
        contact.comment?.toLowerCase().includes(lowerQuery);

      return matchName || matchCompany || matchEmail || matchPhone || matchNotes;
    });

    // Apply limit to search results (not to initial fetch)
    const results = limit > 0 ? filtered.slice(0, limit) : filtered;

    return {
      contacts: results,
      totalFound: filtered.length, // Total found (before limit)
      searchedFolders: folders,
    };
  }

  /**
   * Get specific contact by ID
   */
  public async getContactById(contactId: string): Promise<KerioContact> {
    const params = {
      ids: [contactId],
    };

    const result = await this.jsonRpcRequest<{ errors: any[]; result: KerioContact[] }>(
      'Contacts.getById',
      params
    );

    if (!result.result || result.result.length === 0) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    return result.result[0];
  }

  /**
   * Create a new contact
   */
  public async createContact(
    folderId: string,
    commonName: string,
    options?: {
      firstName?: string;
      middleName?: string;
      surName?: string;
      phoneNumbers?: PhoneNumber[];
      emailAddresses?: ContactEmailAddress[];
      postalAddresses?: PostalAddress[];
      urls?: ContactUrl[];
      companyName?: string;
      comment?: string;
    }
  ): Promise<void> {
    const params = {
      contacts: [{
        folderId,
        watermark: 0,
        commonName,
        firstName: options?.firstName,
        middleName: options?.middleName,
        surName: options?.surName,
        phoneNumbers: options?.phoneNumbers ?? [],
        emailAddresses: options?.emailAddresses ?? [],
        postalAddresses: options?.postalAddresses ?? [],
        urls: options?.urls ?? [],
        companyName: options?.companyName,
        comment: options?.comment,
        photo: {},
      }],
    };

    await this.jsonRpcRequest('Contacts.create', params);
  }

  /**
   * Update an existing contact
   */
  public async updateContact(
    contactId: string,
    updates: {
      commonName?: string;
      firstName?: string;
      middleName?: string;
      surName?: string;
      phoneNumbers?: PhoneNumber[];
      emailAddresses?: ContactEmailAddress[];
      postalAddresses?: PostalAddress[];
      urls?: ContactUrl[];
      companyName?: string;
      comment?: string;
    }
  ): Promise<void> {
    const params = {
      contacts: [{
        id: contactId,
        ...updates,
      }],
    };

    await this.jsonRpcRequest('Contacts.set', params);
  }

  // ============================================================================
  // CALENDAR MODULE METHODS
  // ============================================================================

  /**
   * Get all accessible calendar folders, including shared and public folders.
   */
  public async getCalendarFolders(): Promise<KerioFolder[]> {
    const own = await this.jsonRpcRequest<FoldersGetResult>('Folders.get', {});
    const [shared, publicFolders] = await Promise.all([
      this.jsonRpcRequest<SharedMailboxResult>('Folders.getSharedMailboxList', {})
        .catch((error): SharedMailboxResult => {
          console.error('[Client] Unable to load shared mailboxes:', error);
          return { mailboxes: [] };
        }),
      this.jsonRpcRequest<FoldersGetResult>('Folders.getPublic', {})
        .catch((error): FoldersGetResult => {
          console.error('[Client] Unable to load public folders:', error);
          return { list: [] };
        }),
    ]);
    const mailboxes = shared.mailboxes ?? shared.list ?? [];
    const loaded = mailboxes.flatMap(({ folders = [], isLoaded = true }) =>
      isLoaded ? folders : []
    );
    const unloaded = await Promise.all(mailboxes
      .filter(({ isLoaded, mailboxId }) => isLoaded === false && mailboxId)
      .map(({ mailboxId }) => this.jsonRpcRequest<FoldersGetResult>(
        'Folders.getShared', { mailboxId }
      ).catch((error): FoldersGetResult => {
        console.error(`[Client] Unable to load shared mailbox ${mailboxId}:`, error);
        return { list: [] };
      })));
    const folders = [
      ...own.list,
      ...loaded,
      ...unloaded.flatMap(({ list }) => list),
      ...publicFolders.list,
    ].filter((folder) => folder.type === 'FCalendar');
    return [...new Map(folders.map((folder) => [folder.id, folder])).values()];
  }

  /**
   * Get occurrences (events) from specific folder(s) with optional date range filtering
   */
  public async getOccurrences(
    folderIds: string[],
    options?: {
      startDate?: string; // YYYYMMDDTHHmmss+ZZZZ
      endDate?: string; // YYYYMMDDTHHmmss+ZZZZ
      limit?: number;
    }
  ): Promise<KerioOccurrence[]> {
    const conditions: QueryCondition[] = [];

    if (options?.startDate) {
      conditions.push({
        fieldName: 'start',
        comparator: 'GreaterEq',
        value: options.startDate,
      });
    }

    if (options?.endDate) {
      conditions.push({
        fieldName: 'end',
        comparator: 'LessThan',
        value: options.endDate,
      });
    }

    const params = {
      query: {
        fields: [
          'id', 'eventId', 'folderId', 'watermark', 'access', 'summary', 'location',
          'description', 'label', 'categories', 'start', 'end', 'travelMinutes',
          'freeBusy', 'isPrivate', 'isAllDay', 'priority', 'rule', 'attendees',
          'reminder', 'isException', 'hasReminder', 'isRecurrent', 'isCancelled',
          'seqNumber', 'modification'
        ],
        start: 0,
        limit: options?.limit ?? -1,
        combining: 'And' as const,
        conditions: conditions.length > 0 ? conditions : undefined,
      },
      folderIds,
    };

    const result = await this.jsonRpcRequest<OccurrencesGetResult>('Occurrences.get', params);
    return result.list;
  }

  /**
   * Search calendar events using QUICKSEARCH (full-text search across summary, location, description, etc.)
   */
  public async searchCalendar(
    searchQuery: string,
    options?: {
      folderIds?: string[];
      limit?: number;
    }
  ): Promise<KerioOccurrence[]> {
    // Get all calendar folders if not specified
    const folderIds = options?.folderIds ?? (await this.getCalendarFolders()).map((f) => f.id);

    // Generate current timestamp in YYYYMMDDTHHmmss+ZZZZ format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timezoneOffset = -now.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
    const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
    const offsetSign = timezoneOffset >= 0 ? '+' : '-';
    const searchTime = `${year}${month}${day}T${hours}${minutes}${seconds}${offsetSign}${offsetHours}${offsetMinutes}`;

    const params = {
      query: {
        fields: [
          'id', 'folderId', 'watermark', 'access', 'summary', 'location',
          'description', 'label', 'categories', 'start', 'end', 'travelMinutes',
          'freeBusy', 'isPrivate', 'isAllDay', 'priority', 'rule', 'attendees',
          'reminder', 'isCancelled'
        ],
        start: 0,
        limit: options?.limit ?? 10,
        combining: 'And' as const,
        conditions: [
          {
            fieldName: 'searchTime',
            comparator: 'Like' as const,
            value: searchTime,
          },
          {
            fieldName: 'QUICKSEARCH',
            comparator: 'Like' as const,
            value: searchQuery,
          },
        ],
      },
      folderIds,
    };

    const result = await this.jsonRpcRequest<OccurrencesGetResult>('Occurrences.get', params);
    return result.list;
  }

  /**
   * Create a new calendar event
   */
  public async createEvent(
    folderId: string,
    summary: string,
    start: string, // YYYYMMDDTHHmmss+ZZZZ
    end: string, // YYYYMMDDTHHmmss+ZZZZ
    options?: {
      location?: string;
      description?: string;
      attendees?: EventAttendee[];
      reminderMinutes?: number;
      isAllDay?: boolean;
      isPrivate?: boolean;
      recurrence?: {
        frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
        interval?: number;
        endDate?: string; // YYYYMMDDTHHmmss+ZZZZ
        neverEnds?: boolean;
      };
    }
  ): Promise<void> {
    // Build reminder if specified
    let reminder: EventReminder | undefined;
    if (options?.reminderMinutes !== undefined) {
      reminder = {
        isSet: true,
        type: 'ReminderRelative',
        minutesBeforeStart: options.reminderMinutes,
      };
    }

    // Build recurrence rule if specified
    let rule: any;
    if (options?.recurrence) {
      rule = {
        isSet: true,
        frequency: options.recurrence.frequency,
        endBy: {
          date: options.recurrence.endDate ?? '',
          type: options.recurrence.neverEnds !== false ? 'ByRecurrenceNever' : 'ByRecurrenceDate',
        },
        preciseBy: {
          byDay: [],
          byInterval: options.recurrence.interval ?? 1,
          byMonth: [],
          byMonthDay: [],
          byPosition: [],
        },
      };
    } else {
      rule = { isSet: false };
    }

    const params = {
      events: [{
        folderId,
        summary,
        location: options?.location ?? '',
        description: options?.description ?? '',
        label: 'None' as const,
        access: 'EAccessCreator' as const,
        attendees: options?.attendees ?? [],
        freeBusy: 'Busy' as const,
        isPrivate: options?.isPrivate ?? false,
        isAllDay: options?.isAllDay ?? false,
        priority: 'Normal' as const,
        start,
        end,
        isCancelled: false,
        travelMinutes: 0,
        watermark: 0,
        reminder: reminder ?? { isSet: false },
        rule,
      }],
    };

    await this.jsonRpcRequest('Events.create', params);
  }

  /**
   * Update an existing occurrence
   */
  public async updateOccurrence(
    occurrenceId: string,
    eventId: string,
    folderId: string,
    updates: {
      summary?: string;
      location?: string;
      description?: string;
      start?: string;
      end?: string;
      attendees?: EventAttendee[];
      reminderMinutes?: number;
      modification?: 'modifyThis' | 'modifyAll' | 'modifyFuture';
    }
  ): Promise<void> {
    // Build reminder if specified
    let reminder: EventReminder | undefined;
    if (updates.reminderMinutes !== undefined) {
      reminder = {
        isSet: true,
        type: 'ReminderRelative',
        minutesBeforeStart: updates.reminderMinutes,
      };
    }

    const params = {
      occurrences: [{
        id: occurrenceId,
        eventId,
        folderId,
        summary: updates.summary,
        location: updates.location,
        description: updates.description,
        start: updates.start,
        end: updates.end,
        attendees: updates.attendees,
        modification: updates.modification ?? 'modifyThis',
        reminder,
      }],
    };

    await this.jsonRpcRequest('Occurrences.set', params);
  }

  /**
   * Delete a calendar occurrence (event)
   * For recurring events, specify modification type:
   * - modifyThis: delete only this occurrence
   * - modifyAllFollowing: delete this and all future occurrences
   * - modifyAll: delete all occurrences (entire series)
   */
  public async removeOccurrence(
    occurrenceId: string,
    modification: 'modifyThis' | 'modifyAllFollowing' | 'modifyAll' = 'modifyThis'
  ): Promise<void> {
    const params = {
      occurrences: [{
        id: occurrenceId,
        modification,
      }],
    };

    await this.jsonRpcRequest('Occurrences.remove', params);
  }

  /**
   * Delete a task
   */
  public async removeTask(taskId: string): Promise<void> {
    const params = {
      ids: [taskId],
    };

    await this.jsonRpcRequest('Tasks.remove', params);
  }

  /**
   * Delete a contact
   */
  public async removeContact(contactId: string): Promise<void> {
    const params = {
      ids: [contactId],
    };

    await this.jsonRpcRequest('Contacts.remove', params);
  }

  /**
   * Ensure client is authenticated
   */
  public async ensureAuthenticated(): Promise<void> {
    if (!this.sessionToken) {
      await this.login();
    }
  }
}
