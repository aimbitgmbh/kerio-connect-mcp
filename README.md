# Kerio Connect MCP Server

[![NPM Version](https://img.shields.io/npm/v/@aimbitgmbh/kerio-connect-mcp)](https://www.npmjs.com/package/@aimbitgmbh/kerio-connect-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server providing programmatic access to Kerio Connect for Mail, Calendar, Contacts, Tasks, and Notes management.

**Tested and optimized for gpt-oss:20b**

## Prerequisites

- Node.js >= 18.0.0
- Kerio Connect server with API access
- Valid Kerio Connect credentials (email and password)

## Features

- Mail management (read, search, send, draft, move, organize)
- Calendar events with recurrence support
- Contact management with full vCard support
- Task management
- Notes organization
- Dynamic folder discovery
- Full-text search across modules
- TypeScript implementation with Zod validation

## Installation

### NPM Package

```bash
npx @aimbitgmbh/kerio-connect-mcp
```

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "kerio-connect": {
      "command": "npx",
      "args": ["-y", "@aimbitgmbh/kerio-connect-mcp"],
      "env": {
        "KERIO_SERVER": "https://mail.example.com",
        "KERIO_USERNAME": "your-email@example.com",
        "KERIO_PASSWORD": "your-password"
      }
    }
  }
}
```

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `KERIO_SERVER` | Kerio Connect server URL (e.g., https://mail.example.com) |
| `KERIO_USERNAME` | Your email address |
| `KERIO_PASSWORD` | Your password |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KERIO_VERIFY_SSL` | Verify SSL certificates | `false` |
| `KERIO_ENABLE_SEND` | Enable email sending without review | `false` |

**Note:** Email sending is disabled by default for safety. When disabled, the server creates drafts only.

### Environment File Example

Create a `.env` file in the project root:

```bash
# Kerio Connect server URL (required)
KERIO_SERVER=https://mail.example.com

# Your email address (required)
KERIO_USERNAME=your-email@example.com

# Your password (required)
KERIO_PASSWORD=your-password-here

# Verify SSL certificates (optional, default: false)
KERIO_VERIFY_SSL=false

# Enable email sending without manual review (optional, default: false)
KERIO_ENABLE_SEND=false
```

## Available Tools

### Mail Module
- `mails_list` - List emails with filtering
- `mails_get` - Get email by ID with full content
- `mails_show_recent` - View recent emails
- `mails_search` - Full-text search
- `mails_send` - Send email (requires KERIO_ENABLE_SEND=true)
- `mails_save_draft` - Create draft email
- `mails_update_draft` - Edit draft
- `mails_move` - Move emails to folder
- `mails_mark_read` - Mark as read/unread
- `mails_flag` - Flag/unflag emails
- `mails_delete` - Delete emails

### Calendar Module
- `calendars_list` - List events with date filtering
- `calendars_search` - Search events
- `calendars_create` - Create events with recurrence
- `calendars_update` - Update event details
- `calendars_delete` - Delete events

Calendar discovery includes personal, shared, and public calendars. When multiple
calendars have the same name, select one with `owner/calendar`,
`owner-email/calendar`, or its full folder ID.

### Contacts Module
- `contacts_list` - List contacts
- `contacts_get` - Get contact details
- `contacts_create` - Create contact
- `contacts_update` - Update contact
- `contacts_search` - Search contacts
- `contacts_delete` - Delete contact

### Tasks Module
- `tasks_list` - List tasks
- `tasks_create` - Create task
- `tasks_complete` - Mark complete
- `tasks_update` - Update task
- `tasks_search` - Search tasks
- `tasks_delete` - Delete task

### Notes Module
- `notes_list` - List notes
- `notes_search` - Search notes
- `notes_count` - Count notes
- `notes_create` - Create note
- `notes_move` - Move note
- `notes_update` - Edit note
- `notes_delete` - Delete note

### Folder Management
- `folders_list` - List all folders
- `folders_create` - Create folder

## Architecture

### Project Structure

```
kerio-connect-mcp/
├── src/
│   ├── index.ts       # MCP server
│   ├── client.ts      # Kerio API client
│   ├── config.ts      # Configuration
│   ├── tools.ts       # Tool definitions
│   └── types.ts       # Type definitions
└── dist/              # Compiled output
```

## Troubleshooting

### Configuration Validation Failed

Ensure all required environment variables are set:
- `KERIO_SERVER`
- `KERIO_USERNAME`
- `KERIO_PASSWORD`

### Invalid Credentials

Verify that your username is your full email address and test login via the Kerio Connect web interface.

### SSL Certificate Errors

For self-signed certificates, set `KERIO_VERIFY_SSL=false`.

### Session Expired

The server automatically re-authenticates. If errors persist, verify credentials are valid and the server is accessible.

## Security

- Credentials passed via environment variables only
- Email sending disabled by default
- Server binds to localhost via stdio
- Configurable SSL certificate verification
- Automatic session management

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue for bugs, feature requests, or improvements.

## License

MIT © 2025 [aimbit GmbH](https://aimbit.de)

See [LICENSE](LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/aimbitgmbh/kerio-connect-mcp)
- [Report Issues](https://github.com/aimbitgmbh/kerio-connect-mcp/issues)
- [npm Package](https://www.npmjs.com/package/@aimbitgmbh/kerio-connect-mcp)
- [aimbit GmbH](https://aimbit.de)
- [Model Context Protocol](https://modelcontextprotocol.io/)
