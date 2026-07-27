const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Create temp directory for local fallback execution
const tempDir = path.join(__dirname, 'temp_exec');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// RapidAPI Judge0 Configuration
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'judge0-ce.p.rapidapi.com';

// Judge0 Language IDs
const JUDGE0_LANG_IDS = {
  'python': 71,
  'java': 62,
  'cpp': 54,
  'c++': 54
};

// Piston local configuration
const PISTON_LOCAL_URL = 'http://localhost:2000/api/v2/execute';
const PISTON_LANG_MAP = {
  'python': { language: 'python', version: '*', filename: 'main.py' },
  'java': { language: 'java', version: '*', filename: 'Main.java' },
  'cpp': { language: 'c++', version: '*', filename: 'main.cpp' },
  'c++': { language: 'c++', version: '*', filename: 'main.cpp' }
};

/**
 * Attempt to execute code using local Piston Docker container (port 2000)
 */
function runWithLocalPiston(language, code, input, callback, fallback) {
  const mapped = PISTON_LANG_MAP[language.toLowerCase()];
  if (!mapped) {
    fallback();
    return;
  }

  const payload = {
    language: mapped.language,
    version: mapped.version,
    files: [
      {
        name: mapped.filename,
        content: code
      }
    ],
    stdin: input || ''
  };

  const dataString = JSON.stringify(payload);
  const options = {
    hostname: 'localhost',
    port: 2000,
    path: '/api/v2/execute',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataString)
    },
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        const response = JSON.parse(body);
        
        // If it's a Piston success/run response
        if (response.run) {
          if (response.compile && response.compile.code !== 0) {
            callback({
              status: 'Compilation Error',
              error: response.compile.output || response.compile.stderr || 'Compilation failed'
            });
          } else if (response.run.code !== 0) {
            callback({
              status: 'Runtime Error',
              error: response.run.stderr || response.run.output || `Process exited with code ${response.run.code}`,
              output: response.run.stdout
            });
          } else {
            callback({
              status: 'Success',
              output: response.run.stdout
            });
          }
        } else {
          // If response format was unexpected, trigger fallback
          fallback();
        }
      } catch (err) {
        fallback();
      }
    });
  });

  req.on('error', () => {
    // Port 2000 is likely closed (Docker container is not running), trigger fallback
    fallback();
  });

  req.write(dataString);
  req.end();
}

/**
 * Execute Python code locally using child_process
 */
function runPythonLocally(code, input, callback) {
  const filename = path.join(tempDir, `run_${Date.now()}.py`);
  fs.writeFileSync(filename, code);

  let pyProcess = spawn('python', [filename]);
  let output = '';
  let errorOutput = '';
  let finished = false;

  const timeoutId = setTimeout(() => {
    if (!finished) {
      finished = true;
      try { pyProcess.kill(); } catch (e) {}
      cleanupFile(filename);
      callback({ status: 'Timeout', error: 'Execution Timed Out (Limit: 5s)' });
    }
  }, 5000);

  pyProcess.on('error', (err) => {
    if (err.code === 'ENOENT') {
      pyProcess = spawn('python3', [filename]);
      setupProcessHandlers(pyProcess, filename, input, callback, timeoutId);
    } else {
      clearTimeout(timeoutId);
      cleanupFile(filename);
      callback({ status: 'Error', error: `Local python spawn failed: ${err.message}` });
    }
  });

  if (pyProcess.pid) {
    setupProcessHandlers(pyProcess, filename, input, callback, timeoutId);
  }
}

function setupProcessHandlers(processInstance, filename, input, callback, timeoutId) {
  let output = '';
  let errorOutput = '';
  let finished = false;

  if (input && processInstance.stdin) {
    processInstance.stdin.write(input);
    processInstance.stdin.end();
  }

  processInstance.stdout.on('data', (data) => {
    output += data.toString();
  });

  processInstance.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  processInstance.on('close', (code) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    cleanupFile(filename);

    if (code !== 0) {
      callback({
        status: 'Runtime Error',
        error: errorOutput || `Process exited with code ${code}`,
        output: output
      });
    } else {
      callback({
        status: 'Success',
        output: output
      });
    }
  });
}

function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {}
}

/**
 * Execute code using Judge0 via RapidAPI
 */
function runWithJudge0(languageId, code, input, callback) {
  const payload = {
    source_code: code,
    language_id: languageId,
    stdin: input || ''
  };

  const dataString = JSON.stringify(payload);
  const options = {
    hostname: RAPIDAPI_HOST,
    path: '/submissions?wait=true',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataString),
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    },
    timeout: 8000
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        const response = JSON.parse(body);
        const statusId = response.status?.id;
        const statusDesc = response.status?.description || 'Unknown Error';
        
        if (statusId === 3) {
          callback({ status: 'Success', output: response.stdout || '' });
        } else if (statusId === 6) {
          callback({ status: 'Compilation Error', error: response.compile_output || 'Compilation failed' });
        } else if (statusId === 5) {
          callback({ status: 'Timeout', error: 'Time Limit Exceeded (Judge0 Limit)' });
        } else {
          callback({
            status: 'Runtime Error',
            error: response.stderr || response.message || statusDesc,
            output: response.stdout || ''
          });
        }
      } catch (err) {
        callback({ status: 'Error', error: 'Failed to parse Judge0 API response' });
      }
    });
  });

  req.on('error', (err) => {
    callback({ status: 'Error', error: `Judge0 API request failed: ${err.message}` });
  });

  req.write(dataString);
  req.end();
}

/**
 * Main execution router
 */
function runCode(language, code, input, callback) {
  const lang = language.toLowerCase();
  
  // 1. If RapidAPI Key is configured, prioritize Judge0 execution (handles Python, C++, Java securely)
  if (RAPIDAPI_KEY && RAPIDAPI_KEY !== 'YOUR_RAPIDAPI_KEY') {
    const judge0Id = JUDGE0_LANG_IDS[lang];
    if (judge0Id) {
      runWithJudge0(judge0Id, code, input, callback);
      return;
    }
  }

  // 2. Try local Piston Docker container next
  runWithLocalPiston(language, code, input, callback, () => {
    // 3. Local Fallback: Run Python locally since user has Python installed
    if (lang === 'python') {
      runPythonLocally(code, input, callback);
      return;
    }

    // 4. For C++ or Java without key/Piston Docker container, return setup instructions
    callback({
      status: 'Compilation Error',
      error: `To execute C++ or Java code, please either:\n` +
             `1. Start Piston locally in Docker (runs on port 2000).\n` +
             `2. Configure a free Judge0 API key in your backend environment.\n\n` +
             `Note: Python runs locally out-of-the-box because Python is installed on your computer!`
    });
  });
}

module.exports = {
  runCode
};
