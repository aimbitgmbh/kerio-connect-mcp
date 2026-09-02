#!/usr/bin/env node

/**
 * Kerio Connect MCP Server
 * Provides programmatic access to Kerio Connect via Model Context Protocol
 */

// Load environment variables from .env file (for local development)
// Only load if env vars are not already set (to avoid stdout pollution in MCP clients)
import { config as dotenvConfig } from 'dotenv';
if (!process.env.KERIO_SERVER || !process.env.KERIO_USERNAME) {
  dotenvConfig({ debug: false }); // Only for local dev
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { KerioClient } from './client.js';
import { PACKAGE_VERSION } from './version.js';
import { normalizeToolArguments } from './tool-arguments.js';
import {
  getToolDefinitions,
  notesList,
  notesSearch,
  notesCount,
  notesCreate,
  notesMove,
  notesUpdate,
  notesDelete,
  foldersList,
  foldersCreate,
  tasksList,
  tasksCreate,
  tasksComplete,
  tasksUpdate,
  tasksDelete,
  tasksSearch,
  mailsList,
  mailsGet,
  mailsShowRecent,
  mailsSearch,
  mailsSend,
  mailsSaveDraft,
  mailsUpdateDraft,
  mailsMove,
  mailsMarkRead,
  mailsFlag,
  mailsDelete,
  contactsList,
  contactsGet,
  contactsCreate,
  contactsUpdate,
  contactsDelete,
  contactsSearch,
  calendarsList,
  calendarsSearch,
  calendarsCreate,
  calendarsUpdate,
  calendarsDelete,
} from './tools.js';

const toolDefinitions = getToolDefinitions(config.enableSend);

// Initialize Kerio client
const client = new KerioClient(config.toKerioConfig());

// Initialize MCP server
const server = new Server(
  {
    name: 'kerio-connect-mcp',
    version: PACKAGE_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolDefinitions,
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Ensure authenticated before any operation
    await client.ensureAuthenticated();

    const toolDefinition = toolDefinitions.find((tool) => tool.name === request.params.name);
    const args = normalizeToolArguments(
      request.params.arguments ?? {},
      toolDefinition?.inputSchema
    );

    let result: string;

    switch (request.params.name) {
      // Shared/General Tools
      case 'folders_list':
        result = await foldersList(client, args);
        break;

      case 'folders_create':
        result = await foldersCreate(client, args);
        break;

      // Notes Module
      case 'notes_list':
        result = await notesList(client, args);
        break;

      case 'notes_search':
        result = await notesSearch(client, args);
        break;

      case 'notes_count':
        result = await notesCount(client, args);
        break;

      case 'notes_create':
        result = await notesCreate(client, args);
        break;

      case 'notes_move':
        result = await notesMove(client, args);
        break;

      case 'notes_update':
        result = await notesUpdate(client, args);
        break;

      case 'notes_delete':
        result = await notesDelete(client, args);
        break;

      // Tasks Module
      case 'tasks_list':
        result = await tasksList(client, args);
        break;

      case 'tasks_create':
        result = await tasksCreate(client, args);
        break;

      case 'tasks_complete':
        result = await tasksComplete(client, args);
        break;

      case 'tasks_update':
        result = await tasksUpdate(client, args);
        break;

      case 'tasks_delete':
        result = await tasksDelete(client, args);
        break;

      case 'tasks_search':
        result = await tasksSearch(client, args);
        break;

      // Mail Module
      case 'mails_list':
        result = await mailsList(client, args);
        break;

      case 'mails_get':
        result = await mailsGet(client, args);
        break;

      case 'mails_show_recent':
        result = await mailsShowRecent(client, args);
        break;

      case 'mails_search':
        result = await mailsSearch(client, args);
        break;

      case 'mails_send':
        result = await mailsSend(client, args);
        break;

      case 'mails_save_draft':
        result = await mailsSaveDraft(client, args);
        break;

      case 'mails_update_draft':
        result = await mailsUpdateDraft(client, args);
        break;

      case 'mails_move':
        result = await mailsMove(client, args);
        break;

      case 'mails_mark_read':
        result = await mailsMarkRead(client, args);
        break;

      case 'mails_flag':
        result = await mailsFlag(client, args);
        break;

      case 'mails_delete':
        result = await mailsDelete(client, args);
        break;

      // Contacts Module
      case 'contacts_list':
        result = await contactsList(client, args);
        break;

      case 'contacts_get':
        result = await contactsGet(client, args);
        break;

      case 'contacts_create':
        result = await contactsCreate(client, args);
        break;

      case 'contacts_update':
        result = await contactsUpdate(client, args);
        break;

      case 'contacts_delete':
        result = await contactsDelete(client, args);
        break;

      case 'contacts_search':
        result = await contactsSearch(client, args);
        break;

      // Calendars Module
      case 'calendars_list':
        result = await calendarsList(client, args);
        break;

      case 'calendars_search':
        result = await calendarsSearch(client, args);
        break;

      case 'calendars_create':
        result = await calendarsCreate(client, args);
        break;

      case 'calendars_update':
        result = await calendarsUpdate(client, args);
        break;

      case 'calendars_delete':
        result = await calendarsDelete(client, args);
        break;

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * List available resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    await client.ensureAuthenticated();
    const folderInfo = await client.getFolderInfo();

    const resources = [
      {
        uri: 'kerio://folders',
        name: 'Available Folders',
        description: 'List of all note folders with counts',
        mimeType: 'text/plain',
      },
      ...folderInfo.map((folder) => ({
        uri: `kerio://notes/${encodeURIComponent(folder.name)}`,
        name: `Notes in ${folder.name}`,
        description: `All notes from the "${folder.name}" folder (${folder.noteCount} notes)`,
        mimeType: 'text/plain',
      })),
    ];

    return { resources };
  } catch (error) {
    console.error('[Server] Error listing resources:', error);
    return { resources: [] };
  }
});

/**
 * Read resource content
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    await client.ensureAuthenticated();

    const uri = request.params.uri;

    // Handle kerio://folders
    if (uri === 'kerio://folders') {
      const folderInfo = await client.getFolderInfo();

      const content = [
        'Available Note Folders:',
        '='.repeat(50),
        ...folderInfo.map((f) => [
          `Name: ${f.name}`,
          `ID: ${f.id}`,
          `Notes: ${f.noteCount}`,
          '',
        ].join('\n')),
        `Total: ${folderInfo.reduce((sum, f) => sum + f.noteCount, 0)} notes across ${folderInfo.length} folders`,
      ].join('\n');

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: content,
          },
        ],
      };
    }

    // Handle kerio://notes/{folderName}
    const notesMatch = uri.match(/^kerio:\/\/notes\/(.+)$/);
    if (notesMatch) {
      const folderName = decodeURIComponent(notesMatch[1]);
      const result = await notesList(client, { folder: folderName, limit: -1 });

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: result,
          },
        ],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: 'text/plain',
          text: `Error reading resource: ${errorMessage}`,
        },
      ],
    };
  }
});

/**
 * Start the server
 */
async function main() {
  try {
    console.error('[Server] Starting Kerio MCP Server...');
    console.error('[Server] Configuration loaded successfully');
    console.error('[Server] Server:', config.server);
    console.error('[Server] Username:', config.username);
    console.error('');

    // Test authentication immediately
    console.error('[Server] Testing authentication...');
    try {
      await client.ensureAuthenticated();
      console.error('[Server] ✅ Authentication successful!');

      // Optionally test folder access
      const folders = await client.getNoteFolders();
      console.error(`[Server] ✅ Found ${folders.length} note folder(s)`);
      folders.forEach(folder => {
        console.error(`[Server]    - ${folder.name}`);
      });
    } catch (authError) {
      console.error('[Server] ❌ Authentication failed!');
      console.error('[Server] Error:', authError instanceof Error ? authError.message : String(authError));
      console.error('');
      console.error('[Server] Please check your credentials:');
      console.error('[Server]   - KERIO_SERVER:', config.server);
      console.error('[Server]   - KERIO_USERNAME:', config.username);
      console.error('[Server]   - KERIO_PASSWORD: [hidden]');
      console.error('');
      process.exit(1);
    }

    console.error('');
    console.error('[Server] Starting MCP server...');
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[Server] ✅ Kerio MCP Server running');
    console.error('[Server] Ready to accept requests');
  } catch (error) {
    console.error('[Server] ❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.error('[Server] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Server] Shutting down...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});
