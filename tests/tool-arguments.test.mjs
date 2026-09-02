import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeToolArguments } from '../dist/tool-arguments.js';
import {
  CalendarsCreateSchema,
  CalendarsListSchema,
  MailsDraftSchema,
  MailsMarkReadSchema,
  getToolDefinitions,
} from '../dist/tools.js';

const schemaFor = (name) => {
  const definition = getToolDefinitions(true).find((tool) => tool.name === name);
  assert.ok(definition, `Missing tool definition: ${name}`);
  return definition.inputSchema;
};

test('normalizes Qwen-style numeric arguments using the advertised tool schema', () => {
  const raw = { limit: '5' };
  const normalized = normalizeToolArguments(raw, schemaFor('calendars_list'));

  assert.deepEqual(normalized, { limit: 5 });
  assert.deepEqual(CalendarsListSchema.parse(normalized), { limit: 5 });
  assert.deepEqual(raw, { limit: '5' });
});

test('normalizes double-serialized arrays in draft arguments', () => {
  const normalized = normalizeToolArguments(
    {
      to: '["timon@example.com"]',
      subject: 'MCP-Test',
      body: 'Danke für den Test.',
    },
    schemaFor('mails_save_draft')
  );

  assert.deepEqual(normalized.to, ['timon@example.com']);
  assert.deepEqual(MailsDraftSchema.parse(normalized).to, ['timon@example.com']);
});

test('normalizes booleans and arrays while preserving ordinary string values', () => {
  const normalized = normalizeToolArguments(
    {
      mailIds: '["mail-1","mail-2"]',
      read: 'false',
    },
    schemaFor('mails_mark_read')
  );

  assert.deepEqual(normalized, {
    mailIds: ['mail-1', 'mail-2'],
    read: false,
  });
  assert.deepEqual(MailsMarkReadSchema.parse(normalized), normalized);
});

test('normalizes mixed calendar creation types', () => {
  const normalized = normalizeToolArguments(
    {
      summary: 'Qwen MCP test',
      start: '2026-09-02T10:00:00',
      end: '2026-09-02T10:30:00',
      reminderMinutes: '15',
      isAllDay: 'false',
      isPrivate: 'true',
      interval: '2',
    },
    schemaFor('calendars_create')
  );

  const parsed = CalendarsCreateSchema.parse(normalized);
  assert.equal(parsed.reminderMinutes, 15);
  assert.equal(parsed.isAllDay, false);
  assert.equal(parsed.isPrivate, true);
  assert.equal(parsed.interval, 2);
});

test('leaves invalid coercion candidates for downstream validation', () => {
  const normalized = normalizeToolArguments(
    { limit: 'five', startDate: '2026-09-01T00:00:00' },
    schemaFor('calendars_list')
  );

  assert.equal(normalized.limit, 'five');
  assert.throws(() => CalendarsListSchema.parse(normalized));
});
