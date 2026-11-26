import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, 'mcp', 'index.js')],
    cwd: projectRoot,
  });

  const client = new Client(
    { name: 'luminaread-mcp-test', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  const toolsResult = await client.listTools();
  const toolNames = toolsResult.tools.map((t) => t.name).sort();
  console.log(`MCP tools discovered (${toolNames.length}):`, toolNames.join(', '));
  assert.equal(toolNames.length, 13, 'Expected 13 MCP tools');

  const statsRes = await client.callTool({ name: 'get_study_stats', arguments: {} });
  const statsJson = JSON.parse(statsRes.content[0].text);
  console.log('MCP get_study_stats:', JSON.stringify(statsJson.stages));
  const totalArticles = statsJson.stages.reduce((acc, s) => acc + s.total, 0);
  assert.ok(totalArticles >= 90, `Expected >= 90 articles, got ${totalArticles}`);

  const listRes = await client.callTool({
    name: 'list_articles',
    arguments: { stage: 3, limit: 5 },
  });
  const listJson = JSON.parse(listRes.content[0].text);
  assert.equal(listJson.articles.length, 5, 'Expected 5 stage-3 articles');
  console.log('MCP list_articles(stage=3) sample:', listJson.articles[0].title);

  const resourcesRes = await client.listResources();
  console.log('MCP resources:', resourcesRes.resources.map((r) => r.uri).join(', '));
  assert.ok(resourcesRes.resources.length >= 2);

  await client.close();
  console.log('MCP stdio integration test PASSED!');
}

main().catch((err) => {
  console.error('MCP test FAILED:', err);
  process.exit(1);
});
