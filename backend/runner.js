const fs = require('fs');
const path = require('path');
const https = require('https');

// JDoodle Configuration
const JDOODLE_LANG_MAP = {
  'python': { language: 'python3', versionIndex: '0' },
  'java': { language: 'java', versionIndex: '0' },
  'cpp': { language: 'cpp', versionIndex: '0' },
  'c++': { language: 'cpp', versionIndex: '0' }
};

let credentials = {
  id1: '',
  secret1: '',
  id2: '',
  secret2: ''
};

try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        const value = trimmed.substring(index + 1).trim();
        if (key === 'Client_ID1') {
          credentials.id1 = value;
        } else if (key === 'Client_Secret1') {
          credentials.secret1 = value;
        } else if (key === 'Client_ID2') {
          credentials.id2 = value;
        } else if (key === 'Client_Secret2') {
          credentials.secret2 = value;
        }
      }
    }
  }
} catch (err) {
  console.error('Failed to load credentials from .env:', err);
}

// Support process.env fallbacks if keys are not defined in .env
credentials.id1 = credentials.id1 || process.env.Client_ID1 || '';
credentials.secret1 = credentials.secret1 || process.env.Client_Secret1 || '';
credentials.id2 = credentials.id2 || process.env.Client_ID2 || '';
credentials.secret2 = credentials.secret2 || process.env.Client_Secret2 || '';

/**
 * Execute code using JDoodle API with specified credentials
 */
function runWithJDoodleCredentials(language, code, input, clientId, clientSecret, callback) {
  const mapped = JDOODLE_LANG_MAP[language.toLowerCase()];
  if (!mapped) {
    callback({ status: 'Error', error: `Unsupported language: ${language}` });
    return;
  }

  if (!clientId || !clientSecret) {
    callback({ status: 'Error', error: 'JDoodle credentials not configured' });
    return;
  }

  const payload = {
    clientId: clientId,
    clientSecret: clientSecret,
    script: code,
    language: mapped.language,
    versionIndex: mapped.versionIndex,
    stdin: input || ''
  };

  const dataString = JSON.stringify(payload);
  const options = {
    hostname: 'api.jdoodle.com',
    path: '/v1/execute',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataString)
    },
    timeout: 10000
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('JDOODLE RAW RESPONSE:', body);
      try {
        const response = JSON.parse(body);

        if (response.error) {
          callback({
            status: 'Error',
            error: response.error,
            statusCode: response.statusCode || res.statusCode
          });
          return;
        }

        if (response.statusCode && response.statusCode !== 200) {
          callback({
            status: 'Error',
            error: response.error || `JDoodle API returned status code ${response.statusCode}`,
            statusCode: response.statusCode
          });
          return;
        }

        const isCompilationError = response.output && (
          response.output.includes('error:') ||
          response.output.includes('Error:') ||
          response.output.includes('Compilation failed')
        );

        callback({
          status: isCompilationError ? 'Compilation Error' : 'Success',
          output: response.output || '',
          memory: response.memory,
          cpuTime: response.cpuTime
        });
      } catch (err) {
        callback({ status: 'Error', error: 'Failed to parse JDoodle execution response', statusCode: res.statusCode });
      }
    });
  });

  req.on('error', (err) => {
    callback({ status: 'Error', error: `JDoodle connection failed: ${err.message}` });
  });

  req.on('timeout', () => {
    req.destroy();
    callback({ status: 'Timeout', error: 'JDoodle execution request timed out' });
  });

  req.write(dataString);
  req.end();
}

/**
 * Main execution router
 */
function runCode(language, code, input, callback) {
  runWithJDoodleCredentials(language, code, input, credentials.id1, credentials.secret1, (result) => {
    const isQuotaError = result.status === 'Error' && (
      result.statusCode === 429 ||
      result.statusCode === 401 ||
      (result.error && (
        result.error.toLowerCase().includes('limit') ||
        result.error.toLowerCase().includes('quota') ||
        result.error.toLowerCase().includes('credit')
      ))
    );

    if (isQuotaError && credentials.id2 && credentials.secret2) {
      console.log('Quota/limit hit with primary credentials, falling back to secondary credentials...');
      runWithJDoodleCredentials(language, code, input, credentials.id2, credentials.secret2, callback);
    } else {
      callback(result);
    }
  });
}

module.exports = {
  runCode
};
