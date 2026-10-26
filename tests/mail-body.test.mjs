import assert from 'node:assert/strict';
import test from 'node:test';

import { KerioClient } from '../dist/client.js';
import { MailBodyPageSize, mailsGet, mailsSaveDraft, mailsSend, mailsUpdateDraft } from '../dist/tools.js';

const createClient = (body = '') => {
  const client = new KerioClient({
    server: 'https://example.test',
    username: 'user@example.test',
    password: 'secret',
  });
  const bodies = [];

  client.getMailById = async (mailId) => ({
    id: mailId,
    from: { address: 'sender@example.test' },
    subject: 'Request',
    displayableParts: [{ contentType: 'ctTextPlain', content: body }],
  });
  client.sendMail = async (to, subject, mailBody) => { bodies.push(mailBody); };
  client.saveDraft = async (to, subject, mailBody) => { bodies.push(mailBody); };
  client.updateDraft = async (draftId, updates) => { bodies.push(updates.body); };

  return { client, bodies };
};

test('reads a mail body completely instead of cutting it at 2000 characters', async () => {
  const { client } = createClient(`Start ${'x'.repeat(5000)} end of mail`);

  const output = await mailsGet(client, { mailId: 'mail-1' });

  assert.match(output, /end of mail$/);
});

test('continues a very long mail body with an offset', async () => {
  const { client } = createClient(`Start ${'x'.repeat(30000)} end of mail`);

  const firstPage = await mailsGet(client, { mailId: 'mail-1' });
  const secondPage = await mailsGet(client, { mailId: 'mail-1', offset: MailBodyPageSize });

  assert.match(firstPage, new RegExp(`call mails_get with offset ${MailBodyPageSize} for the rest`));
  assert.match(secondPage, /end of mail$/);
});

test('keeps line breaks in bodies with inline markup', async () => {
  const { client, bodies } = createClient();

  await mailsSend(client, { to: ['a@example.test'], subject: 'Hi', body: 'Hi,\n<b>Status</b>\nDone.' });
  await mailsSaveDraft(client, { to: ['a@example.test'], subject: 'Hi', body: 'Hi,\n<b>Status</b>\nDone.' });
  await mailsUpdateDraft(client, { draftId: 'draft-1', body: 'Hi,\n<b>Status</b>\nDone.' });

  bodies.forEach((body) => {
    assert.equal(body, '<html><body>Hi,<br>\n<b>Status</b><br>\nDone.</body></html>');
  });
});

test('escapes plain text and leaves block-level HTML as written', async () => {
  const { client, bodies } = createClient();

  await mailsSaveDraft(client, { to: ['a@example.test'], subject: 'Hi', body: 'a < b\nc' });
  await mailsSaveDraft(client, { to: ['a@example.test'], subject: 'Hi', body: '<p>Hi,</p>\n<p>Done.</p>' });

  assert.deepEqual(bodies, [
    '<html><body>a &lt; b<br>\nc</body></html>',
    '<html><body><p>Hi,</p>\n<p>Done.</p></body></html>',
  ]);
});
