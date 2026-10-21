require('dotenv').config();
const providers = require('../config/providers.json');
const { SYSTEM_PROMPT } = require('../nlq/systemPrompt');
const adapters = {
  openaiCompatible: require('../nlq/providers/openaiCompatible').translateToIntent,
  gemini: require('../nlq/providers/gemini').translateToIntent
};

const TEST_PROMPT = 'Who topped 3rd sem in ece-28?';

async function testAll() {
  console.log('Testing all configured AI providers...\n');
  console.log(`Prompt: "${TEST_PROMPT}"\n`);
  console.log('----------------------------------------------------------------------');

  for (const provider of providers) {
    const key = process.env[provider.apiKeyEnv];
    const keyStatus = key ? 'Found' : 'MISSING';
    process.stdout.write(`Testing [${provider.name}] (${provider.adapter}, model: ${provider.model || 'default'}, key: ${keyStatus})... `);

    if (!key) {
      console.log('SKIPPED (No API key in .env)');
      continue;
    }

    const adapterFn = adapters[provider.adapter];
    if (!adapterFn) {
      console.log('FAILED: No adapter found for ' + provider.adapter);
      continue;
    }

    const start = Date.now();
    try {
      const result = await adapterFn(TEST_PROMPT, provider);
      const elapsed = Date.now() - start;
      console.log(`[PASS] SUCCESS in ${elapsed}ms`);
      console.log('   Response:', JSON.stringify(result));
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`[FAIL] FAILED in ${elapsed}ms`);
      console.log(`   Error: ${err.message}`);
    }
    console.log('----------------------------------------------------------------------');
  }
}

testAll();
