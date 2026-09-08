// Render the released property inspector in isolated SSApp Electron windows.
// Stream Deck settings messages use a local fixture; no real session is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ssapp = process.env.SSAPP_REPO || path.resolve(__dirname, '../../../../ssapp');
const { _electron } = require('playwright');
const { WebSocketServer } = require(path.join(ssapp, 'node_modules/ws'));
const bundle = process.env.SSN_STREAMDECK_BUNDLE || path.resolve(__dirname, '../ninja.socialstream.streamdeck.sdPlugin');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ssn-inspector-qa-'));
const messages = [], errors = [];
const globals = { sessionId: 'isolated-inspector-qa', transport: 'websocket', apiHost: '127.0.0.1', useTls: false, inChannel: 2, outChannel: 1 };
const items = [{ name: 'QA print <safe>', url: 'https://example.com/print' }, { name: 'QA support', url: 'https://example.com/support' }];
const registry = fs.readFileSync(path.resolve(__dirname,'../src/api/command-registry.ts'),'utf8');
const capabilities = { version: 2, ssn: { available: true, actions: {} }, ssapp: { available: true } };
for (const line of registry.split('\n')) {
 const id = line.match(/\{ id: "([^"]+)"/);
 if (!id) continue;
 if (line.includes('scope: "ssn"')) capabilities.ssn.actions[id[1]]=true;
 const route=line.match(/capabilityPath: \["([^"]+)", "([^"]+)"\]/);
 if(route) { capabilities.ssapp[route[1]] ||= {}; capabilities.ssapp[route[1]][route[2]]=true; }
}
let app;
(async () => {
 const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
 await new Promise(r => server.once('listening', r));
 server.on('connection', socket => socket.on('message', raw => {
  const m = JSON.parse(raw); messages.push(m);
  const reply = payload => socket.send(JSON.stringify({ event: 'sendToPropertyInspector', payload }));
  if (m.event === 'getGlobalSettings') socket.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: globals } }));
  if (m.event === 'sendToPlugin') {
   if (m.payload.type === 'requestStatus' || m.payload.type === 'testConnection') reply({ type: 'status', ok: true, state: 'connected', message: 'Connection verified.', capabilities, diagnostics: { pluginVersion: '0.2.3.10', state: 'connected', transport: 'websocket' } });
   if (m.payload.type === 'requestSources') reply({ type: 'sources', sources: [{ id: 'qa-source', target: 'youtube', username: 'Isolated fixture', status: 'active', tabId: 1 }] });
   if (m.payload.type === 'requestCommerce') reply({ type: 'commerce', result: { ok: true, payload: { commerce: { mode: 'pinned', selected: items[0], items } } } });
  }
 }));
 try {
  const wrapper = path.join(profile, 'bootstrap.cjs');
  fs.writeFileSync(wrapper, `const {app}=require('electron');app.setAppPath(${JSON.stringify(ssapp)});app.on('session-created',s=>s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>cb({cancel:!['localhost','127.0.0.1'].includes(new URL(d.url).hostname)})));require(${JSON.stringify(path.join(ssapp,'bootstrap.js'))});`);
  app = await _electron.launch({ executablePath: path.join(ssapp,'node_modules/electron/dist/electron.exe'), args: [wrapper,'--running-from-source','--multiinstance','--ssapp-headless-control','--no-hwa'], cwd: ssapp, env: { ...process.env, SSAPP_USER_DATA_DIR: profile, SSAPP_DIAGNOSTICS_SAFE_GPU: '1' } });
  const languages = ['en','de','es','fr','ja','ko','zh_CN','zh_TW'];
  const kinds = { command: 'commandSettings', 'custom-command': 'customSettings', 'timer-dial': 'timerSettings', 'chat-feed': 'chatFeedSettings', connection: 'setupDetails' };
  let presets = 0;
  for (const language of languages) {
   const opened = app.waitForEvent('window');
   await app.evaluate(({BrowserWindow}, url) => { const w = new BrowserWindow({ width: 350, height: 850, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } }); w.loadURL(url); }, pathToFileURL(path.join(bundle,'ui/action-settings.html')).href);
   const page = await opened; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
   await page.waitForFunction(() => typeof connectElgatoStreamDeckSocket === 'function');
   await page.evaluate(({port,language}) => connectElgatoStreamDeckSocket(port,'qa-inspector','registerPropertyInspector',JSON.stringify({application:{language}}),JSON.stringify({action:'ninja.socialstream.streamdeck.command',context:'qa-key',payload:{settings:{command:'commerceShow'}}})),{port:server.address().port,language});
   await page.waitForFunction(() => document.querySelectorAll('#commerceProduct option').length === 3);
   assert.equal(await page.locator('#commerceProduct option').nth(1).textContent(),items[0].name);
   await page.locator('#commerceProduct').selectOption(items[1].url);
   assert.equal(await page.locator('#value').inputValue(),items[1].url);
   await page.waitForFunction(() => document.querySelector('#commandAwaitResponse').disabled);
   await page.locator('#refreshCommerce').click();
   assert.equal(await page.locator('#commerceProduct').inputValue(),items[1].url);
   const commands = await page.locator('#command option:not([disabled])').evaluateAll(es => es.map(e=>e.value));
   assert.equal(commands.length,69,'All advertised presets must be selectable');
   presets = Math.max(presets,commands.length);
   for (const command of commands) {
    await page.locator('#command').selectOption(command);
    assert.equal(await page.locator('#command').inputValue(),command);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),language+' overflow at '+command);
   }
   for (const [kind,panel] of Object.entries(kinds)) {
    await page.evaluate(kind => { actionUuid='ninja.socialstream.streamdeck.'+kind; actionSettings={}; renderActionSettings(); },kind);
    assert(await page.locator('#'+panel).isVisible(),language+' missing '+kind);
    if (kind==='custom-command') { await page.locator('#customAction').fill('gettimerstate'); await page.locator('#customTitle').fill('QA custom'); await page.locator('#customTitle').blur(); }
    if (kind==='timer-dial') { await page.locator('#timerStep').fill('15'); await page.locator('#timerStep').blur(); }
    if (kind==='chat-feed') { await page.locator('#chatFeedTitle').fill('QA chat'); await page.locator('#chatFeedTitle').blur(); }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),language+' panel overflow '+kind);
   }
   await page.locator('#setupDetails').evaluate(e=>e.open=true);
   await page.locator('#sessionId').fill('https://socialstream.ninja/dock.html?session=qa-import&password=qa-password&server');
   await page.locator('#sessionId').blur();
   assert.equal(await page.locator('#sessionId').inputValue(),'qa-import');
   assert.equal(await page.locator('#password').inputValue(),'qa-password');
   assert.equal(await page.locator('#sessionId').getAttribute('type'),'password');
   await page.locator('#showSession').click(); assert.equal(await page.locator('#sessionId').getAttribute('type'),'text');
   await page.locator('#showSession').click();
   await page.locator('#testConnection').click();
   await page.locator('#helpDetails').evaluate(e=>e.open=true);
   assert(!(await page.locator('#diagnosticsText').inputValue()).includes('qa-password'));
   console.log('Inspector passed: '+language);
   await page.close();
  }
  assert(messages.some(m=>m.event==='setSettings' && m.payload.value===items[1].url));
  assert(messages.some(m=>m.event==='setSettings' && m.payload.stepSeconds===15));
  assert(messages.some(m=>m.event==='setSettings' && m.payload.title==='QA chat'));
  assert.deepEqual(errors,[]);
  console.log('PASS: released inspector, 8 languages, 5 action panels, '+presets+' available presets, saved products, settings, session import, masking, diagnostics, narrow layouts. Profile: '+profile);
 } finally { if(app)await app.close();server.clients.forEach(s=>s.terminate());await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
