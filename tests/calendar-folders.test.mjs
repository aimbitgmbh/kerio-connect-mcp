import assert from 'node:assert/strict';
import test from 'node:test';

import { KerioClient } from '../dist/client.js';
import { calendarsList } from '../dist/tools.js';

const calendar = (id, overrides = {}) => ({
  id,
  name: id,
  type: 'FCalendar',
  ...overrides,
});

const createClient = () => new KerioClient({
  server: 'https://example.test',
  username: 'user@example.test',
  password: 'secret',
});

test('aggregates personal, shared, remote, and public calendar folders', async () => {
  const client = createClient();
  const calls = [];

  client.jsonRpcRequest = async (method, params) => {
    calls.push([method, params]);
    if (method === 'Folders.get') {
      return { list: [calendar('personal'), calendar('mail', { type: 'FMail' })] };
    }
    if (method === 'Folders.getSharedMailboxList') {
      return {
        mailboxes: [
          {
            mailboxId: 'local-root',
            isLoaded: true,
            folders: [calendar('local-shared'), calendar('duplicate')],
          },
          {
            mailboxId: 'remote-root',
            isLoaded: false,
            folders: [calendar('ignored-until-loaded')],
          },
        ],
      };
    }
    if (method === 'Folders.getShared') {
      return { list: [calendar('remote-shared'), calendar('duplicate')] };
    }
    if (method === 'Folders.getPublic') {
      return { list: [calendar('public'), calendar('duplicate')] };
    }
    throw new Error(`Unexpected method: ${method}`);
  };

  const folders = await client.getCalendarFolders();

  assert.deepEqual(
    folders.map((folder) => folder.id),
    ['personal', 'local-shared', 'duplicate', 'remote-shared', 'public']
  );
  assert.deepEqual(
    calls.find(([method]) => method === 'Folders.getShared')?.[1],
    { mailboxId: 'remote-root' }
  );
});

test('keeps personal calendars when optional folder APIs are unavailable', async () => {
  const client = createClient();
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    client.jsonRpcRequest = async (method) => {
      if (method === 'Folders.get') return { list: [calendar('personal')] };
      throw new Error('Unsupported API');
    };

    const folders = await client.getCalendarFolders();
    assert.deepEqual(folders.map((folder) => folder.id), ['personal']);
  } finally {
    console.error = originalConsoleError;
  }
});

test('rejects ambiguous calendar names and lists unambiguous selectors', async () => {
  let requestedFolderIds;
  const client = {
    getCalendarFolders: async () => [
      calendar('alice-calendar', {
        name: 'Calendar',
        ownerName: 'Alice',
        emailAddress: 'alice@example.test',
      }),
      calendar('bob-calendar', {
        name: 'Calendar',
        ownerName: 'Bob',
        emailAddress: 'bob@example.test',
      }),
    ],
    getOccurrences: async (folderIds) => {
      requestedFolderIds = folderIds;
      return [];
    },
  };

  const result = await calendarsList(client, { folder: 'Calendar' });

  assert.match(result, /ambiguous/i);
  assert.match(result, /alice@example\.test\/Calendar \[alice-calendar\]/);
  assert.match(result, /bob@example\.test\/Calendar \[bob-calendar\]/);
  assert.equal(requestedFolderIds, undefined);
});

test('selects shared calendars by qualified name or folder ID', async () => {
  const selected = [];
  const client = {
    getCalendarFolders: async () => [
      calendar('alice-calendar', {
        name: 'Calendar',
        ownerName: 'Alice',
        emailAddress: 'alice@example.test',
      }),
      calendar('bob-calendar', {
        name: 'Calendar',
        ownerName: 'Bob',
        emailAddress: 'bob@example.test',
      }),
    ],
    getOccurrences: async (folderIds) => {
      selected.push(folderIds);
      return [];
    },
  };

  await calendarsList(client, { folder: 'alice@example.test/Calendar' });
  await calendarsList(client, { folder: 'Bob/Calendar' });
  await calendarsList(client, { folder: 'bob-calendar' });

  assert.deepEqual(selected, [
    ['alice-calendar'],
    ['bob-calendar'],
    ['bob-calendar'],
  ]);
});
