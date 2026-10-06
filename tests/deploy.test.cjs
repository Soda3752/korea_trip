const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('deployment runs the verified node test suite before upload', () => {
  const yaml = fs.readFileSync('.github/workflows/deploy.yml','utf8');
  assert.match(yaml,/actions\/setup-node@v4/);
  assert.match(yaml,/node-version: ['"]?22/);
  assert.ok(yaml.indexOf('node --test tests/*.test.cjs') > 0);
  assert.ok(yaml.indexOf('node --test tests/*.test.cjs') < yaml.indexOf('name: Upload artifact'));
});
