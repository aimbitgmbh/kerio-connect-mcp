import assert from 'node:assert/strict';

import { normalizeToolArguments } from '../dist/tool-arguments.js';
import { getToolDefinitions } from '../dist/tools.js';

const requiredEnvironment = [
  'MCP_MODEL_TEST_BASE_URL',
  'MCP_MODEL_TEST_API_KEY',
  'MCP_MODEL_TEST_MODEL',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const baseUrl = process.env.MCP_MODEL_TEST_BASE_URL.replace(/\/$/, '');
const model = process.env.MCP_MODEL_TEST_MODEL;
const definitions = getToolDefinitions(false);
const tools = definitions.map((definition) => ({
  type: 'function',
  function: definition,
}));

const scenarios = [
  {
    name: 'calendar list with numeric limit',
    prompt: 'Zeige mir meine nächsten fünf Termine aus allen Kalendern.',
    expectedTool: 'calendars_list',
    verify: (args) => assert.equal(args.limit, 5),
  },
  {
    name: 'mail search',
    prompt: 'Suche in meinen E-Mails nach Rechnungen von Contabo und gib höchstens zehn Treffer zurück.',
    expectedTool: 'mails_search',
    verify: (args) => {
      assert.equal(args.limit, 10);
      assert.match(args.query, /contabo/i);
    },
  },
  {
    name: 'mail draft with recipient array',
    prompt: 'Erstelle einen E-Mail-Entwurf an timon@example.com mit dem Betreff MCP-Test und dem Text Danke für den Test.',
    expectedTool: 'mails_save_draft',
    verify: (args) => {
      assert.deepEqual(args.to, ['timon@example.com']);
      assert.equal(args.subject, 'MCP-Test');
    },
  },
  {
    name: 'qualified shared calendar',
    prompt: 'Zeige die Termine aus Timons gemeinsamem Kalender Team für September 2026.',
    expectedTool: 'calendars_list',
    verify: (args) => {
      assert.match(args.folder, /timon/i);
      assert.match(args.folder, /team/i);
      assert.match(args.folder, /\//);
    },
  },
];

async function getToolCall(prompt) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MCP_MODEL_TEST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
      tools,
      tool_choice: 'auto',
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Model API returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  const call = body.choices?.[0]?.message?.tool_calls?.[0];
  assert.ok(call, 'Model did not return a tool call');
  return call;
}

for (const scenario of scenarios) {
  const call = await getToolCall(scenario.prompt);
  assert.equal(call.function.name, scenario.expectedTool);

  const definition = definitions.find((tool) => tool.name === call.function.name);
  assert.ok(definition, `Unknown tool returned by model: ${call.function.name}`);

  const rawArguments = typeof call.function.arguments === 'string'
    ? JSON.parse(call.function.arguments)
    : call.function.arguments;
  const args = normalizeToolArguments(rawArguments, definition.inputSchema);

  scenario.verify(args);
  console.log(`PASS ${scenario.name}: ${call.function.name}`);
}

console.log(`\n${scenarios.length} model compatibility scenarios passed with ${model}.`);
